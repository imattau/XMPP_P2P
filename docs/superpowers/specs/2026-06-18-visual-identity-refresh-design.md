# Visual Identity Refresh — Indigo/Violet System, Composer Modes, MUC & Profile Cleanup

Date: 2026-06-18

## Problem

The prior redesign (`2026-06-18-unified-feed-and-chats-design.md`) fixed structure (unified Chats, folded Communities into Feed, flattened rows) but the app still reads as visually inconsistent: chips/pills/badges share near-identical shapes with slightly different treatment, the teal/orange accent system does too many jobs at once (security, presence, active-state, brand), and several screens (Profile's peer graph, the composer) carry either decorative or mismatched-capability UI. This was validated against current best practice for social/chat apps (restraint, clear sender differentiation, accessible live regions, gesture-aware interaction) and against a deliberately chosen reference blend: Signal (restraint), Matrix/Element (structured, protocol-transparent), Movim (federated social-feed layout) — see prior research summary in conversation.

This spec was developed interactively via mocked screens (Feed, Chats, Profile, Composer, MUC thread) reviewed in-browser; the decisions below are what was confirmed across those iterations.

## Goals

- Establish one consistent indigo/violet visual system (replacing teal/orange as primary brand color) across Feed, Chats, and Profile.
- Formalize avatar shape as the identity-type signal: circle = person, rounded-square = room/community (already partially true; this makes it the rule everywhere, including Chats rows and Profile).
- Tighten list/card density app-wide (validated as "too loose" at initial pass, "right" after ~25% reduction in padding/gaps).
- Simplify Profile: drop the peer-topology graph entirely, move protocol/connection state behind a single "Advanced" link to a separate inspector view, keep only identity + presence + a lightweight connection summary on the main Profile screen.
- Redesign the composer as a full-screen flow (not a half-height bottom sheet) with a compact single-row destination picker (replacing inline destination chips), and a destination-aware encrypt control.
- Add a **Quick / Article** mode switch to the composer for Feed/Community targets, since posts there are closer to blog-style content (title, optional cover image, rich text, tags) than short-form chat-style updates.
- Redesign the MUC (room) thread header: room name + occupant count, a larger topic line, and a management/info action button.

## Non-goals

- No backend/protocol changes. Confirmed during this session: `publishFeed` (`src/core/xmpp-feed.ts:99`, `src/core/xmpp-node.ts:3006`) has no encryption parameter — Feed/Community posts are plain PubSub content and cannot be encrypted server-side today. This spec does not add that capability; it only ensures the UI stops implying it exists.
- No changes to the underlying data model beyond what's needed to drive mode (Quick/Article) and the new Profile/Advanced split — this is a visual and interaction layer change on top of the structure already established by the prior spec.
- Gesture interactions (swipe-to-reply, long-press-for-reactions) and live-region accessibility fixes for the message thread were flagged in the earlier audit as gaps but are explicitly out of scope for this visual pass — worth a follow-up spec.

## Visual system (tokens)

Replace the teal/orange palette in `ui/src/app.css` `:root` with an indigo/violet system:

- Base: near-black (`#0c0d11` body background, `#13141a` card/row surface, `#171922` recessed/input surface) — darker and flatter than the current `--bg`/`--surface` values, dropping the radial-gradient decoration and `backdrop-filter: blur(18px)` glass treatment on ordinary rows/cards (keep blur only for true overlay sheets, per the prior spec's existing carve-out).
- Primary accent: violet/indigo (`#5b4bcf` solid / `#a995f5` light, `#c9bdfa` text-on-dark variant) replacing `--accent` (teal) as the brand and active-state color (nav active, filter active, primary buttons, focus rings).
- Reserve one distinct hue per meaning instead of overloading the accent (this was an explicit audit finding): keep green (`#5fd49a`/`#7fd1a8` family, close to existing `--warning`-adjacent greens already in use for presence) for "available"/secure/positive state; amber (existing `--warning`) for away/warning; red-pink (existing `#ff8a8a`) for busy/dnd/error. Violet is reserved for brand/active/selection only, not security or presence.
- Borders: low-contrast (`#1e2029`/`#1d1f26`/`#232531`) hairlines, no glow/shadow on standard rows.
- Density: reduce card padding from `var(--space-4)` (1rem) to ~0.65–0.7rem, row gaps from `var(--space-4)` to ~0.4–0.45rem, avatar sizes from 2.25rem to ~1.85–2rem — this matches the ~25% tightening validated in mockups.

## Avatar shape convention (formalized)

- Circle (`border-radius: 50%`): person-kind entities — 1:1 contacts, feed authors, MUC occupants in the roster strip, the local identity avatar on Profile.
- Rounded-square (`border-radius: ~0.4rem`, smaller radius than the prior spec's `0.85rem` to read more "tile-like" at the new smaller avatar size): community/room-kind entities — community source pills' avatar, MUC room avatar in Chats list and Feed source pill.
- This applies everywhere an avatar appears (Feed cards, Chats list rows, Chats detail header, Profile), superseding the prior spec's looser "keep the existing rounded-square" language with this as the explicit, app-wide rule.

## Profile section

- Remove the peer-topology graph (`PeerGraph.svelte` usage on the Profile screen) entirely — confirmed as net-negative, not worth a text-summary replacement either.
- Remove the inline "Protocol state" block (peer discovery / roster sync / secure sessions / PubSub / DHT rows) from the main Profile screen.
- Add a single tappable row: **"Advanced — protocol & peer state"** with a trailing chevron, linking to a new (or existing, re-purposed) inspector view that contains what used to be inline: protocol state list and, if kept anywhere, peer topology. This view is reached one tap deeper, consistent with the IA doc's information hierarchy ("what's happening now" before "what should I inspect").
- Main Profile screen keeps: identity card (avatar + JID/peer ID + presence ring), presence chips (Available/Away/Busy), and a compact "Connection" card (transport, peer count, latency) as plain key-value rows — no graph, no expanded protocol list.

## Composer

### Layout

- Composer becomes a full-screen view on all breakpoints when open (not a half-height bottom sheet) — gives the writing area room and matches the "full-screen on mobile" treatment the prior spec already specified for the composer sheet, now extended to be the only treatment, including desktop (centered full-height or large modal, not a small popover).
- Header: Cancel (left) · context title "New post"/"New message" (center) · small icon-toggle area (right) reserved for the encrypt toggle when applicable (see below) — no large "Post" button in the header.
- Destination: single compact row ("Posting to" / "Sending to" + current target + chevron), tap to open the existing target-picker (community/contact/group selection), replacing the inline destination-chip row from the previous iteration. This was changed specifically because chips were confirmed confusing as a destination selector.
- Primary send action: a circular send-icon button (↑ glyph), placed in the bottom toolbar — the same control, same visual treatment, and same position language whether sending a chat message or publishing a feed/article post. This replaces the separate "Post" text button design.

### Encrypt control — destination-aware

- The encrypt icon-toggle in the header only renders when the current destination supports encryption: 1:1 contacts and group chats (OMEMO). It does not render at all when the destination is a Feed/Community target, since `publishFeed` has no server-side encryption path (confirmed above) — showing a disabled/greyed toggle was considered and rejected in favor of not showing it at all, to avoid implying a capability that doesn't exist.
- When shown, it is a small icon-only toggle (lock icon, on/off via fill state), not a full labeled row — this was an explicit revision after the first pass made the encrypt row "take up too much space."

### Quick / Article mode (Feed/Community destinations only)

- A two-option mode switch (Quick | Article) appears directly under the header when the destination is a Feed or Community target. It does not appear for 1:1/group chat destinations — those only ever send Quick-style messages.
- **Quick mode**: today's short-form post — destination row, plain text area, attachment icon, send button. No title/cover/tags.
- **Article mode**: adds, as collapsible accordion sections between the destination row and the rich-text toolbar:
  - "Cover image" section (collapsed by default; expands to an image drop/upload control)
  - "Title & tags" section (collapsed by default; expands to a title input plus a tag-chip row with an "+ tag" add affordance)
  - A rich-text toolbar (bold, italic, heading, link, list) above the writing area, visible whenever Article mode is active (not collapsible — it's directly useful while writing, unlike the metadata sections)
- Both accordion sections are **collapsed by default specifically to maximize the writing area on small screens** — this was an explicit correction after the first Article mockup showed them always-expanded, eating vertical space. Expanding one pushes the writing area down temporarily; collapsing restores it. The writing `textarea`/rich-text area is `flex: 1` and should absorb all remaining vertical space in both modes.
- Reply-context (when replying to a specific post/message) renders as a small left-bordered strip above the writing area in Quick mode only — Article mode doesn't have a reply-to-a-single-message concept.

## MUC (room) thread

- Header: room name + occupant count on one line (e.g. "#rust-xmpp · 12 members"), with a management/info button (icon, top-right of the header row) — gear icon if the local user has owner/admin affiliation for the room, info ("i") icon otherwise. Tapping it opens room settings (owner/admin) or read-only room info (everyone else).
- Topic renders as its own line below the name row, larger and more prominent than the prior single small "topic" caption — full sentence-length topic text should be readable without truncation in the common case.
- Occupant roster: horizontally-scrollable strip of circular avatars (person-shape, per the avatar convention above) directly below the header, with a "+N" trailing tile when the roster exceeds the visible row — this replaces the prior spec's "collapsed by default" accordion roster with an always-visible (but compact, horizontally-scrolling) strip, since the mockup review treated this as resolved as part of the header rework rather than flagged as needing further collapse.
- Message list and composer bar are otherwise unchanged from the existing unified Chats detail view (sender name label on others' bubbles, no label on self bubbles, same composer-bar send-icon button as the rest of the system).

## Cleanup / supersession notes

- This spec supersedes the prior spec's accent color (teal/orange → indigo/violet) and its `0.85rem` rounded-square avatar radius (tightened alongside the smaller avatar size). Everything else in the prior spec (unified Chats list/detail branching by `kind`, Communities folded into Feed, flat bordered rows, compact headers) still applies and is not changed here.
- `docs/mobile-first-social-xmpp-ia.md`'s "Visual Tone" section ("Dark neutral base or high-contrast light base") and SVG-usage guidance should be updated to drop the peer-topology-graph-on-Profile example, since that graph is being removed from the main Profile screen (it may still apply to whatever the new Advanced/inspector view contains, if that view keeps a graph — not decided here, treat as a follow-up).

## Testing

Same manual verification approach as the prior spec: run the SvelteKit dev server, exercise Feed (filter row, composer in both Quick and Article mode, cover/tag accordion expand-collapse), Chats (1:1, group, and MUC rows; MUC header management button for an owner vs. non-owner room), and Profile (no graph, Advanced link navigates to the inspector view) at a mobile viewport (~390px) and desktop width. Confirm `svelte-check` passes with no new type errors. No automated UI tests exist yet (`ui/package.json` has no test script), so this remains manual.
