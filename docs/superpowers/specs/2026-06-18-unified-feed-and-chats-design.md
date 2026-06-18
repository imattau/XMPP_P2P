# Unified Feed & Unified Chats — UI Redesign

Date: 2026-06-18

## Problem

The current `ui/` Svelte app (see `ui/src/routes/+page.svelte`, `ui/src/lib/social-data.js`) has four nav destinations: Feed, Communities, Chats, Profile. Two problems block the stated goals:

1. **Chats only models 1:1 conversations.** There is no group chat or MUC (multi-user chat / room) representation anywhere in the UI or its mock data, despite the backend already exposing MUC room state (`MucRoomState`: `name`, `topic`, `localNick`, `occupants: Map<string, MucOccupant>`), roster/contact state (`XmppRosterEntry`: `jid`, `subscription`, `presence`, `trust`/capability-like fields), and per-message security/state (`XmppMessage`: `encrypted`/`encryption`, `chatState`, `receipt`, `delay`, `replace`).
2. **Communities duplicates Feed.** Feed already shows a unified person+community stream with source pills; the separate Communities tab re-surfaces the same community list with no distinct task beyond join/leave/visibility management.
3. **Visual design issues**, especially on mobile: oversized hero typography pushes content below the fold, the composer is always-expanded and sticky (consuming a large share of the viewport before any feed content is visible), heavy `backdrop-filter` blur + multi-layer shadows are used on every list row (expensive on low-end mobile GPUs, and visually noisy), and the accent teal color is used decoratively (chips, buttons, headlines) rather than reserved for a consistent meaning. Badge pills are used to convey type/security/presence redundantly with text labels, costing horizontal space that's scarce on mobile.

There are also stale reference screenshots (`ui/desktop-unified-feed*.png`, `ui/mobile-unified-feed*.png`) showing a left-rail "Social shell" layout that does not match either the current code or this design — they should be removed so they don't mislead future review.

## Goals

- Single **Chats** list unifying 1:1, group DM, and MUC rooms, sorted by recency, with a detail view that adapts by conversation kind.
- Fold **Communities** into **Feed**: community join/leave/visibility moves into an action sheet opened from a feed post's source pill/avatar.
- Apply a consistent visual system, prioritized for mobile: avatar shape conveys identity type (circle = person, rounded-square = community/room), accent color reserved for security/presence state only, flat/bordered list rows instead of blurred glass surfaces, compact headers instead of hero typography, and a collapsible composer (FAB + sheet on mobile) instead of an always-expanded sticky block.

## Non-goals

- No backend/protocol changes. This is a UI-layer reshape of mock data (`social-data.js`) to match shapes the backend (`src/core/xmpp-node.ts` and MUC/roster/message types) already exposes. Wiring the UI to the real running node is a future, separate effort.
- No new routes/pages beyond the existing `+page.svelte` single-page section model.
- No changes to the Profile section's content (identity, presence, peer graph, protocol inspector) beyond the nav being 3 items instead of 4.

## Navigation

Reduce `sectionLabels` / bottom nav to: **Feed**, **Chats**, **Profile** (3-column grid instead of 4 in `.bottom-nav`). Remove the `communities` branch and `activeCommunityId` state from `+page.svelte`. Community data (`communities[]`) stays in `social-data.js` — it's still needed for feed source pills and the action sheet — but is no longer its own top-level section.

## Data model changes (`ui/src/lib/social-data.js`)

Extend each entry in `chats[]` with:

- `kind: 'direct' | 'group' | 'muc'`
- For `kind: 'muc'`: `topic: string`, `occupants: { nick: string, presence: string }[]`, `localNick: string`
- For `kind: 'group'`: `participants: string[]` (names, for an avatar cluster)
- Existing fields (`name`, `secure`, `unread`, `preview`, `messages[]`) stay as-is across all kinds; `secure` for MUC rooms reflects whether room messages carry `encryption`, not a per-message toggle.

Add at least one `muc` and one `group` example entry to the mock data so the new UI branches are exercised (e.g. a `#lattice-room` MUC with 3-5 occupants, sourced thematically from the existing `lattice` community).

No changes to `feedItems[]`, `contacts[]`, `protocol[]`, `peers[]`, or `identity`.

## Chats section (`+page.svelte`)

**List view**: one flat list, rows sorted by recency (most recent message/activity first — derive from last message time or a new `lastActivity` sort key if needed). Each row:

- Avatar: circle for `direct`/`group` (initials), rounded-square for `muc` (e.g. a glyph or community-derived initial)
- Presence dot overlaid on the avatar for `direct` (from contact presence), omitted for `group`/`muc`
- Name + timestamp on the first line
- Preview text on the second line: last message body for `direct`/`group`; for `muc`, a short occupant-derived snippet (e.g. "Jun, Maya +3 · last message")
- Trailing: unread count (numeral, only if > 0) for `direct`/`group`; occupant count text (e.g. "5 in room") for `muc`
- No badge pills on the row itself (no "secure"/"open" badge in the list — security state shows in the detail view)

**Detail view**, branching on `kind`:

- `direct` / `group`: existing message thread + composer, encryption shown as a small inline lock icon next to the thread header (not a separate badge row), typing state from `chatState`, receipts from `receipt` if present on a message
- `muc`: same message thread + composer, plus:
  - Room topic shown under the header
  - Collapsible occupant roster (nick + presence) above the thread, collapsed by default on mobile
  - Join/leave affordance replaces the 1:1 "secure" toggle area

## Feed section (`+page.svelte`)

- Replace the current section header (`eyebrow` + large `h2` + paragraph) with a compact header: section title only, no hero copy, no descriptive paragraph block.
- Filter row: plain text labels, single filled/active state for the selected filter (drop the bordered chip treatment for inactive filters; keep it only for the active one).
- Composer: collapse to a single circular "+" affordance in the header area. Tapping it opens a bottom sheet on mobile (or an inline panel on desktop, consistent with existing `.surface` styling) containing the existing target picker, message field, secure toggle, and Publish button — same functionality, different default visibility (collapsed, not sticky-expanded).
- Feed card: drop the per-card badge row (`badge--time`, `badge--secure`/`badge--warn` shown separately from pills). Consolidate into one trailing meta line: time, reactions, and a lock icon only if `secure`. Avatar shape follows the same person/community convention as Chats.
- Source pill on community posts becomes tappable, opening a small action sheet with the community's name, description, member count, visibility, and Join/Leave + visibility controls (this is what replaces the standalone Communities tab's functionality).

## Visual system (`ui/src/app.css`)

- Reserve `--accent` (teal) usage for: security/encryption indicators, presence "available" dot, and the single active filter/nav state. Do not use it as a general decorative color on buttons/chips/headlines that don't represent one of those states.
- Replace `.surface`'s `backdrop-filter: blur(18px)` + heavy `box-shadow` treatment on list rows (`.list__item`, `.feed-card`, chat rows) with a flatter bordered-row style (border + subtle background, no blur, minimal/no shadow). Keep the blur/shadow `.surface` treatment for true overlay/sheet contexts (the new composer sheet, community action sheet).
- Reduce header typography from `clamp(1.8rem, 5vw, 2.7rem)` to a compact fixed size (~1.1–1.25rem) for section titles; remove the hero paragraph block under titles.
- Avatar shape: `border-radius: 50%` for person-kind avatars, keep the existing `0.85rem` rounded-square for community/room-kind avatars — formalize this as the type signal instead of a text badge.

## Cleanup

- Delete `ui/desktop-unified-feed.png`, `ui/desktop-unified-feed-2.png`, `ui/mobile-unified-feed.png`, `ui/mobile-unified-feed-2.png` (stale, don't match current or proposed UI).
- Update `docs/mobile-first-social-xmpp-ia.md`'s Primary Navigation / Screen Map sections to reflect the 3-item nav and unified Chats (currently describes a 5-item nav with separate Rooms and Activity destinations that no longer apply to this app). This doc update is in scope since leaving it contradicting the implemented UI would mislead future review.

## Testing

This is a Svelte/SvelteKit frontend with no existing component tests (`ui/package.json` has no test script). Verification is manual: run `npm run ui:start`, exercise Feed (filtering, composer sheet, source-pill action sheet) and Chats (selecting a `direct`, `group`, and `muc` row, verifying the detail view branches correctly) at both a mobile viewport (~390px) and desktop width, and confirm `svelte-check` (already a devDependency) passes with no new type errors.
