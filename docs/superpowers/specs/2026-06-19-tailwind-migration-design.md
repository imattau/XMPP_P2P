# Tailwind Migration Design

Status: approved
Date: 2026-06-19

## Context

The `ui/` SvelteKit app (SvelteKit 2, Svelte 5, Vite 8) currently styles everything with hand-written CSS in `ui/src/app.css` (~1760 lines) using a custom design-token system (`--accent`, `--space-*`, `--radius-*`, etc. in `:root`) and BEM-ish class names (`.feed-card__head`, `.contacts-layout__list`). All markup and state live in a single 1845-line `ui/src/routes/+page.svelte` (877-line `<script>` using legacy `export let` props, ~970-line template), plus `ui/src/lib/PeerGraph.svelte` and `ui/src/lib/social-data.js`.

This migration is a prerequisite for a separate, already-discussed follow-on project: giving Chats and Feed a persistent master-detail (list + detail pane) layout on screens ≥900px, matching the pattern XMPP/messaging/social clients (Movim, Converse.js, Slack, Discord, Mastodon) use, and which this app's Contacts section (`.contacts-layout`) already does. That layout work is deliberately **out of scope** here and will get its own spec once this migration lands, so it can be built directly in Tailwind rather than written twice.

## Goal

Move the entire `ui/` styling system from hand-written CSS classes to Tailwind v4 utility classes, preserving the existing visual design and design-token values exactly, while splitting the monolithic `+page.svelte` into per-section components as part of the same pass (since every line is touched anyway).

## Non-goals

- No new layouts, breakpoints, or visual redesign — output should look identical to today, pixel-for-pixel as closely as practical.
- No master-detail / split-pane work for Chats or Feed (separate spec).
- No automated visual regression tooling stood up (accepted tradeoff — see Testing).
- No behavioral/logic changes beyond the props syntax change described below.

## Design

### 1. Foundation (no visual change)

- Add `tailwindcss` and `@tailwindcss/vite` (Tailwind v4) as dev dependencies; wire `@tailwindcss/vite` into `ui/vite.config.ts`.
- Add an `@theme` block to `ui/src/app.css` that ports every existing `:root` token into Tailwind theme variables:
  - Colors: `--color-bg`, `--color-bg-elevated`, `--color-surface`, `--color-surface-strong`, `--color-surface-soft`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--color-text-soft`, `--color-accent`, `--color-accent-strong`, `--color-accent-text`, `--color-positive`, `--color-positive-strong`, `--color-warning`.
  - Spacing: `--spacing-1` … `--spacing-10` derived from `--space-1` … `--space-10`.
  - Radius: `--radius-xl`, `--radius-lg`, `--radius-md`.
  - Fonts: `--font-display`, `--font-body`, `--font-mono`.
  - Misc tokens that don't map to a Tailwind utility namespace (`--avatar-size`, `--avatar-size-lg`, `--card-padding`, `--row-gap`, `--ease`, `--shadow`) stay as plain CSS custom properties, referenced via Tailwind arbitrary values (e.g. `w-(--avatar-size)`) where needed.
- Keep as plain CSS in `app.css` (not converted to utilities): the Google Fonts `@import`, the global resets (`*, html, body, button, input, select, textarea`), `:focus-visible`, the `@keyframes pulse` / `fadeIn` animations, `::-webkit-scrollbar` rules, and the `@media (prefers-reduced-motion: reduce)` block. These are either keyframes, pseudo-elements, or global resets that Tailwind utilities aren't suited to replace.
- Verification: `npm run build` and `npm run dev` produce a visually identical app with zero markup changes — this step only adds tooling and is structurally a no-op for rendered output.

### 2. Component extraction + utility migration

Split `ui/src/routes/+page.svelte` into:

- `ui/src/lib/components/Topbar.svelte`
- `ui/src/lib/components/BottomNav.svelte`
- `ui/src/lib/components/ContactsView.svelte`
- `ui/src/lib/components/FeedView.svelte`
- `ui/src/lib/components/ChatsView.svelte`
- `ui/src/lib/components/Composer.svelte`
- Shared primitives used across multiple sections: `ui/src/lib/components/Avatar.svelte`, `Badge.svelte`, `Pill.svelte`

`+page.svelte` becomes a shell holding cross-cutting state (`section`, `secure`, `presence`, snapshot/runtime wiring) and passing data/callbacks into the section components as props. As part of this extraction, convert each component's state declarations from legacy `export let` to Svelte 5 runes (`$props()`, `$state()`) — this is a syntax-only change with no behavioral difference, done now because the same lines are being touched anyway.

Migration order (simplest/lowest-risk first, largest/highest-risk last, so the pattern is proven before the two biggest sections):

1. Topbar
2. BottomNav
3. ContactsView (already has a working split-pane grid to use as the reference pattern)
4. FeedView
5. ChatsView
6. Composer

For each component, in order:
- Extract its markup and relevant state/handlers out of `+page.svelte` into the new file.
- Replace its custom CSS classes with Tailwind utility classes using the theme tokens from step 1.
- Delete the now-dead rules from `app.css`.
- Manually verify in the dev server at a mobile width (~390px) and a desktop width (~1280px) before moving to the next component.

### 3. Cleanup

Once all components are migrated, `ui/src/app.css` should contain only: the `@theme` block, the font `@import`, global resets, focus-visible styling, the keyframes/scrollbar/reduced-motion rules. Every BEM-ish component class (`.feed-card`, `.thread-shell`, `.composer__*`, `.roster-strip`, etc.) should be gone, replaced by Tailwind utilities in the component files.

Final pass: full manual check of Feed, Chats, Contacts, the composer sheet, and the presence/profile sheets at both breakpoints.

## Risks / edge cases

- Svelte 5's `class:` directive and `class={...}` bindings work unchanged with Tailwind utility strings — no syntax conflict.
- Bundling the runes modernization with the utility migration touches the same lines once instead of twice, but means component diffs include both class-attribute changes and prop-declaration changes in the same commit — acceptable since both are mechanical, non-behavioral changes.
- No automated visual regression tooling exists for `ui/` today; this migration does not add any. Verification is manual, per component, at two breakpoints, accepted as the tradeoff for not standing up a screenshot-diff pipeline for this work.

## Testing / verification

Manual visual pass after each component migration (mobile ~390px, desktop ~1280px) via `npm run dev` in `ui/`, plus a final full-app pass across all sections and breakpoints once the cleanup step is done. `npm run check` (svelte-check) should pass with no new errors throughout.
