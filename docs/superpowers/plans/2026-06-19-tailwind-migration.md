# Tailwind Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `ui/`'s styling from hand-written CSS classes in `ui/src/app.css` to Tailwind v4 utility classes, and split the monolithic `ui/src/routes/+page.svelte` into per-section components, with zero intended visual or behavioral change.

**Architecture:** Install Tailwind v4 via `@tailwindcss/vite`, port every `:root` design token into an `@theme` block so existing values (`--accent`, `--space-*`, `--radius-*`, fonts) become Tailwind theme vars. Then extract `+page.svelte`'s template into per-section Svelte components one at a time (Topbar → BottomNav → ContactsView → FeedView → ChatsView → Composer), converting each section's custom classes to Tailwind utilities and deleting the corresponding dead rules from `app.css` as you go, with a manual visual check at mobile and desktop widths after each.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), Vite 8, Tailwind CSS v4 (`@tailwindcss/vite` plugin, CSS-based `@theme` config — no `tailwind.config.js`).

## Global Constraints

- No visual change intended anywhere in this plan — every task's "done" bar is "looks identical to before at 390px and 1280px viewport widths."
- No new layout/breakpoint behavior — that is explicitly deferred to a separate future spec (Chats/Feed split-pane layout).
- Convert `export let` to `$props()` / `$state()` (Svelte 5 runes) in every file this plan touches — syntax-only, no behavior change.
- `npm run check` (svelte-check, run from `ui/`) must pass with no new errors after every task.
- Source of truth for what markup/state to move in each task is `ui/src/routes/+page.svelte` and `ui/src/app.css` **as they exist at the start of that task** — read the actual current line ranges before extracting, since earlier tasks shift line numbers in later ones.

---

## Task 1: Install Tailwind v4 and port design tokens

**Files:**
- Modify: `ui/package.json` (add devDependencies)
- Modify: `ui/vite.config.ts`
- Modify: `ui/src/app.css` (add `@theme` block at top)

**Interfaces:**
- Produces: Tailwind utility classes available in all `.svelte` files under `ui/src/`, with these theme tokens available as utilities:
  - Colors: `bg-bg`, `bg-bg-elevated`, `bg-surface`, `bg-surface-strong`, `bg-surface-soft`, `border-border`, `border-border-strong`, `text-text`, `text-text-muted`, `text-text-soft`, `bg-accent`/`text-accent`/`border-accent`, `bg-accent-strong`, `text-accent-text`, `text-positive`, `text-positive-strong`, `text-warning`.
  - Spacing: `p-1` … `p-10` (and `m-*`, `gap-*`, etc.) mapped to the existing `--space-1`…`--space-10` scale.
  - Radius: `rounded-xl`, `rounded-lg`, `rounded-md` mapped to `--radius-xl/lg/md`.
  - Font: `font-display`, `font-body`, `font-mono`.

- [ ] **Step 1: Add Tailwind dependencies**

Run from `ui/`:
```bash
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Wire the Vite plugin**

Read current `ui/vite.config.ts` first, then add the import and plugin entry. It should end up containing:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()]
});
```

(Keep any other existing config in the file — only add the `tailwindcss` import and prepend `tailwindcss()` to the existing `plugins` array.)

- [ ] **Step 3: Add the `@theme` block to `app.css`**

Insert this block immediately after the existing `@import url('https://fonts.googleapis.com/...')` line at the top of `ui/src/app.css`, before the existing `:root { ... }` block. Do **not** delete the existing `:root` block yet — both coexist until Task 7 cleanup, since later tasks still reference the old variable names via arbitrary values where no utility exists yet.

```css
@import 'tailwindcss';

@theme {
  --color-bg: #0c0d11;
  --color-bg-elevated: #0f1014;
  --color-surface: rgba(19, 20, 26, 0.94);
  --color-surface-strong: #171922;
  --color-surface-soft: rgba(255, 255, 255, 0.03);
  --color-border: #1e2029;
  --color-border-strong: #2a2c38;
  --color-text: #edf4fb;
  --color-text-muted: #a3aab3;
  --color-text-soft: #7f8791;
  --color-accent: #5b4bcf;
  --color-accent-strong: #a995f5;
  --color-accent-text: #c9bdfa;
  --color-positive: #5fd49a;
  --color-positive-strong: #7fd1a8;
  --color-warning: #ffb65c;

  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-3: 0.75rem;
  --spacing-4: 1rem;
  --spacing-5: 1.25rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --spacing-10: 2.5rem;

  --radius-xl: 28px;
  --radius-lg: 20px;
  --radius-md: 16px;

  --font-display: 'IBM Plex Sans', sans-serif;
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
```

- [ ] **Step 4: Verify the build is unaffected**

Run:
```bash
cd ui && npm run build
```
Expected: build succeeds with no errors. The app's rendered output is unchanged because no markup has been touched yet — this step only makes utilities available.

- [ ] **Step 5: Verify dev server still renders identically**

Run `npm run dev` in `ui/`, open the app, and confirm it looks the same as before this task (no markup changed, so this should be a no-op visually).

- [ ] **Step 6: Commit**

```bash
git add ui/package.json ui/package-lock.json ui/vite.config.ts ui/src/app.css
git commit -m "Add Tailwind v4 and port design tokens into @theme"
```

---

## Task 2: Extract Topbar component

**Files:**
- Create: `ui/src/lib/components/Topbar.svelte`
- Modify: `ui/src/routes/+page.svelte` (remove extracted markup, render `<Topbar />` instead)
- Modify: `ui/src/app.css` (delete dead rules once migrated)

**Interfaces:**
- Consumes (from `+page.svelte`'s existing state, read the current file to confirm exact names before extracting): `section`, `sectionLabels`, `feedDetailOpen`, `chatDetailOpen`, `secure`, `presence`, `presenceMessage`, the identity/profile object, and the handler functions the header buttons call (e.g. `closeFeedDetail`, the chat-detail-close inline handler, the presence sheet toggle).
- Produces: `Topbar.svelte` exporting props via `$props()` for every value above, and callback props (e.g. `onBack`, `onTogglePresence`) for the click handlers that mutate parent state, since presentational components shouldn't reach into parent state directly.

- [ ] **Step 1: Read the current Topbar markup**

Run:
```bash
sed -n '889,1062p' ui/src/routes/+page.svelte
```
Note the exact current line range (it starts at `<header class="topbar">` and ends just before the composer FAB block) and the exact classes used: `topbar`, `topbar__back`, `topbar__identity`, `topbar__copy`, `topbar__status`, `status-dot`, `status-dot--available|away|busy|dnd`, `eyebrow`.

- [ ] **Step 2: Create `Topbar.svelte` with the extracted markup, converted to Tailwind**

Use this class mapping (derived from the corresponding rules in `app.css`):

| Old class | Tailwind utilities |
|---|---|
| `.topbar` | `sticky top-0 z-8 flex items-center justify-between gap-3 -mx-3 px-3 py-[0.55rem] bg-[rgba(6,7,8,0.96)] border-b border-border` |
| `.topbar__back` | `inline-flex items-center gap-2 min-h-[2.3rem] px-[0.8rem] border border-border-strong rounded-full bg-white/[0.04] text-text text-[0.88rem] font-semibold flex-none` |
| `.topbar__identity` | `flex items-center gap-3 min-w-0` |
| `.topbar__copy` | `grid gap-[0.2rem] min-w-0` |
| `.topbar__copy strong` (name) | `font-display text-[1.05rem] leading-[1.08]` |
| `.topbar__status` | `inline-flex items-center gap-2 flex-none border-0 bg-transparent p-0 font-inherit` |
| `.status-dot` | `w-[0.65rem] h-[0.65rem] rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.04)]` |
| `.status-dot--available` | `bg-positive` (plus keep the existing `::after` pulse — see Step 3) |
| `.status-dot--away` | `bg-warning` |
| `.status-dot--busy`, `.status-dot--dnd` | `bg-[#ff8a8a]` |
| `.eyebrow` | `m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase` |

Move the markup from the line range identified in Step 1 into `Topbar.svelte`, replacing classes per the table, and using `$props()` for the inputs identified in the Interfaces block above.

- [ ] **Step 3: Keep the status-dot pulse animation in `app.css`**

The `.status-dot--available::after` pulse keyframe rule cannot be expressed as a utility (it's a pseudo-element animation). Leave it in `app.css` keyed off a class you keep using literally, e.g. add a small `.status-pulse` class applied alongside the `bg-positive` utility in the available case, and keep just this rule in `app.css`:

```css
.status-pulse {
  position: relative;
}
.status-pulse::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: inherit;
  opacity: 0.6;
  animation: pulse 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}
```//(the `@keyframes pulse` rule already exists in `app.css` near the bottom — leave it in place).

- [ ] **Step 4: Wire `Topbar.svelte` into `+page.svelte`**

In `+page.svelte`, import `Topbar` and replace the extracted line range with:
```svelte
<Topbar
  {section}
  {sectionLabels}
  {feedDetailOpen}
  {chatDetailOpen}
  {secure}
  {presence}
  {presenceMessage}
  onBack={() => (section === 'feed' ? closeFeedDetail() : (chatDetailOpen = false))}
  onTogglePresence={() => (presenceSheetOpen = !presenceSheetOpen)}
/>
```
(Adjust prop names/handlers to match whatever the actual current handler names are once you've read the file — the names above are illustrative based on the spec's known state variables `closeFeedDetail`, `chatDetailOpen`, `presenceSheetOpen`.)

- [ ] **Step 5: Delete dead CSS**

Remove `.topbar`, `.topbar__back`, `.topbar__identity`, `.topbar__copy`, `.topbar__status`, `.status-dot`, `.status-dot--available|away|busy|dnd` (replacing the pulse-specific rule with `.status-pulse` from Step 3), `.eyebrow` (only if no other section still uses the literal `.eyebrow` class — grep first: `grep -n 'class="eyebrow"' ui/src/routes/+page.svelte`; if other sections still use it, leave the rule in place until the last section using it is migrated).

- [ ] **Step 6: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 7: Manual visual check**

Run `npm run dev`, open the app, resize to ~390px and ~1280px widths, confirm the topbar (back button, identity, status dot, presence) looks identical to before this task.

- [ ] **Step 8: Commit**

```bash
git add ui/src/lib/components/Topbar.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract Topbar into its own component using Tailwind utilities"
```

---

## Task 3: Extract BottomNav component

**Files:**
- Create: `ui/src/lib/components/BottomNav.svelte`
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: `section` (current value), `setSection` (handler).
- Produces: `BottomNav.svelte` taking `section` and `onSelect(section: string)` as props.

- [ ] **Step 1: Read current markup**

```bash
sed -n '1840,1845p' ui/src/routes/+page.svelte
```
(Confirm the exact closing line — the file is 1845 lines at plan-writing time, but Task 2's edits will have shifted this; re-run `grep -n '<nav class="bottom-nav"' ui/src/routes/+page.svelte` to find the current line.)

- [ ] **Step 2: Create `BottomNav.svelte`**

Class mapping for the mobile (`<900px`, default) and desktop (`≥900px`, `md:` prefix in Tailwind's default `900px`-adjacent breakpoint — confirm Tailwind v4's default `md` is `768px` and use an arbitrary `min-[900px]:` variant instead, to match the existing `@media (min-width: 900px)` breakpoint exactly):

| Old class | Tailwind utilities |
|---|---|
| `.bottom-nav` (mobile) | `fixed left-2 right-2 bottom-2 z-10 grid grid-cols-3 gap-[0.35rem] p-[0.45rem] rounded-full bg-[rgba(5,6,7,0.94)] border border-border backdrop-blur-[20px]` |
| `.bottom-nav` (desktop, `min-[900px]:`) | `min-[900px]:relative min-[900px]:left-auto min-[900px]:right-auto min-[900px]:bottom-auto min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-2 min-[900px]:w-[240px] min-[900px]:h-[calc(100vh-2*var(--spacing-4))] min-[900px]:rounded-xl min-[900px]:px-4 min-[900px]:py-6 min-[900px]:bg-[rgba(11,13,16,0.45)] min-[900px]:backdrop-blur-[24px] min-[900px]:order-first min-[900px]:justify-start min-[900px]:shrink-0` |
| `.nav__item` | `flex items-center justify-center rounded-full px-4 bg-transparent border border-transparent text-text-muted font-semibold tracking-[0.01em] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms]` |
| `.nav__item.is-active` | `bg-accent/[0.18] border-accent/30 text-text` |
| `.bottom-nav .nav__item` (mobile size) | `min-h-12 px-[0.35rem] text-[0.8rem]` |
| `.bottom-nav .nav__item` (desktop size, `min-[900px]:`) | `min-[900px]:justify-start min-[900px]:w-full min-[900px]:min-h-[3.25rem] min-[900px]:px-4 min-[900px]:py-3 min-[900px]:text-[0.95rem] min-[900px]:rounded-md` |

The `.bottom-nav::before` sidebar title ("XMPP P2P" gradient text) has no clean utility equivalent for `-webkit-background-clip: text`; keep it as a small scoped rule, e.g. add a literal `<span>` element in the component for the title instead of a `::before` pseudo-element (cleaner in Tailwind anyway):
```svelte
<span class="hidden min-[900px]:block font-bold text-[1.35rem] tracking-[-0.03em] mb-6 pl-4 bg-gradient-to-r from-accent to-accent-strong bg-clip-text text-transparent">
  XMPP P2P
</span>
```

- [ ] **Step 3: Wire into `+page.svelte`**

```svelte
<BottomNav {section} onSelect={setSection} />
```

- [ ] **Step 4: Delete dead CSS**

Remove `.bottom-nav`, `.bottom-nav::before`, `.bottom-nav .nav__item`, `.nav__item`, `.nav__item.is-active`, and the `@media (min-width: 900px) { .bottom-nav { ... } }` block and its nested rules from `app.css`.

- [ ] **Step 5: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Manual visual check**

`npm run dev`, check the nav renders as a bottom pill bar at 390px and as a left sidebar with the "XMPP P2P" gradient title at 1280px, identical to before.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/components/BottomNav.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract BottomNav into its own component using Tailwind utilities"
```

---

## Task 4: Extract ContactsView component

**Files:**
- Create: `ui/src/lib/components/ContactsView.svelte`
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: re-read the current `{:else if section === 'contacts'}` block (was lines 1632-1839 pre-Task-2/3 edits — re-locate via `grep -n "section === 'contacts'" ui/src/routes/+page.svelte`) to get the exact list of state/handlers it uses (roster array, search/filter state, the local identity/profile object, network stats, peer list).
- Produces: `ContactsView.svelte` taking those as props, no new public interface needed by later tasks (Contacts is not referenced by Feed/Chats/Composer).

- [ ] **Step 1: Read current markup and note every class used**

```bash
grep -n "section === 'contacts'" ui/src/routes/+page.svelte
```
Then read from that line to the matching `{/if}`/`{:else if}` boundary. Build the class list by grepping the extracted block, e.g.:
```bash
sed -n '<start>,<end>p' ui/src/routes/+page.svelte | grep -oE 'class="[^"]*"' | sort -u
```

- [ ] **Step 2: Create `ContactsView.svelte`, converting classes per this mapping**

| Old class | Tailwind utilities |
|---|---|
| `.contacts-layout` (mobile) | `flex flex-col gap-4 w-full` |
| `.contacts-layout` (desktop) | `min-[900px]:grid min-[900px]:grid-cols-[1.2fr_1fr] min-[900px]:gap-5 min-[900px]:items-start` |
| `.profile-card` | `grid gap-[var(--row-gap)] p-[var(--card-padding)] border border-border bg-surface rounded-xl` |
| `.roster-head` | `items-center mb-4` |
| `.contacts-toolbar` | `grid gap-2 mb-4` |
| `.filter-pills` | `flex gap-2 flex-wrap` |
| `.pill-btn` | `inline-flex items-center justify-center border border-border text-text-muted cursor-pointer transition-all font-medium` |
| `.pill-btn:hover` | `hover:bg-white/[0.08] hover:text-text` |
| `.pill-btn.is-active` | `bg-accent/[0.18] border-accent/40 text-accent-text` |
| `.contacts-search` | `w-full px-3 py-2 rounded-md border border-border bg-surface-soft` |
| `.contacts-search:focus` | `focus:outline focus:outline-1 focus:outline-accent focus:border-accent-strong focus:bg-surface-strong` |
| `.roster-list` | `max-h-[min(58vh,38rem)] overflow-y-auto pr-1 [scrollbar-gutter:stable]` |
| `.contact-item-row` | `grid gap-[var(--row-gap)] border border-border rounded-md p-[var(--card-padding)] bg-surface-soft transition-[transform,border-color]` |
| `.contact-item-row:hover` | `hover:border-border-strong` |
| `.contact-item-row__identity` | `items-center gap-3` |
| `.contact-item-row__footer` | `items-center pt-2 border-t border-white/[0.04]` |
| `.contact-item-row__meta` | `gap-2` |
| `.contact-item-row__actions` | `gap-2` |
| `.contact-trust` | `text-[0.75rem] bg-white/[0.06] px-2 py-0.5 rounded` |
| `.contact-pill` | `text-[0.72rem] text-text-soft` |
| `.avatar`, `.avatar--image`, `.avatar--square`, `.avatar-container`, `.avatar-status-dot` and status variants | use the shared `Avatar.svelte` component built in Task 7 — for now, if Task 7 hasn't run yet, inline-convert per Task 7's mapping table to avoid a forward dependency (Task 7 is sequenced last deliberately as a refactor that can be deferred without blocking Contacts; copy the mapping table from Task 7 Step 2 now). |
| `.network-stats`, `.peer-list`, `.peer-row`, `.peer-row__identity`, `.advanced-link` | `grid gap-2`, `grid gap-2`, `flex items-center justify-between gap-3 py-3 border-b border-white/[0.06] min-w-0` (`:last-child` → add `last:border-b-0`), `items-center gap-3`, `flex items-center justify-between w-full mt-2 px-1 py-[0.7rem] border-0 border-t border-border bg-transparent text-accent-text font-semibold text-[0.9rem] hover:text-text` respectively. |
| `.roster-form` | `grid gap-3 items-end` (desktop: `min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]`) |
| `.kv`, `.kv span:first-child`, `.kv span:last-child` | `flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0`, `text-text-soft`, `text-right text-text [overflow-wrap:anywhere] break-words min-w-0` |

- [ ] **Step 3: Wire into `+page.svelte`**

Replace the `{:else if section === 'contacts'} ... {/if}` block with `<ContactsView {...props} />` passing whatever state/handlers Step 1 identified.

- [ ] **Step 4: Delete dead CSS**

Remove every rule listed in Step 2's left column from `app.css`, including the `@media (min-width: 900px) { .contacts-layout { ... } }` and `.roster-list`/`.roster-form` desktop overrides.

- [ ] **Step 5: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Manual visual check**

`npm run dev`, navigate to Contacts, check roster list, search/filter pills, peer rows, and the two-column desktop layout at 1280px and single-column at 390px look identical to before.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/components/ContactsView.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract ContactsView into its own component using Tailwind utilities"
```

---

## Task 5: Extract FeedView component

**Files:**
- Create: `ui/src/lib/components/FeedView.svelte`
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: re-locate via `grep -n "section === 'feed'" ui/src/routes/+page.svelte`; read full block (feed list, feed detail/`feedDetailOpen`, community sheet) and note every state var/handler referenced (e.g. `feedFilter`, `feedDetailOpen`, `activeFeedId`, `selectedFeedItem()`, `communitySheetId`, `closeCommunitySheet`, `sortedChats`/feed-equivalent sorter — confirm actual names from `social-data.js` and the script block).
- Produces: `FeedView.svelte` taking those as props/callbacks. No interface is consumed by other components.

- [ ] **Step 1: Read current markup and class list**

```bash
grep -n "section === 'feed'" ui/src/routes/+page.svelte
sed -n '<start>,<end>p' ui/src/routes/+page.svelte | grep -oE 'class="[^"]*"' | sort -u
```

- [ ] **Step 2: Create `FeedView.svelte`, converting classes per this mapping**

| Old class | Tailwind utilities |
|---|---|
| `.section-stack` | `grid gap-[var(--row-gap)]` |
| `.feed-controls` | `p-3` |
| `.chip-row` | `flex flex-wrap gap-2 items-center overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden` |
| `.chip` | `inline-flex min-h-10 px-[0.95rem] rounded-full border border-border bg-white/[0.03] text-text-muted whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms]` |
| `.chip:hover` | `hover:-translate-y-px` |
| `.chip--ghost` | `border-dashed` |
| `.chip.is-active` | `bg-accent/[0.16] border-accent/30 text-text` |
| `.feed-card` | `grid gap-[var(--row-gap)] p-[var(--card-padding)] border border-border bg-surface rounded-xl transition-[border-color,box-shadow,transform] duration-[250ms]` |
| `.feed-card:hover` | `hover:-translate-y-0.5 hover:border-accent/[0.34] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]` |
| `.feed-card.is-active` | `border-accent/40 bg-accent/[0.07]` |
| `.feed-card--community` | `border-accent/30` |
| `.feed-card__open` | `grid gap-4 w-full p-0 border-0 bg-transparent text-left` |
| `.feed-card__head` | `flex flex-wrap gap-3 justify-between items-start` |
| `.feed-author` | `flex flex-nowrap gap-3 items-center min-w-0` |
| `.feed-card__body` | `m-0 text-text leading-[1.55]` |
| `.feed-card__footer` | `flex flex-wrap justify-between gap-3 items-center` |
| `.feed-card__actions`, `.action-group` | `flex flex-wrap gap-2 items-center` |
| `.feed-detail` | `-mx-3 px-3 py-4 bg-[rgba(17,19,22,0.98)] border border-border shadow-[var(--shadow)] gap-5 rounded-none` (desktop: `min-[900px]:-mx-6 min-[900px]:px-6 min-[900px]:py-6`) |
| `.feed-detail__hero` | `grid gap-4` (desktop: `min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-start`) |
| `.feed-detail__avatar` | `w-12 h-12 text-[1.05rem]` |
| `.feed-detail__meta` | `grid gap-2 justify-items-start` (desktop: `min-[900px]:justify-items-end min-[900px]:text-right`) |
| `.feed-detail__title` | `m-0 font-display text-[1.05rem] leading-[1.08]` |
| `.feed-detail__body` | `m-0 text-text leading-[1.7] text-[1.05rem]` |
| `.feed-detail__panel` | `grid gap-4 pt-2 border-t border-white/[0.06]` (desktop: `min-[900px]:grid-cols-[minmax(0,0.95fr)_auto] min-[900px]:items-start`) |
| `.feed-detail__stats` | `grid gap-2` (desktop: `min-[900px]:min-w-[min(20rem,100%)]`) |
| `.feed-detail__actions` | `justify-between` |
| `.pill-row`, `.pill-row--tight` | `flex flex-wrap gap-2 items-center`, add `mt-[0.2rem]` |
| `.pill--community` | `bg-accent/[0.12] border-accent/[0.28] text-accent-text` |
| `.pill--person` | `bg-white/5 border-white/[0.12] text-[#edf4fb]` |
| `.avatar--feed`, `.avatar--top` | `bg-gradient-to-br from-accent/[0.24] to-accent/[0.08]` (use shared `Avatar.svelte` from Task 7 once available, per the same forward-reference note as Task 4) |
| `.composer__targets`, `.composer__targets--wrap` | `flex flex-wrap gap-2 items-center`, `flex-wrap overflow-x-visible` (only if the feed composer-target chip row lives inside this block — confirm by checking whether the Composer extraction in Task 9 already owns this; if so, skip) |

- [ ] **Step 3: Wire into `+page.svelte`**

Replace `{#if section === 'feed'} ... {/if}` with `<FeedView {...props} />`.

- [ ] **Step 4: Delete dead CSS**

Remove every rule from Step 2's left column, plus the `@media (min-width: 900px)` overrides for `.feed-detail`, `.feed-detail__hero`, `.feed-detail__meta`, `.feed-detail__panel`, `.feed-detail__stats`, `.feed-detail`/`.thread-shell` shared margin rule (only the `.feed-detail` half — `.thread-shell` is still used by Chats until Task 6, so don't delete a combined selector if it's shared; split it first if needed).

- [ ] **Step 5: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Manual visual check**

`npm run dev`, navigate to Feed, check filter chips, feed cards, opening a post into the detail view, and the community sheet, at 390px and 1280px, identical to before.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/components/FeedView.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract FeedView into its own component using Tailwind utilities"
```

---

## Task 6: Extract ChatsView component

**Files:**
- Create: `ui/src/lib/components/ChatsView.svelte`
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: re-locate via `grep -n "section === 'chats'" ui/src/routes/+page.svelte`; read the full block (chat list, thread shell, MUC roster strip/management, message bubbles, typing indicator) and note state/handlers (`chatDetailOpen`, `activeChatId`, `sortedChats`, `chatAvatarGlyph`, `syncMucDraftFromChat`, `postRuntimeAction`, `activeChat()`, etc. — confirm actual names from the current script block).
- Produces: `ChatsView.svelte` taking those as props/callbacks.

- [ ] **Step 1: Read current markup and class list**

```bash
grep -n "section === 'chats'" ui/src/routes/+page.svelte
sed -n '<start>,<end>p' ui/src/routes/+page.svelte | grep -oE 'class="[^"]*"' | sort -u
```

- [ ] **Step 2: Create `ChatsView.svelte`, converting classes per this mapping**

| Old class | Tailwind utilities |
|---|---|
| `.list` | `grid gap-[var(--row-gap)]` |
| `.row-flat` | `grid gap-1 py-[0.55rem] px-[0.4rem] border-b border-white/[0.06] bg-transparent shadow-none [backdrop-filter:none] rounded-none text-left last:border-b-0` |
| `.row-flat.is-active` | `bg-accent/[0.08]` |
| `.row`, `.row--space` | `flex flex-wrap gap-2 items-center`, add `justify-between items-start` for `--space` |
| `.row--tight` | `flex-nowrap` |
| `.badge` | `inline-flex items-center gap-[0.35rem] px-[0.6rem] py-[0.35rem] rounded-full border border-border text-text-muted text-[0.78rem]` |
| `.message-corrected` | `italic text-[0.8em]` |
| `.thread-shell` | `-mx-3 px-3 py-4 bg-[rgba(17,19,22,0.98)] border border-border shadow-[var(--shadow)] rounded-none` (desktop: `min-[900px]:-mx-6 min-[900px]:px-6 min-[900px]:py-6`) |
| `.thread-settings` | `mb-3` |
| `.thread-header` | `flex items-start justify-between gap-3` |
| `.thread-header__title` | `min-w-0` |
| `.thread-header__manage` | `flex-none w-10 h-10 rounded-md border border-border bg-white/[0.03] text-text-muted text-[1.1rem]` |
| `.thread-header__manage:hover` | `hover:border-border-strong hover:text-text` |
| `.thread-topic` | `mt-[0.3rem] mb-0 text-text text-[0.98rem] leading-[1.4]` |
| `.roster-strip` | `flex gap-3 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden` |
| `.roster-strip__item` | `grid justify-items-center gap-1 flex-none w-[3.4rem]` |
| `.roster-strip__label` | `text-[0.68rem] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full` |
| `.roster-strip__item--overflow .avatar` | `bg-surface-soft text-text-muted text-[0.72rem] font-semibold` |
| `.thread` | `grid gap-2` |
| `.bubble` | `max-w-[42ch] px-[0.95rem] py-[0.8rem] rounded-[1.1rem] bg-white/[0.04] border border-white/[0.06]` |
| `.bubble--self` | `bg-accent/10 border-accent/[0.26] ms-auto` |
| `.message-markers` | `justify-end text-[0.7rem] opacity-60 mt-1` |
| `.typing-bubble` | `self-start bg-transparent border-0 shadow-none pt-0 pb-0` |

- [ ] **Step 3: Wire into `+page.svelte`**

Replace `{:else if section === 'chats'} ... {/if}` (or the now-shifted equivalent) with `<ChatsView {...props} />`.

- [ ] **Step 4: Delete dead CSS**

Remove every rule from Step 2's left column. For `.thread-shell` and its `@media (min-width: 900px)` override, this is now safe to delete since Task 5 already migrated `.feed-detail`'s half of that shared rule.

- [ ] **Step 5: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Manual visual check**

`npm run dev`, navigate to Chats, open a 1:1 chat and a MUC thread (roster strip, management button, typing indicator, message bubbles), at 390px and 1280px, identical to before.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/components/ChatsView.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract ChatsView into its own component using Tailwind utilities"
```

---

## Task 7: Extract shared Avatar, Badge, and Pill primitives

**Files:**
- Create: `ui/src/lib/components/Avatar.svelte`
- Create: `ui/src/lib/components/Badge.svelte`
- Create: `ui/src/lib/components/Pill.svelte`
- Modify: `ui/src/lib/components/Topbar.svelte`, `BottomNav.svelte` (if applicable), `ContactsView.svelte`, `FeedView.svelte`, `ChatsView.svelte` — replace any remaining inline avatar/badge/pill markup with the shared components.
- Modify: `ui/src/app.css` (delete now-fully-dead `.avatar*`, `.badge*`, `.pill*` rules)

**Interfaces:**
- Produces:
  - `Avatar.svelte`: props `glyph` (string, initials or emoji), `imageUrl` (string | undefined), `square` (boolean, default false), `size` (`'default' | 'lg'`, default `'default'`). Renders an image if `imageUrl` is set, else the glyph.
  - `Badge.svelte`: props `variant` (`'default' | 'secure' | 'warn' | 'muted' | 'time'`), slot for content.
  - `Pill.svelte`: props `variant` (`'community' | 'person'`), slot for content.

- [ ] **Step 1: Confirm every current usage**

```bash
grep -rn 'class="avatar\|class="badge\|class="pill' ui/src/lib/components/ ui/src/routes/+page.svelte
```

- [ ] **Step 2: Create `Avatar.svelte`**

```svelte
<script>
  let { glyph = '', imageUrl = undefined, square = false, size = 'default' } = $props();
</script>

<div
  class={`flex items-center justify-center border border-border font-bold flex-none
    ${size === 'lg' ? 'w-[2.1rem] h-[2.1rem]' : 'w-[1.9rem] h-[1.9rem]'}
    ${square ? 'rounded-[0.4rem]' : 'rounded-full'}
    ${imageUrl ? 'object-cover' : 'bg-white/[0.06]'}`}
>
  {#if imageUrl}
    <img src={imageUrl} alt="" class="w-full h-full object-cover rounded-[inherit]" />
  {:else}
    {glyph}
  {/if}
</div>
```

- [ ] **Step 3: Create `Badge.svelte`**

```svelte
<script>
  let { variant = 'default' } = $props();

  const variantClasses = {
    default: '',
    secure: 'text-positive-strong border-positive/25 bg-positive/[0.09]',
    warn: 'text-warning border-warning/25 bg-warning/[0.08]',
    muted: 'text-text-soft',
    time: 'font-mono'
  };
</script>

<span class={`inline-flex items-center gap-[0.35rem] px-[0.6rem] py-[0.35rem] rounded-full border border-border text-text-muted text-[0.78rem] ${variantClasses[variant]}`}>
  <slot />
</span>
```

- [ ] **Step 4: Create `Pill.svelte`**

```svelte
<script>
  let { variant = 'person' } = $props();

  const variantClasses = {
    community: 'bg-accent/[0.12] border-accent/[0.28] text-accent-text',
    person: 'bg-white/5 border-white/[0.12] text-[#edf4fb]'
  };
</script>

<span class={`inline-flex items-center gap-[0.35rem] px-[0.7rem] py-[0.45rem] rounded-full border text-[0.78rem] font-semibold ${variantClasses[variant]}`}>
  <slot />
</span>
```

- [ ] **Step 5: Replace inline usages**

In each of `Topbar.svelte`, `ContactsView.svelte`, `FeedView.svelte`, `ChatsView.svelte`, replace any raw `<div class="avatar ...">`, badge `<span>`, or pill `<span>` left over from Tasks 2-6 (where the mapping tables said "use the shared component once available") with `<Avatar glyph={...} square={...} />`, `<Badge variant="...">...</Badge>`, `<Pill variant="...">...</Pill>` respectively.

- [ ] **Step 6: Delete dead CSS**

Remove `.avatar`, `.avatar--image`, `.avatar--square`, `.avatar--top`, `.avatar--feed`, `.avatar-container`, `.avatar-status-dot` and its status-variant rules, `.badge`, `.badge--secure`, `.badge--warn`, `.badge--muted`, `.badge--time`, `.pill`, `.pill--community`, `.pill--person` from `app.css`.

- [ ] **Step 7: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 8: Manual visual check**

`npm run dev`, check avatars (round and square, with and without images), badges, and pills across Feed, Chats, and Contacts at 390px and 1280px, identical to before.

- [ ] **Step 9: Commit**

```bash
git add ui/src/lib/components/Avatar.svelte ui/src/lib/components/Badge.svelte ui/src/lib/components/Pill.svelte ui/src/lib/components/Topbar.svelte ui/src/lib/components/ContactsView.svelte ui/src/lib/components/FeedView.svelte ui/src/lib/components/ChatsView.svelte ui/src/app.css
git commit -m "Extract shared Avatar, Badge, and Pill components"
```

---

## Task 8: Extract Composer component

**Files:**
- Create: `ui/src/lib/components/Composer.svelte`
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: re-locate via `grep -n "class=\"composer" ui/src/routes/+page.svelte` and the FAB block found earlier (`{#if section === 'feed' || section === 'chats'} ... fab ...`); read the full composer sheet (quick/article mode, cover image dropzone, title/tags collapse, rich-text toolbar, destination picker) and note every state var (`composerActionId`, `composerBody`, `composerCoverImageUrl`, `composerTags`, `composerTagDraft`, `coverSectionOpen`, `titleSectionOpen`, `composerTopicTitle`, `destinationPickerOpen`, `composerTarget()`, `composerChatContactId`, `openComposerAction`, `closeComposer`, `selectedComposerAction()`) and handlers from the current script block.
- Produces: `Composer.svelte` taking those as props/callbacks. Includes the FAB button itself since it triggers the composer's open state.

- [ ] **Step 1: Read current markup and class list**

```bash
grep -n "section === 'feed' || section === 'chats'" ui/src/routes/+page.svelte
sed -n '<start>,<end>p' ui/src/routes/+page.svelte | grep -oE 'class="[^"]*"' | sort -u
```

- [ ] **Step 2: Create `Composer.svelte`, converting classes per this mapping**

| Old class | Tailwind utilities |
|---|---|
| `.fab` | `fixed right-4 bottom-[5.6rem] z-[11] w-[3.25rem] h-[3.25rem] rounded-full flex items-center justify-center text-[1.5rem] font-bold leading-none border-0 [touch-action:manipulation]` |
| `.fab--feed`, `.fab--chat` | both map to `bg-accent text-white shadow-[0_12px_28px_rgba(91,75,207,0.28)]` (both variants were already identical accent colors per the source CSS) |
| `.fab-menu` | `gap-3` |
| `.fab-menu__grid` | `grid gap-2` |
| `.composer-option` | `grid gap-1 w-full text-left p-3 rounded-md border border-border bg-white/[0.03] text-text` |
| `.composer-option strong` | `font-display text-base` |
| `.composer-option:hover` | `hover:border-accent/[0.24] hover:bg-accent/[0.06]` |
| `.sheet` (mobile) | `fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-4 max-h-[80vh] overflow-y-auto` |
| `.sheet` (desktop) | `min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none` |
| `.sheet.composer` | `fixed top-0 left-0 right-0 bottom-0 max-h-screen h-screen rounded-none z-[12]` |
| `.composer` | `grid gap-4 sticky top-[calc(5.25rem+var(--spacing-3))] z-[6]` (desktop: `min-[900px]:top-[calc(5.75rem+var(--spacing-4))]`) |
| `.composer__form` | `flex flex-col flex-1 gap-3 min-h-0` |
| `.composer__actions` | `flex flex-wrap items-center justify-between gap-3` |
| `.composer__targets`, `.composer__targets--wrap` | `flex flex-wrap gap-2 items-center`, `flex-wrap overflow-x-visible` |
| `.composer-header` | `flex items-center justify-between gap-3 pb-3 border-b border-border` |
| `.composer-header__cancel` | `bg-transparent text-text-muted text-[0.88rem] p-0` |
| `.composer-header__title` | `font-display text-[0.95rem]` |
| `.composer-header__icons` | `flex items-center gap-2 min-w-[1.6rem] justify-end` |
| `.icon-toggle` | `w-[1.8rem] h-[1.8rem] rounded-md border border-border bg-white/[0.03] text-text-soft text-[0.85rem]` |
| `.icon-toggle.is-on` | `bg-positive/[0.12] border-positive/[0.32] text-positive-strong` |
| `.rich-toolbar` | `flex items-center gap-2 py-2 border-b border-border` |
| `.rt-icon` | `w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center` |
| `.composer-dest` | `flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 border-b border-border text-text-muted text-[0.85rem]` |
| `.composer-dest__value` | `text-accent-text font-semibold` |
| `.cover-dropzone` | `grid gap-2 p-3 rounded-lg border border-dashed border-border bg-white/[0.03] cursor-pointer` |
| `.cover-dropzone--active` | `border-accent/50 bg-accent/[0.08]` |
| `.cover-dropzone__label` | `text-text-muted text-[0.9rem] leading-[1.4]` |
| `.collapse` | `border-b border-border` |
| `.collapse__head` | `flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 text-text-soft text-[0.85rem]` |
| `.collapse__body` | `grid gap-2 pb-3` |
| `.tags-row` | `flex flex-wrap gap-2 items-center` |
| `.tag-chip` | `text-[0.78rem] px-[0.6rem] py-[0.3rem] rounded-md bg-accent/10 text-accent-text border border-accent/[0.26]` |
| `.tag-add-input` | `text-[0.78rem] px-[0.6rem] py-[0.3rem] rounded-md bg-transparent border border-dashed border-border-strong text-text-muted min-w-[6rem]` |
| `.toggle` | `inline-flex items-center gap-2 px-[0.7rem] py-[0.45rem] rounded-full border border-border bg-white/[0.03] text-text-muted` |
| `.field` | `grid gap-2 text-text-muted text-[0.9rem]` |
| `.field span` | `text-text-soft text-[0.76rem] tracking-[0.08em] uppercase` |
| `.field input, .field select, .field textarea` | `w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text` |
| `.field--grow` | `flex-[1_1_100%]` |
| `.composer__body-field` | `flex-1 flex flex-col min-h-0` |
| `.composer__body-field textarea` | `flex-1 min-h-24 resize-none` |
| `.composer__settings` | `grid gap-4 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]` |
| `.composer__settings-row` | `flex flex-wrap gap-3` |
| `.button` | `inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px` |
| `.button--small` | `min-h-10 px-[0.9rem] text-[0.88rem]` |
| `.button--secondary` | `bg-accent/[0.08] border border-accent/[0.24] text-text shadow-none` |
| `.button--ghost` | `bg-transparent border border-border-strong text-text shadow-none` |
| `.button--destructive` | `border-warning/40 text-[#ffd9ae] hover:bg-warning/[0.08]` |
| `.backdrop` | `fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]` |

- [ ] **Step 3: Wire into `+page.svelte`**

Replace the FAB + composer sheet block with `<Composer {...props} />`.

- [ ] **Step 4: Delete dead CSS**

Remove every rule listed in Step 2's left column from `app.css`, plus the `@media (max-width: 540px)` block's composer-specific rules (`.composer__actions`, `.composer .button` width rules) — fold the equivalent behavior into the component's own responsive utilities (e.g. `max-[540px]:flex-col max-[540px]:items-stretch` on the actions row, `max-[540px]:w-full` on the buttons).

- [ ] **Step 5: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Manual visual check**

`npm run dev`, open the composer from both Feed and Chats FABs, check quick/article mode toggle, cover dropzone, tags, destination picker, and submit buttons at 390px and 1280px, identical to before.

- [ ] **Step 7: Commit**

```bash
git add ui/src/lib/components/Composer.svelte ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Extract Composer into its own component using Tailwind utilities"
```

---

## Task 9: Modernize `+page.svelte` shell to Svelte 5 runes and final cleanup

**Files:**
- Modify: `ui/src/routes/+page.svelte`
- Modify: `ui/src/app.css`

**Interfaces:**
- Consumes: nothing new — this is a syntax pass over what remains in the shell after Tasks 2-8.
- Produces: nothing new — `+page.svelte` is now a thin shell, no further extraction needed.

- [ ] **Step 1: Convert remaining `export let data` to `$props()`**

Read the current top of `+page.svelte` (post-extraction it should be much shorter). Replace:
```js
export let data
```
with:
```js
let { data } = $props();
```
and convert any remaining plain `let x = ...` reactive state that Svelte 5 needs as `$state(...)` if it's mutated reactively in the template (check each one — values only read once at init, like the `clone(data.snapshot)` destructuring, don't need `$state`; values reassigned in event handlers, like `section`, do).

- [ ] **Step 2: Verify the remaining `app.css` matches the spec's final-state list**

```bash
grep -c '^\.' ui/src/app.css
```
Confirm only these categories of rules remain: `@theme` block, font `@import`, `*, html, body, button, input, select, textarea` resets, `:focus-visible`, `@keyframes pulse`/`fadeIn`, `::-webkit-scrollbar*`, `.status-pulse` (from Task 2), `@media (prefers-reduced-motion: reduce)`. If anything else remains, trace which component still references it (grep the component files for the class name) and finish migrating that rule.

- [ ] **Step 3: Run svelte-check**

```bash
cd ui && npm run check
```
Expected: no errors.

- [ ] **Step 4: Full manual regression pass**

`npm run dev`. At both 390px and 1280px widths, walk through: Feed (list, filters, open a post, community sheet), Chats (list, 1:1 thread, MUC thread with roster strip and management), Contacts (roster, search/filter, peer list, profile sheet), Composer (quick mode, article mode, cover/tags, destination picker), and presence sheet. Confirm every screen is visually identical to the pre-migration app.

- [ ] **Step 5: Production build check**

```bash
cd ui && npm run build && npm run preview
```
Spot-check the same screens against the production build to catch any dev-only Tailwind class purging issues.

- [ ] **Step 6: Commit**

```bash
git add ui/src/routes/+page.svelte ui/src/app.css
git commit -m "Modernize +page.svelte shell to Svelte 5 runes; finish Tailwind migration cleanup"
```
