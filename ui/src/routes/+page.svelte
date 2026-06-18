<script>
  import PeerGraph from '$lib/PeerGraph.svelte'
  import { badgeClass, chatAvatarGlyph, filterLabels, initialState, initials, sectionMeta, sortedChats } from '$lib/social-data.js'

  const clone = (value) => structuredClone(value)

  let section = initialState.section
  let feedFilter = initialState.feedFilter
  let secure = initialState.secure
  let presence = initialState.presence
  let presenceMessage = initialState.presenceMessage
  let activeChatId = initialState.activeChatId
  let activeFeedId = initialState.activeFeedId
  let composerTargetId = initialState.composerTargetId
  let composerBody = ''

  let identity = initialState.identity
  let peers = clone(initialState.peers)
  let contacts = clone(initialState.contacts)
  let communities = clone(initialState.communities)
  let chats = clone(initialState.chats)
  let feedItems = clone(initialState.feedItems)
  let protocol = clone(initialState.protocol)

  const sectionLabels = {
    feed: 'Feed',
    chats: 'Chats',
    profile: 'Profile'
  }

  const activeChat = () => chats.find((item) => item.id === activeChatId) ?? chats[0]
  const activeFeedItem = () => feedItems.find((item) => item.id === activeFeedId) ?? feedItems[0]
  const onlineContacts = () => contacts.filter((item) => item.presence === 'available')

  const composerTarget = () =>
    composerTargetId === 'feed'
      ? { id: 'feed', label: 'My feed', tag: 'My feed', kind: 'profile' }
      : communities.find((item) => item.id === composerTargetId) ?? communities[0]

  const composerTargets = () => [
    { id: 'feed', label: 'My feed', tag: 'My feed', kind: 'profile' },
    ...communities.map((community) => ({
      ...community,
      label: community.name
    }))
  ]

  const filteredFeedItems = () => {
    if (feedFilter === 'people') {
      return feedItems.filter((item) => item.sourceType === 'person')
    }

    if (feedFilter === 'communities') {
      return feedItems.filter((item) => item.sourceType === 'community')
    }

    if (feedFilter.startsWith('community:')) {
      const communityId = feedFilter.split(':')[1]
      return feedItems.filter((item) => item.sourceId === communityId)
    }

    return feedItems
  }

  const setSection = (next) => {
    section = next
  }

  const setFeedFilter = (next) => {
    feedFilter = next
  }

  const setComposerTarget = (next) => {
    composerTargetId = next
  }

  const submitComposer = (event) => {
    event.preventDefault()
    const body = composerBody.trim()
    if (!body) return

    const target = composerTarget()

    feedItems = [
      target.id === 'feed'
        ? {
            id: `post-${Date.now()}`,
            sourceType: 'person',
            sourceId: 'self',
            sourceLabel: identity.nickname,
            avatar: initials(identity.nickname),
            title: 'Posted from your profile',
            body,
            time: 'now',
            reactions: ['↩︎ 0', '♥ 0'],
            secure
          }
        : {
            id: `post-${Date.now()}`,
            sourceType: 'community',
            sourceId: target.id,
            sourceLabel: target.tag,
            avatar: target.name.slice(0, 1).toUpperCase(),
            title: `Posted to ${target.name}`,
            body,
            time: 'now',
            reactions: ['↩︎ 0', '♥ 0'],
            secure: secure || target.visibility === 'private'
          },
      ...feedItems
    ]

    activeFeedId = feedItems[0].id
    composerBody = ''
    section = 'feed'
  }
</script>

<svelte:head>
  <title>XMPP P2P Feed</title>
  <meta
    name="description"
    content="Mobile-first XMPP social app with a unified feed, simple bottom navigation, and plain-language profile and presence controls."
  />
</svelte:head>

<div class="app-shell">
  <main class="main">
    <header class="topbar surface">
      <div class="topbar__identity">
        <div class="avatar avatar--top">{initials(identity.nickname)}</div>
        <div class="topbar__copy">
          <p class="eyebrow">{sectionLabels[section]}</p>
          <strong>{identity.nickname}</strong>
          <span class="topbar__meta">{presenceMessage}</span>
        </div>
      </div>

      <div class="topbar__status">
        <span class={`status-dot status-dot--${presence}`} aria-hidden="true"></span>
        <span class={badgeClass(presence)}>{presence}</span>
      </div>
    </header>

    {#if section === 'feed'}
      <section class="section-stack">
        <div class="section-head">
          <div class="section__title">
            <p class="eyebrow">Feed</p>
            <h2>All activity from people and communities</h2>
            <p>{sectionMeta.feed}</p>
          </div>
        </div>

        <section class="composer surface composer--sticky">
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
              <button class="button" type="submit">Publish</button>
            </div>
          </form>
        </section>

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

        <section class="feed-list">
          {#each filteredFeedItems() as item}
            <article class="feed-card surface" class:feed-card--community={item.sourceType === 'community'}>
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

              <div class="pill-row">
                <span class={item.sourceType === 'community' ? 'pill pill--community' : 'pill pill--person'}>
                  {item.sourceLabel}
                </span>
                {#if item.sourceType === 'person'}
                  <span class="pill pill--muted">From {item.sourceLabel}</span>
                {/if}
              </div>

              <p class="feed-card__body">{item.body}</p>

              <div class="feed-card__actions">
                <div class="action-group">
                  {#each item.reactions as reaction}
                    <span class="badge badge--muted">{reaction}</span>
                  {/each}
                </div>
                <button class="button button--ghost button--small" type="button">Reply</button>
              </div>
            </article>
          {/each}
        </section>
      </section>
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
    {:else}
      <section class="section-stack">
        <div class="section-head">
          <div class="section__title">
            <p class="eyebrow">Profile</p>
            <h2>Account, availability, and connection state</h2>
            <p>{sectionMeta.profile}</p>
          </div>
        </div>

        <article class="surface profile-card">
          <div class="profile-head">
            <div class="feed-author">
              <div class="avatar avatar--feed">{initials(identity.nickname)}</div>
              <div>
                <strong>{identity.nickname}</strong>
                <div class="meta">{identity.jid}</div>
              </div>
            </div>
            <span class={badgeClass(presence)}>{presence}</span>
          </div>

          <div class="profile-grid">
            <div class="kv"><span>XMPP address</span><span>{identity.jid}</span></div>
            <div class="kv"><span>Peer id</span><span>{identity.peerId.slice(0, 18)}…</span></div>
            <div class="kv"><span>Transport</span><span>{identity.transport}</span></div>
            <div class="kv"><span>Connection</span><span>{identity.connection}</span></div>
          </div>
        </article>

        <article class="surface profile-card">
          <div class="surface__head">
            <div>
              <p class="eyebrow">Availability</p>
              <h3>Update your status</h3>
            </div>
          </div>
          <div class="profile-controls">
            <label class="field">
              <span>Status</span>
              <select bind:value={presence}>
                <option value="available">Available</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="dnd">Do not disturb</option>
              </select>
            </label>
            <label class="field">
              <span>Message</span>
              <input bind:value={presenceMessage} type="text" placeholder="Online and reachable" />
            </label>
            <button class="button button--secondary" type="button">Update presence</button>
          </div>
        </article>

        <article class="surface profile-card">
          <div class="section__title">
            <p class="eyebrow">Topology</p>
            <h3>Peer graph</h3>
          </div>
          <PeerGraph {peers} />
        </article>

        <article class="surface profile-card">
          <div class="section__title">
            <p class="eyebrow">Protocol</p>
            <h3>Connection state</h3>
          </div>
          <div class="inspector__block">
            {#each protocol as item}
              <div class="kv"><span>{item.label}</span><span>{item.value}</span></div>
            {/each}
          </div>
        </article>
      </section>
    {/if}
  </main>

  <nav class="bottom-nav" aria-label="Primary navigation">
    <button class="nav__item" class:is-active={section === 'feed'} onclick={() => setSection('feed')}>Feed</button>
    <button class="nav__item" class:is-active={section === 'chats'} onclick={() => setSection('chats')}>Chats</button>
    <button class="nav__item" class:is-active={section === 'profile'} onclick={() => setSection('profile')}>Profile</button>
  </nav>
</div>
