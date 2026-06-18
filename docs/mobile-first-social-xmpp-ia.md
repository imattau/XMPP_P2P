# Mobile-First Social XMPP Information Architecture

This document defines the responsive UI structure for a modern social XMPP app built on top of the existing XMPP/libp2p capabilities in this repo.

The goal is not a toy dashboard. The interface must directly support core social tasks:

- See who is available
- Understand identity and trust
- Manage contacts and subscriptions
- Chat 1:1 and in rooms
- Publish and read feed activity
- Inspect attachments, reactions, and room state
- See connection health and peer discovery when needed

## Design Principles

1. Function first.
- Every screen must map to a real user action or social state.
- Avoid decorative widgets, mascots, filler charts, or novelty panels.

2. Mobile first.
- Start with a single-column layout.
- Promote the most important actions into thumb-reachable controls.
- Expand to split-pane and inspector patterns only when space allows.

3. Social state must be visible.
- Presence, identity, relationship, and room membership are first-class.
- Security status must be explicit for secure chat and room messages.

4. SVG only when it carries meaning.
- Use inline SVG for peer topology, presence/status rings, trust markers, room occupancy, and protocol-state diagrams.
- Do not use SVG as decoration.

5. Dense but readable.
- Favor compact hierarchy, clear labels, and consistent sections.
- Keep interaction targets large enough for touch, but avoid wasting vertical space.

## Primary Navigation

Use 3 top-level destinations. Keep the mobile nav fixed at the bottom and convert it to a left rail on desktop.

1. Feed
- A single chronological stream of posts from people you follow and communities you've joined, each carrying a source pill for context.
- Tapping a community's source pill opens an action sheet for that community's details, join/leave, and visibility.
- This is the default landing screen.

2. Chats
- A single list unifying 1:1 conversations, group DMs, and MUC rooms, sorted by recency.
- Selecting a MUC room reveals its topic and occupant roster inline; selecting a 1:1 or group thread shows the message history and composer directly.

3. Profile
- Identity, presence/availability controls, peer topology, and protocol/connection state.

## Screen Map

### Feed

Purpose: asynchronous social content from people and communities, unified.

Contents:
- Feed posts from followed people and joined communities, with a source pill on each
- Reactions and an encryption indicator per post
- Filter row (All / People / Communities / per-community)

Primary actions:
- Create post (via a collapsible composer)
- Tap a community's source pill to open its join/leave/visibility action sheet

### Chats

Purpose: messaging, unified across conversation types.

Contents:
- One conversation list mixing 1:1, group, and MUC rooms, sorted by recency
- Unread counts for 1:1/group; occupant count for MUC rooms
- Presence snippet, encryption state, message preview

Thread view:
- Message list, composer anchored to bottom, encryption state
- MUC rooms additionally show topic and an expandable occupant roster

### Profile

Purpose: identity and protocol state.

Contents:
- Local identity summary (JID, peer ID, transport, connection)
- Availability/presence controls
- Peer topology graph
- Protocol/connection state (peer discovery, roster sync, secure sessions, PubSub, DHT)

## Responsive Behavior

### Mobile

- Bottom navigation with 3 items.
- Single-column content.
- Bottom sheets or full-screen drawers for:
  - community details and join/leave
  - composer and primary actions
  - message actions
- Composer and primary actions stay close to thumb reach.

### Tablet

- Two-column layouts become viable.
- Keep list on the left and detail on the right for chats and communities.
- Preserve the bottom nav only if the app is not dense enough for a left rail.

### Desktop

- Left navigation rail.
- Split panes for list/detail workflows.
- Persistent right inspector for trust, state, or protocol metadata.
- Keep the main action surfaces wider and avoid hidden interaction models.

## SVG Usage

Use SVG only in places where the visual encodes real state.

Good uses:
- Peer topology graph
- Presence halo around avatars or initials
- Secure connection lock / trust badge
- Room occupancy cluster
- Network health or discovery path visualization

Implementation rules:
- Inline SVG, not decorative assets in image tags.
- Use `viewBox` and responsive sizing so the same graphic works from phone to desktop.
- Keep labels in HTML when possible and pair SVG with text for accessibility.
- Ensure the SVG has width and height or is wrapped in a reserved aspect-ratio container to prevent layout shifts.
- Animate only state changes, not idle motion.

Novel but still useful SVG patterns:
- A peer graph that grows from the local node outward as discovery happens
- A trust ring that changes stroke style when a contact becomes verified
- A room occupancy diagram that compresses and expands as users join or leave
- A capability strip where icons light up according to disco results

Avoid:
- Mascots
- Abstract blobs with no semantic meaning
- Animated backgrounds
- Gratuitous network spaghetti with no readable labels

## UI Components

Build these as reusable primitives:

- `StatusHeader`
- `IdentityCard`
- `PresenceList`
- `ConversationList`
- `ThreadView`
- `ComposerBar`
- `RoomRoster`
- `FeedTimeline`
- `AttachmentStrip`
- `SecurityBadge`
- `ProtocolInspector`
- `PeerGraph`

## Information Hierarchy

Priority order for most screens:

1. What is happening now?
2. Who is involved?
3. Is it secure or trusted?
4. What can I do next?
5. What advanced details should I inspect?

This keeps the app social at the top, technical underneath.

## Visual Tone

- Dark neutral base or high-contrast light base, but not playful or toy-like
- Compact typography with strong labels
- Clear dividers and containment
- Minimal motion
- Strong focus states

## Accessibility And Performance

- Preserve keyboard navigation for all interactive surfaces
- Ensure text alternatives for all meaningful SVG content
- Reserve layout space for images, graphs, and async panels
- Avoid blocking interactions with heavy animations
- Keep critical actions available without hover

## Implementation Notes For This Repo

The current runtime already exposes the right product domains:

- Peer discovery and connection setup in [src/index.ts](../src/index.ts)
- Core CLI/social commands in [src/cli/output.ts](../src/cli/output.ts)
- Session wiring in [src/cli/session.ts](../src/cli/session.ts)
- Rich social state in `src/core/xmpp-node.ts`

The future web UI should bind to those same capabilities rather than inventing unrelated screens.
