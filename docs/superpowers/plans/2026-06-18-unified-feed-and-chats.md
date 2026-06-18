# Unified Feed & Unified Chats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `ui/` SvelteKit app so Chats unifies 1:1/group/MUC conversations in one list, Communities folds into Feed, and the visual system (color, typography, density) follows a consistent mobile-first standard.

**Architecture:** Single-page Svelte 5 app (`ui/src/routes/+page.svelte`) driven by mock state in `ui/src/lib/social-data.js`, styled via global `ui/src/app.css`. No new routes, no new build tooling, no backend changes — this reshapes existing client-side state and markup only.

**Tech Stack:** Svelte 5, SvelteKit 2, Vite 8. Verification tool: `npm run check` (runs `svelte-kit sync && svelte-check`) from the `ui/` directory. No unit test framework is configured in `ui/package.json`; data-layer logic is verified with disposable `node -e` ESM checks against the exported functions (consistent with there being no test runner here), and markup/CSS changes are verified with `svelte-check` plus a manual pass in the dev server (`npm run dev` from `ui/`) at a ~390px mobile width and a desktop width.

## Global Constraints

- No backend/protocol changes — UI-layer only (spec "Non-goals").
- No new routes/pages beyond the existing `+page.svelte` section model (spec "Non-goals").
- Nav reduces to exactly 3 destinations: Feed, Chats, Profile (spec "Navigation").
- `--accent` (teal) is used only for: security/encryption indicators, the "available" presence dot, and the single active filter/nav state — never decoratively (spec "Visual system").
- Avatar shape is the type signal: circle = person, rounded-square = community/room (spec "Visual system" / "Data model changes").
- Blur/shadow `.surface` treatment is reserved for true overlay/sheet contexts (composer sheet, community action sheet) — list rows and feed cards become flat/bordered (spec "Visual system").

---

## File Structure

- Modify `ui/src/lib/social-data.js` — add `kind` to chats, MUC/group fields, `joined` flag on communities, and pure helper functions (`sortedChats`, `chatAvatarGlyph`).
- Modify `ui/src/app.css` — visual system changes: avatar shapes, flattened list/card surfaces, compact header typography, 3-column bottom nav grid, composer-sheet and community-sheet overlay styles.
- Modify `ui/src/routes/+page.svelte` — nav reduction, unified Chats list/detail, compact Feed header/filters, collapsible composer, simplified feed cards, community action sheet.
- Delete `ui/desktop-unified-feed.png`, `ui/desktop-unified-feed-2.png`, `ui/mobile-unified-feed.png`, `ui/mobile-unified-feed-2.png` — stale, mismatched mockups.
- Modify `docs/mobile-first-social-xmpp-ia.md` — update Primary Navigation / Screen Map to reflect the 3-item nav and unified Chats instead of a 5-item nav with separate Rooms/Activity.

---

### Task 1: Extend chat and community data model

**Files:**
- Modify: `ui/src/lib/social-data.js`

**Interfaces:**
- Produces: `chats[]` entries each have `kind: 'direct' | 'group' | 'muc'`, `lastActivityMinutesAgo: number`; `muc` entries additionally have `topic: string`, `localNick: string`, `occupants: { nick: string, presence: string }[]`; `group` entries additionally have `participants: string[]`.
- Produces: `communities[]` entries each have `joined: boolean`.
- Produces: `export const sortedChats = (chats) => Chat[]` — returns a new array sorted ascending by `lastActivityMinutesAgo`.
- Produces: `export const chatAvatarGlyph = (chat) => string` — returns the text to render inside a chat's avatar.
- Consumed by: Task 4 (Chats list/detail) renders using these fields and helpers.

- [ ] **Step 1: Write the failing check**

Run this from the repo root — it will fail because `sortedChats` and `chatAvatarGlyph` don't exist yet, and `chats` entries don't have `kind`:

```bash
node --input-type=module -e "
import { initialState, sortedChats, chatAvatarGlyph } from './ui/src/lib/social-data.js'
import assert from 'node:assert'
assert.ok(initialState.chats.every((c) => c.kind), 'every chat needs a kind')
assert.strictEqual(typeof sortedChats, 'function', 'sortedChats must be exported')
assert.strictEqual(typeof chatAvatarGlyph, 'function', 'chatAvatarGlyph must be exported')
console.log('OK')
"
```

Expected: throws (e.g. `sortedChats is not a function` or assertion failure), since none of this exists yet.

- [ ] **Step 2: Implement the data model changes**

Replace the `chats:` array and the `communities:` array inside `initialState` in `ui/src/lib/social-data.js`, and add the two helper exports at the bottom of the file.

Replace the existing `communities:` array with (adds `joined`):

```js
  communities: [
    {
      id: 'lattice',
      name: 'Lattice',
      tag: '#lattice',
      description: 'Decentralized social sync',
      members: 5,
      visibility: 'public',
      color: 'community',
      joined: true
    },
    {
      id: 'signal',
      name: 'Signal Lab',
      tag: '#signal-lab',
      description: 'Protocol experiments and testing',
      members: 3,
      visibility: 'private',
      color: 'community-alt',
      joined: false
    }
  ],
```

Replace the existing `chats:` array with (adds `kind`, `lastActivityMinutesAgo`, a `muc` room, and a `group` chat):

```js
  chats: [
    {
      id: 'aurora',
      kind: 'direct',
      name: 'Maya',
      secure: true,
      unread: 2,
      preview: 'Can you join the room after the feed post?',
      lastActivityMinutesAgo: 4,
      messages: [
        { from: 'Maya', text: 'Can you join the room after the feed post?', time: '09:14', self: false },
        { from: 'You', text: 'Yes. I will bring the secure thread summary.', time: '09:16', self: true },
        { from: 'Maya', text: 'Good. We should keep the roster visible.', time: '09:18', self: false }
      ]
    },
    {
      id: 'lattice-room',
      kind: 'muc',
      name: '#lattice-room',
      secure: false,
      topic: 'Decentralized social sync — room mirrors the Lattice community',
      localNick: 'atlas',
      occupants: [
        { nick: 'Maya', presence: 'available' },
        { nick: 'Jun', presence: 'away' },
        { nick: 'Priya', presence: 'available' },
        { nick: 'Sam', presence: 'busy' },
        { nick: 'Wren', presence: 'available' }
      ],
      preview: 'Jun, Maya +3 · Keeping the roster visible in sync with room state.',
      lastActivityMinutesAgo: 7,
      messages: [
        { from: 'Maya', text: 'Keeping the roster visible in sync with room state.', time: '09:05', self: false },
        { from: 'Jun', text: 'Confirmed on my side too.', time: '09:07', self: false }
      ]
    },
    {
      id: 'juniper',
      kind: 'direct',
      name: 'Jun',
      secure: false,
      unread: 0,
      preview: 'Checking DHT reachability and mdns peers.',
      lastActivityMinutesAgo: 33,
      messages: [
        { from: 'Jun', text: 'Checking DHT reachability and mdns peers.', time: '08:43', self: false },
        { from: 'You', text: 'Topologies look stable on loopback.', time: '08:44', self: true }
      ]
    },
    {
      id: 'core-team',
      kind: 'group',
      name: 'Core team',
      secure: true,
      unread: 1,
      participants: ['Maya', 'Jun', 'Priya'],
      preview: 'Priya: Pushed the attachment indexing fix.',
      lastActivityMinutesAgo: 50,
      messages: [
        { from: 'Priya', text: 'Pushed the attachment indexing fix.', time: '08:00', self: false },
        { from: 'Jun', text: 'Nice, testing it against the loopback peers now.', time: '08:05', self: false }
      ]
    }
  ],
```

Add these two exports at the end of the file, after `filterLabels`:

```js
export const sortedChats = (chats) => [...chats].sort((a, b) => a.lastActivityMinutesAgo - b.lastActivityMinutesAgo)

export const chatAvatarGlyph = (chat) => {
  if (chat.kind === 'group') {
    return `${chat.participants[0].slice(0, 1).toUpperCase()}+${chat.participants.length - 1}`
  }

  return chat.name.replace('#', '').slice(0, 1).toUpperCase()
}
```

- [ ] **Step 3: Run the check to verify it passes**

```bash
node --input-type=module -e "
import { initialState, sortedChats, chatAvatarGlyph } from './ui/src/lib/social-data.js'
import assert from 'node:assert'
assert.ok(initialState.chats.every((c) => c.kind), 'every chat needs a kind')
assert.strictEqual(typeof sortedChats, 'function')
assert.strictEqual(typeof chatAvatarGlyph, 'function')
const sorted = sortedChats(initialState.chats)
assert.strictEqual(sorted[0].id, 'aurora', 'aurora (4 min ago) should sort first')
assert.strictEqual(sorted[sorted.length - 1].id, 'core-team', 'core-team (50 min ago) should sort last')
assert.strictEqual(chatAvatarGlyph(initialState.chats.find((c) => c.id === 'core-team')), 'M+2')
assert.strictEqual(chatAvatarGlyph(initialState.chats.find((c) => c.id === 'lattice-room')), 'L')
assert.ok(initialState.communities.every((c) => typeof c.joined === 'boolean'))
console.log('OK')
"
```

Expected: prints `OK` with no assertion errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/lib/social-data.js
git commit -m "Add unified chat kinds (direct/group/muc) and community joined state"
```

---

### Task 2: Visual system CSS — avatar shapes, flat surfaces, color discipline, compact headers

**Files:**
- Modify: `ui/src/app.css`

**Interfaces:**
- Produces: `.avatar--square` class (rounded-square, for community/room avatars) to complement the existing default circular-by-default-no — note current `.avatar` is already rounded-square (`border-radius: 0.85rem`); this task flips the default to circular (person) and adds `.avatar--square` as the explicit community/room variant.
- Produces: `.row-flat` class for flattened list/card surfaces (border + subtle background, no blur, no heavy shadow).
- Produces: `.sheet` class for overlay/bottom-sheet contexts (keeps the existing blurred `.surface` look).
- Consumed by: Task 4 (Chats), Task 5/6 (Feed) apply these classes in markup.

- [ ] **Step 1: Confirm current baseline compiles**

```bash
cd ui && npm run check
```

Expected: passes with the current (pre-change) markup — this just confirms the baseline before editing CSS so any later failure is attributable to this task's edits.

- [ ] **Step 2: Update avatar shape rule**

In `ui/src/app.css`, find the existing `.avatar` rule (around line 422-432):

```css
.avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.85rem;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  font-weight: 700;
  flex: 0 0 auto;
}
```

Replace `border-radius: 0.85rem;` with `border-radius: 50%;` (default avatar is now circular = person), and add a new rule directly after it:

```css
.avatar--square {
  border-radius: 0.85rem;
}
```

- [ ] **Step 3: Add flattened row style and sheet style**

Add these new rules to `ui/src/app.css`, directly after the `.list__item` rule block (around line 537-550):

```css
.row-flat {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  border-radius: 0;
  text-align: left;
}

.row-flat:last-child {
  border-bottom: none;
}

.row-flat.is-active {
  background: rgba(77, 226, 200, 0.06);
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 12;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-4);
  max-height: 80vh;
  overflow-y: auto;
}

@media (min-width: 900px) {
  .sheet {
    position: static;
    border-radius: var(--radius-xl);
    max-height: none;
  }
}
```

- [ ] **Step 4: Compact the section header typography**

Find `.section__title h2` (around line 206-212):

```css
.section__title h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 5vw, 2.7rem);
  line-height: 1.04;
  max-width: 14ch;
}
```

Replace the `font-size` value:

```css
.section__title h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  line-height: 1.3;
  max-width: none;
}
```

And remove the desktop override in the `@media (min-width: 900px)` block (around line 681-683) that currently reads:

```css
  .section__title h2 {
    font-size: clamp(2rem, 4vw, 3.1rem);
  }
```

Delete that rule (the 1.2rem base size applies at all widths now).

- [ ] **Step 5: Reduce bottom nav to 3 columns**

Find `.bottom-nav` (around line 598-612):

```css
.bottom-nav {
  position: fixed;
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
  padding: 0.45rem;
  border-radius: 999px;
  background: rgba(5, 9, 14, 0.92);
  border: 1px solid var(--border);
  backdrop-filter: blur(20px);
}
```

Change `repeat(4, minmax(0, 1fr))` to `repeat(3, minmax(0, 1fr))`.

- [ ] **Step 6: Run check and verify no errors**

```bash
cd ui && npm run check
```

Expected: passes (CSS-only changes do not affect svelte-check's type/markup analysis, but this confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add ui/src/app.css
git commit -m "Add flat row, sheet, and avatar-shape styles; compact headers; 3-col nav"
```

---

### Task 3: Reduce navigation to Feed / Chats / Profile

**Files:**
- Modify: `ui/src/routes/+page.svelte:26-31` (sectionLabels), `:259-306` (communities section block), `:437-442` (bottom nav)

**Interfaces:**
- Consumes: nothing new from prior tasks (this task only removes the Communities section and nav button).
- Produces: `section` state now only takes `'feed' | 'chats' | 'profile'` — later tasks (4, 6) must not reference `section === 'communities'` or `activeCommunityId` for navigation purposes (the community action sheet added in Task 6 uses separate state, not `section`).

- [ ] **Step 1: Write the failing check**

```bash
cd ui && npm run check
```

Run this first to capture the current clean baseline (expected: passes, 0 errors) — then make the edits below and re-run to confirm they still pass, since removing markup can't be "tested to fail" the way new code can. The real regression check here is manual: after Step 2, `communities` must no longer appear as a nav destination.

- [ ] **Step 2: Update `sectionLabels`**

In `ui/src/routes/+page.svelte`, replace:

```js
  const sectionLabels = {
    feed: 'Feed',
    communities: 'Communities',
    chats: 'Chats',
    profile: 'Profile'
  }
```

with:

```js
  const sectionLabels = {
    feed: 'Feed',
    chats: 'Chats',
    profile: 'Profile'
  }
```

- [ ] **Step 3: Remove the Communities section block**

Delete the entire `{:else if section === 'communities'}` block (the section starting at `{:else if section === 'communities'}` and ending right before `{:else if section === 'chats'}`, currently lines 259-306). After deletion, the `{#if section === 'feed'}` block should be followed directly by `{:else if section === 'chats'}`.

Also remove the now-unused `activeCommunityId` state declaration (`let activeCommunityId = initialState.activeCommunityId`) and the `activeCommunity` helper function (`const activeCommunity = () => communities.find(...)`) — both become dead code once the Communities section is gone. Keep `communities` itself (still used by the feed composer targets and filters) and keep `initialState.activeCommunityId`/`activeFeedCommunityId` in `social-data.js` untouched (out of scope for this task; unused initial-state fields are harmless and other tasks don't depend on removing them).

- [ ] **Step 4: Update the bottom nav**

Replace:

```svelte
  <nav class="bottom-nav" aria-label="Primary navigation">
    <button class="nav__item" class:is-active={section === 'feed'} onclick={() => setSection('feed')}>Feed</button>
    <button class="nav__item" class:is-active={section === 'communities'} onclick={() => setSection('communities')}>Communities</button>
    <button class="nav__item" class:is-active={section === 'chats'} onclick={() => setSection('chats')}>Chats</button>
    <button class="nav__item" class:is-active={section === 'profile'} onclick={() => setSection('profile')}>Profile</button>
  </nav>
```

with:

```svelte
  <nav class="bottom-nav" aria-label="Primary navigation">
    <button class="nav__item" class:is-active={section === 'feed'} onclick={() => setSection('feed')}>Feed</button>
    <button class="nav__item" class:is-active={section === 'chats'} onclick={() => setSection('chats')}>Chats</button>
    <button class="nav__item" class:is-active={section === 'profile'} onclick={() => setSection('profile')}>Profile</button>
  </nav>
```

- [ ] **Step 5: Run check to verify it passes**

```bash
cd ui && npm run check
```

Expected: 0 errors. If `svelte-check` flags `activeCommunity` or `activeCommunityId` as unused-but-still-referenced somewhere, search the file for any remaining usage and remove it (there should be none after Step 3).

- [ ] **Step 6: Commit**

```bash
git add ui/src/routes/+page.svelte
git commit -m "Remove standalone Communities nav section; reduce nav to Feed/Chats/Profile"
```

---

### Task 4: Unified Chats list and adaptive detail view

**Files:**
- Modify: `ui/src/routes/+page.svelte` (the `{:else if section === 'chats'}` block, and its imports/script)

**Interfaces:**
- Consumes: `sortedChats`, `chatAvatarGlyph` from `ui/src/lib/social-data.js` (Task 1); `.row-flat`, `.avatar--square` from `ui/src/app.css` (Task 2).
- Produces: chats list renders all three `kind`s; detail view branches on `activeChat().kind`.

- [ ] **Step 1: Write the failing check**

```bash
cd ui && npm run check
```

Run before editing to confirm a clean baseline. Then, manually verify the gap this task fixes: start `npm run dev`, open the app, click "Chats" — the list currently shows only "Maya" and "Jun" (2 rows), with no MUC/group row and no occupant roster anywhere. After this task, it must show 4 rows (Maya, #lattice-room, Jun, Core team) sorted by recency, and selecting `#lattice-room` must show an occupant roster and topic.

- [ ] **Step 2: Update the import line**

Replace:

```js
  import { badgeClass, filterLabels, initialState, initials, sectionMeta } from '$lib/social-data.js'
```

with:

```js
  import { badgeClass, chatAvatarGlyph, filterLabels, initialState, initials, sectionMeta, sortedChats } from '$lib/social-data.js'
```

- [ ] **Step 3: Replace the Chats section markup**

Replace the entire `{:else if section === 'chats'}` block with:

```svelte
    {:else if section === 'chats'}
      <section class="section-stack">
        <div class="section-head">
          <div class="section__title">
            <p class="eyebrow">Chats</p>
            <h2>Direct, group, and room conversations</h2>
          </div>
        </div>

        <div class="list">
          {#each sortedChats(chats) as chat}
            <button class="row-flat" class:is-active={chat.id === activeChatId} type="button" onclick={() => (activeChatId = chat.id)}>
              <div class="row row--space">
                <div class="row">
                  <div class="avatar" class:avatar--square={chat.kind === 'muc'}>{chatAvatarGlyph(chat)}</div>
                  <div>
                    <strong>{chat.name}</strong>
                    <div class="meta">{chat.preview}</div>
                  </div>
                </div>
                {#if chat.kind === 'muc'}
                  <span class="meta">{chat.occupants.length} in room</span>
                {:else if chat.unread}
                  <span class="badge">{chat.unread} unread</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <article class="surface thread-shell">
          <div class="row row--space">
            <div>
              <p class="eyebrow">Selected thread</p>
              <h3>{activeChat().name}</h3>
              {#if activeChat().kind === 'muc'}
                <p class="meta">{activeChat().topic}</p>
              {/if}
            </div>
            <span class={activeChat().secure ? 'badge badge--secure' : 'badge badge--warn'}>
              {activeChat().secure ? 'E2EE' : 'open'}
            </span>
          </div>

          {#if activeChat().kind === 'muc'}
            <details class="inspector__block">
              <summary class="eyebrow">Occupants ({activeChat().occupants.length})</summary>
              <div class="inspector__grid">
                {#each activeChat().occupants as occupant}
                  <div class="kv"><span>{occupant.nick}</span><span>{occupant.presence}</span></div>
                {/each}
              </div>
            </details>
          {/if}

          <div class="thread">
            {#each activeChat().messages as message}
              <div class:bubble--self={message.self} class="bubble">
                <div class="row row--space">
                  <strong>{message.from}</strong>
                  <span class="meta mono">{message.time}</span>
                </div>
                <p>{message.text}</p>
              </div>
            {/each}
          </div>
        </article>
      </section>
```

- [ ] **Step 4: Run check to verify it passes**

```bash
cd ui && npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Manual verification**

```bash
npm run dev
```

Open the printed local URL, click "Chats". Confirm: 4 rows in recency order (Maya, #lattice-room, Jun, Core team); `#lattice-room` has a square avatar and shows "5 in room"; selecting it shows the topic and an expandable "Occupants (5)" list with presence per nick; selecting "Core team" shows avatar glyph "M+2".

- [ ] **Step 6: Commit**

```bash
git add ui/src/routes/+page.svelte
git commit -m "Unify Chats list and detail view across direct, group, and MUC conversations"
```

---

### Task 5: Compact Feed header and filter row

**Files:**
- Modify: `ui/src/routes/+page.svelte` (the start of the `{#if section === 'feed'}` block)

**Interfaces:**
- Consumes: `.row-flat` is not used here; this task only touches header/filter markup and relies on Task 2's compacted `.section__title h2` CSS already applying automatically.
- Produces: no new exports; `feed-controls`/`chip-row` markup gets a "plain text, single active state" treatment via a new `.chip--plain` class added in this task's CSS edit.

- [ ] **Step 1: Write the failing check**

```bash
cd ui && npm run check
```

Confirm clean baseline. Manual gap check: open the app on a ~390px-wide window — the Feed section currently shows a 3-line descriptive paragraph under "People and communities in one chronological stream." This task removes that paragraph and the filter chips' borders-on-inactive treatment.

- [ ] **Step 2: Add the plain-chip CSS**

In `ui/src/app.css`, directly after the existing `.chip.is-active` rule (around line 380-384), add:

```css
.chip--plain {
  border-color: transparent;
  background: transparent;
  padding-inline: 0.6rem;
}

.chip--plain.is-active {
  background: #1c2733;
  border-color: transparent;
  color: var(--text);
}
```

- [ ] **Step 3: Simplify the Feed section head**

Replace:

```svelte
        <div class="section-head">
          <div class="section__title">
            <p class="eyebrow">Feed</p>
            <h2>All activity from people and communities</h2>
            <p>{sectionMeta.feed}</p>
          </div>
        </div>
```

with:

```svelte
        <div class="section-head">
          <div class="section__title">
            <h2>Feed</h2>
          </div>
        </div>
```

- [ ] **Step 4: Apply the plain-chip class to the filter row**

Replace the feed-controls block:

```svelte
        <section class="feed-controls surface">
          <div class="chip-row" aria-label="Feed filters">
            <button class="chip" class:is-active={feedFilter === 'all'} type="button" onclick={() => setFeedFilter('all')}>
              {filterLabels.all}
            </button>
            <button class="chip" class:is-active={feedFilter === 'people'} type="button" onclick={() => setFeedFilter('people')}>
              {filterLabels.people}
            </button>
            <button class="chip" class:is-active={feedFilter === 'communities'} type="button" onclick={() => setFeedFilter('communities')}>
              {filterLabels.communities}
            </button>
            {#each communities as community}
              <button
                class="chip chip--ghost"
                class:is-active={feedFilter === `community:${community.id}`}
                type="button"
                onclick={() => setFeedFilter(`community:${community.id}`)}
              >
                {community.tag}
              </button>
            {/each}
          </div>
        </section>
```

with:

```svelte
        <section class="feed-controls">
          <div class="chip-row" aria-label="Feed filters">
            <button class="chip chip--plain" class:is-active={feedFilter === 'all'} type="button" onclick={() => setFeedFilter('all')}>
              {filterLabels.all}
            </button>
            <button class="chip chip--plain" class:is-active={feedFilter === 'people'} type="button" onclick={() => setFeedFilter('people')}>
              {filterLabels.people}
            </button>
            <button class="chip chip--plain" class:is-active={feedFilter === 'communities'} type="button" onclick={() => setFeedFilter('communities')}>
              {filterLabels.communities}
            </button>
            {#each communities as community}
              <button
                class="chip chip--plain"
                class:is-active={feedFilter === `community:${community.id}`}
                type="button"
                onclick={() => setFeedFilter(`community:${community.id}`)}
              >
                {community.tag}
              </button>
            {/each}
          </div>
        </section>
```

(Dropping the `surface` class from `.feed-controls` removes its bordered/blurred background, consistent with reserving `.surface` for overlay contexts.)

- [ ] **Step 5: Run check to verify it passes**

```bash
cd ui && npm run check
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add ui/src/app.css ui/src/routes/+page.svelte
git commit -m "Compact Feed header and switch filter chips to plain-text active state"
```

---

### Task 6: Collapsible composer (FAB + sheet)

**Files:**
- Modify: `ui/src/routes/+page.svelte` (composer markup and script state)

**Interfaces:**
- Consumes: `.sheet` class from Task 2.
- Produces: `let composerOpen = false` state; composer form only renders inside the sheet when `composerOpen` is true; a `+` button in the Feed header toggles it; `submitComposer` additionally sets `composerOpen = false` on successful submit.

- [ ] **Step 1: Write the failing check**

```bash
cd ui && npm run check
```

Confirm clean baseline. Manual gap check: on a ~390px window, the composer is currently always expanded and sticky, occupying a large share of the viewport above the feed list. This task collapses it behind a `+` button by default.

- [ ] **Step 2: Add `composerOpen` state**

Near the other `let` declarations at the top of the `<script>` block (after `let composerBody = ''`), add:

```js
  let composerOpen = false
```

- [ ] **Step 3: Update `submitComposer` to close the sheet on submit**

Find the end of `submitComposer` (currently ends with `composerBody = ''` then `section = 'feed'`). Add `composerOpen = false` right after `composerBody = ''`:

```js
    activeFeedId = feedItems[0].id
    composerBody = ''
    composerOpen = false
    section = 'feed'
```

- [ ] **Step 4: Add the `+` trigger to the Feed section head**

Update the section head from Task 5 to include a trigger button:

```svelte
        <div class="section-head row row--space">
          <div class="section__title">
            <h2>Feed</h2>
          </div>
          <button class="avatar" type="button" aria-label="New post" onclick={() => (composerOpen = true)}>+</button>
        </div>
```

- [ ] **Step 5: Wrap the composer in a conditional sheet**

Replace the `<section class="composer surface composer--sticky">...</section>` block with:

```svelte
        {#if composerOpen}
          <section class="sheet" role="dialog" aria-label="New post">
            <div class="surface__head">
              <div>
                <p class="eyebrow">New post</p>
                <h3>Share to your feed or a community</h3>
              </div>
              <label class="toggle">
                <input bind:checked={secure} type="checkbox" />
                <span>E2EE</span>
              </label>
            </div>

            <div class="composer__targets" aria-label="Post destination">
              {#each composerTargets() as target}
                <button
                  class="chip"
                  class:is-active={composerTargetId === target.id}
                  type="button"
                  onclick={() => setComposerTarget(target.id)}
                >
                  {target.tag}
                </button>
              {/each}
            </div>

            <form class="composer__form" onsubmit={submitComposer}>
              <label class="field field--grow">
                <span>Message</span>
                <textarea bind:value={composerBody} rows="3" placeholder="Write a post"></textarea>
              </label>
              <div class="composer__actions">
                <p class="hint">Posting to: {composerTarget().tag}</p>
                <button class="button button--ghost" type="button" onclick={() => (composerOpen = false)}>Cancel</button>
                <button class="button" type="submit">Publish</button>
              </div>
            </form>
          </section>
        {/if}
```

- [ ] **Step 6: Run check to verify it passes**

```bash
cd ui && npm run check
```

Expected: 0 errors.

- [ ] **Step 7: Manual verification**

```bash
npm run dev
```

Confirm: Feed loads with no composer visible above the fold; tapping the `+` button opens the sheet (fixed to the bottom of the viewport on mobile widths, inline on desktop widths per the `@media (min-width: 900px)` rule from Task 2); "Cancel" and a successful "Publish" both close it.

- [ ] **Step 8: Commit**

```bash
git add ui/src/routes/+page.svelte
git commit -m "Collapse feed composer behind a + trigger opening a bottom sheet"
```

---

### Task 7: Simplify feed cards and add the community action sheet

**Files:**
- Modify: `ui/src/routes/+page.svelte` (feed card markup, script state)
- Modify: `ui/src/lib/social-data.js` (none — `joined` already added in Task 1)

**Interfaces:**
- Consumes: `communities[]` (with `joined` from Task 1), `.row-flat`, `.sheet`, `.avatar--square` from earlier tasks.
- Produces: `let communitySheetId = null` state; clicking a community feed item's source pill opens the sheet; sheet has a working join/leave toggle that mutates `communities`.

- [ ] **Step 1: Write the failing check**

```bash
cd ui && npm run check
```

Confirm clean baseline. Manual gap check: in the Feed, community posts show a pill (e.g. `#lattice`) that is currently inert — clicking it does nothing, and there is no join/leave control anywhere now that the Communities nav section is gone (Task 3).

- [ ] **Step 2: Add `communitySheetId` state**

Near `let composerOpen = false` (added in Task 6), add:

```js
  let communitySheetId = null

  const communitySheetTarget = () => communities.find((item) => item.id === communitySheetId)

  const toggleCommunityMembership = () => {
    communities = communities.map((item) =>
      item.id === communitySheetId ? { ...item, joined: !item.joined } : item
    )
  }
```

- [ ] **Step 3: Make the community source pill clickable**

Find the feed card markup:

```svelte
              <div class="pill-row">
                <span class={item.sourceType === 'community' ? 'pill pill--community' : 'pill pill--person'}>
                  {item.sourceLabel}
                </span>
                {#if item.sourceType === 'person'}
                  <span class="pill pill--muted">From {item.sourceLabel}</span>
                {/if}
              </div>
```

Replace with:

```svelte
              <div class="pill-row">
                {#if item.sourceType === 'community'}
                  <button class="pill pill--community" type="button" onclick={() => (communitySheetId = item.sourceId)}>
                    {item.sourceLabel}
                  </button>
                {:else}
                  <span class="pill pill--person">{item.sourceLabel}</span>
                  <span class="pill pill--muted">From {item.sourceLabel}</span>
                {/if}
              </div>
```

- [ ] **Step 4: Add the community sheet markup**

Add this directly after the closing `</section>` of the `feed-list` section (still inside the `{#if section === 'feed'}` block, as the last element before that block's closing `</section>`):

```svelte
        {#if communitySheetId}
          <section class="sheet" role="dialog" aria-label="Community details">
            <div class="row row--space">
              <div class="row">
                <div class="avatar avatar--square">{communitySheetTarget().name.slice(0, 1)}</div>
                <div>
                  <strong>{communitySheetTarget().name}</strong>
                  <div class="meta">{communitySheetTarget().tag}</div>
                </div>
              </div>
              <span class={communitySheetTarget().visibility === 'public' ? 'badge badge--secure' : 'badge badge--warn'}>
                {communitySheetTarget().visibility}
              </span>
            </div>
            <p>{communitySheetTarget().description}</p>
            <div class="inspector__grid">
              <div class="kv"><span>Members</span><span>{communitySheetTarget().members}</span></div>
            </div>
            <div class="composer__actions">
              <button
                class={communitySheetTarget().joined ? 'button button--ghost' : 'button'}
                type="button"
                onclick={toggleCommunityMembership}
              >
                {communitySheetTarget().joined ? 'Leave community' : 'Join community'}
              </button>
              <button class="button button--ghost" type="button" onclick={() => (communitySheetId = null)}>Close</button>
            </div>
          </section>
        {/if}
```

- [ ] **Step 5: Simplify the feed card header**

Replace the existing feed card head/badge block:

```svelte
              <div class="feed-card__head">
                <div class="feed-author">
                  <div class="avatar avatar--feed">{item.avatar}</div>
                  <div>
                    <div class="row row--tight">
                      <strong>{item.title}</strong>
                      <span class="badge badge--time">{item.time}</span>
                    </div>
                    <div class="meta">{item.sourceType === 'community' ? 'Community post' : 'Profile post'}</div>
                  </div>
                </div>
                <span class={item.secure ? 'badge badge--secure' : 'badge badge--warn'}>{item.secure ? 'E2EE' : 'open'}</span>
              </div>
```

with:

```svelte
              <div class="feed-card__head">
                <div class="feed-author">
                  <div class="avatar avatar--feed" class:avatar--square={item.sourceType === 'community'}>{item.avatar}</div>
                  <div>
                    <strong>{item.title}</strong>
                  </div>
                </div>
                <span class="meta mono">{item.time}</span>
              </div>
```

And replace the existing actions row:

```svelte
              <div class="feed-card__actions">
                <div class="action-group">
                  {#each item.reactions as reaction}
                    <span class="badge badge--muted">{reaction}</span>
                  {/each}
                </div>
                <button class="button button--ghost button--small" type="button">Reply</button>
              </div>
```

with:

```svelte
              <div class="feed-card__actions">
                <div class="action-group">
                  {#each item.reactions as reaction}
                    <span class="meta">{reaction}</span>
                  {/each}
                  {#if item.secure}
                    <span class="meta" aria-label="Encrypted">🔒</span>
                  {/if}
                </div>
                <button class="button button--ghost button--small" type="button">Reply</button>
              </div>
```

- [ ] **Step 6: Run check to verify it passes**

```bash
cd ui && npm run check
```

Expected: 0 errors.

- [ ] **Step 7: Manual verification**

```bash
npm run dev
```

Confirm: feed cards no longer show a separate time badge or secure/open badge in the header (time moves to the trailing meta line, lock icon appears only when `secure`); clicking a community pill (e.g. `#lattice`) opens the community sheet; "Leave community" toggles to "Join community" and persists while the sheet is open.

- [ ] **Step 8: Commit**

```bash
git add ui/src/routes/+page.svelte
git commit -m "Simplify feed card header/actions and add community join/leave action sheet"
```

---

### Task 8: Cleanup — stale screenshots and IA doc

**Files:**
- Delete: `ui/desktop-unified-feed.png`, `ui/desktop-unified-feed-2.png`, `ui/mobile-unified-feed.png`, `ui/mobile-unified-feed-2.png`
- Modify: `docs/mobile-first-social-xmpp-ia.md:38-62` (Primary Navigation), `:64-170` (Screen Map)

**Interfaces:**
- None — documentation/asset cleanup only, no code interfaces.

- [ ] **Step 1: Delete the stale screenshots**

```bash
git rm ui/desktop-unified-feed.png ui/desktop-unified-feed-2.png ui/mobile-unified-feed.png ui/mobile-unified-feed-2.png
```

- [ ] **Step 2: Update Primary Navigation in the IA doc**

Replace the "Primary Navigation" section (currently listing 5 items: Home, Chats, Contacts, Rooms, Activity) with:

```markdown
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
```

- [ ] **Step 3: Update the Screen Map**

Replace the "### Home", "### Contacts", "### Rooms", "### Activity", and "### Inspect / More" sections (and retitle "### Chats") so the Screen Map matches the 3-destination nav:

```markdown
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
```

Also update the "Information Hierarchy" and any other section referencing the old 5-destination nav (search the file for "Rooms" and "Activity" outside of code/SVG-pattern references — e.g. "Room occupancy" patterns under SVG Usage are still valid and should stay) to remove mentions of separate Rooms/Contacts/Activity/Inspect destinations.

- [ ] **Step 4: Verify no stale references remain**

```bash
grep -n "5 to 6\|## Primary Navigation\|### Home\|### Contacts\|### Rooms\|### Activity\|### Inspect" docs/mobile-first-social-xmpp-ia.md
```

Expected: no output (or only expected matches inside unrelated prose you've intentionally kept — review any hits manually).

- [ ] **Step 5: Commit**

```bash
git add -A docs/mobile-first-social-xmpp-ia.md
git commit -m "Remove stale UI screenshots; update IA doc for 3-item nav and unified chats"
```

---

## Final Verification

- [ ] **Step 1: Full check**

```bash
cd ui && npm run check
```

Expected: 0 errors, 0 warnings introduced by this work.

- [ ] **Step 2: Full manual pass**

```bash
npm run dev
```

At a ~390px-wide window and a ~1280px-wide window, confirm:
- Bottom/left nav shows exactly Feed, Chats, Profile
- Feed: compact header, plain-text filter chips with one active state, composer collapsed behind `+` until tapped, feed cards show avatar shape by type (circle/square) with no separate time/secure badges in the header, community pills open the action sheet with working join/leave
- Chats: single recency-sorted list with direct/group/muc rows distinguished by avatar shape and trailing text; MUC detail view shows topic + occupant roster; direct/group detail view shows the message thread
- Profile: unchanged from before this work

- [ ] **Step 3: Commit any final fixups**

```bash
git add -A
git commit -m "Final fixups for unified feed and unified chats redesign"
```

(Only run this if Step 2 surfaced something to fix — otherwise skip, there's nothing to commit.)
