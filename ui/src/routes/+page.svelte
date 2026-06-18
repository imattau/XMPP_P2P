<script>
  import { badgeClass, chatAvatarGlyph, filterLabels, initials, sortedChats } from '$lib/social-data.js'
  import { tick } from 'svelte'

  const clone = (value) => structuredClone(value)
  export let data

  const snapshot = clone(data.snapshot)

  let section = snapshot.section
  let feedFilter = snapshot.feedFilter
  let secure = snapshot.secure
  let presence = snapshot.presence
  let presenceMessage = snapshot.presenceMessage
  let presenceSheetOpen = false
  let activeChatId = snapshot.activeChatId
  let chatDetailOpen = false
  let activeCommunityId = snapshot.communities[0]?.id ?? ''
  let activeFeedId = snapshot.activeFeedId
  let feedDetailOpen = false
  let composerTargetId = snapshot.composerTargetId
  let composerActionId = 'feed-post'
  let composerBody = ''
  let composerTopicTitle = ''
  let composerGroupName = ''
  let composerGroupParticipants = []
  let composerChatContactId = snapshot.contacts[0]?.id ?? ''
  let composerMucRoomName = ''
  let composerMucTopic = ''
  let composerMucCommunityId = activeCommunityId
  let composerMucDefaultMode = 'secure'
  let composerMucAutoJoin = true
  let composerSecure = snapshot.secure
  let composerOpen = false
  let composerMenuOpen = false
  let destinationPickerOpen = false
  let fabPressTimer = null
  let fabLongPressTriggered = false
  let mucTopicDraft = ''
  let mucCommunityIdDraft = ''
  let mucDefaultModeDraft = 'secure'
  let mucAutoJoinDraft = true
  let mucSettingsOpen = false
  let communitySheetId = null
  let rosterJid = ''
  let rosterName = ''
  let rosterActionBusy = false
  let contactsSearch = ''
  let contactsFilter = 'all'
  let showAddContact = false
  let runtimeError = ''
  let presenceDialogEl
  let composerMenuDialogEl
  let composerDialogEl
  let communityDialogEl
  let presenceSheetWasOpen = false
  let composerMenuWasOpen = false
  let composerWasOpen = false
  let communitySheetWasOpen = false
  let advancedOpen = false
  let advancedDialogEl
  let advancedWasOpen = false

  const filteredContacts = () => {
    let result = contacts
    if (contactsFilter === 'online') {
      result = result.filter(c => c.presence && c.presence !== 'offline' && c.presence !== 'unavailable')
    }
    const q = contactsSearch.trim().toLowerCase()
    if (q) {
      result = result.filter(c => 
        (c.name || '').toLowerCase().includes(q) || 
        (c.jid || '').toLowerCase().includes(q)
      )
    }
    return result
  }

  const communitySheetTarget = () => communities.find((item) => item.id === communitySheetId)
  const nonLocalPeers = () => peers.filter((peer) => peer.kind !== 'local')
  const activeMucChat = () => chats.find((item) => item.id === activeChatId && item.kind === 'muc')

  const openError = (message) => {
    runtimeError = message
  }

  const clearRuntimeError = () => {
    runtimeError = ''
  }

  const syncMucDraftFromChat = (chat) => {
    if (!chat || chat.kind !== 'muc') return
    mucSettingsOpen = false
    mucTopicDraft = chat.topic ?? ''
    mucCommunityIdDraft = chat.communityId ?? ''
    mucDefaultModeDraft = chat.defaultSecure === false ? 'open' : 'secure'
    mucAutoJoinDraft = chat.autoJoin ?? true
  }

  const toggleCommunityMembership = async () => {
    const target = communitySheetTarget()
    if (!target) return
    const action = target.joined ? 'community:leave' : 'community:join'
    await postRuntimeAction(action, { id: target.id, name: target.name })
    communitySheetId = null
  }

  const addRosterContact = async (event) => {
    event.preventDefault()
    const jid = rosterJid.trim()
    if (!jid) return

    await postRuntimeAction('roster:add', {
      jid,
      name: rosterName.trim() || undefined
    })
    rosterJid = ''
    rosterName = ''
  }

  const toggleRosterPresence = async (contact) => {
    const action = contact.subscription === 'none' || contact.subscription === 'from'
      ? 'roster:subscribe'
      : 'roster:unsubscribe'
    await postRuntimeAction(action, { jid: contact.jid })
  }

  const removeRosterContact = async (contact) => {
    await postRuntimeAction('roster:remove', { jid: contact.jid })
  }

  const saveMucRoomSettings = async () => {
    const room = activeMucChat()
    if (!room?.roomName) return
    await postRuntimeAction('chat:muc:update', {
      roomName: room.roomName,
      topic: mucTopicDraft.trim() || undefined,
      communityId: mucCommunityIdDraft.trim() || undefined,
      autoJoin: mucAutoJoinDraft,
      defaultMode: mucDefaultModeDraft
    })
  }

  let identity = clone(snapshot.identity)
  let peers = clone(snapshot.peers)
  let contacts = clone(snapshot.contacts)
  let communities = clone(snapshot.communities)
  let chats = clone(snapshot.chats)
  let feedItems = clone(snapshot.feedItems)
  let protocol = clone(snapshot.protocol)
  let security = clone(snapshot.security)
  let attachmentSummaries = clone(snapshot.attachmentSummaries ?? [])
  let uploadTargetPeerId = snapshot.contacts[0]?.id ?? ''
  let uploadFile = null
  let uploadResultUrl = ''
  let uploadBusy = false
  let attachmentActionBusy = false

  const applySnapshot = (next) => {
    identity = clone(next.identity)
    peers = clone(next.peers)
    contacts = clone(next.contacts)
    communities = clone(next.communities)
    chats = clone(next.chats)
    feedItems = clone(next.feedItems)
    protocol = clone(next.protocol)
    security = clone(next.security)
    attachmentSummaries = clone(next.attachmentSummaries ?? [])
    presence = next.presence
    presenceMessage = next.presenceMessage
    secure = next.secure
    activeChatId = next.activeChatId
    activeFeedId = next.activeFeedId
    activeCommunityId = next.communities.find((community) => community.id === activeCommunityId)?.id ?? next.communities[0]?.id ?? activeCommunityId
    composerMucCommunityId = activeCommunityId
    composerChatContactId = next.contacts[0]?.id ?? composerChatContactId
    uploadTargetPeerId = next.contacts.find((contact) => contact.id === uploadTargetPeerId)?.id ?? next.contacts[0]?.id ?? uploadTargetPeerId
    syncMucDraftFromChat(chats.find((item) => item.id === activeChatId && item.kind === 'muc'))
  }

  const postRuntimeAction = async (action, payload = {}) => {
    rosterActionBusy = true
    clearRuntimeError()
    try {
      const response = await fetch('/api/runtime', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      })

      const next = await response.json()
      if (!response.ok) {
        throw new Error(next.error ?? 'Runtime action failed')
      }

      applySnapshot(next)
      return next
    } catch (error) {
      openError(error instanceof Error ? error.message : 'Runtime action failed')
      return undefined
    } finally {
      rosterActionBusy = false
    }
  }

  const postRuntimeResult = async (action, payload = {}) => {
    clearRuntimeError()
    const response = await fetch('/api/runtime', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    })

    const next = await response.json()
    if (!response.ok) {
      throw new Error(next.error ?? 'Runtime action failed')
    }

    return next
  }

  const focusModal = async (element) => {
    if (!element) return
    await tick()
    const firstControl = element.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (firstControl?.focus) {
      firstControl.focus()
      return
    }

    element.focus?.()
  }

  const sectionLabels = {
    feed: 'Feed',
    chats: 'Chats',
    contacts: 'Contacts'
  }

  const composerActions = {
    feed: [
      {
        id: 'feed-post',
        label: 'New Post',
        description: 'Post to your feed'
      },
      {
        id: 'feed-community-post',
        label: 'New Community Post',
        description: 'Post directly to a community'
      },
      {
        id: 'feed-topic-post',
        label: 'New Topic Post',
        description: 'Start a topic inside a community'
      }
    ],
    chats: [
      {
        id: 'chat-direct',
        label: 'New Chat',
        description: 'Start a direct conversation'
      },
      {
        id: 'chat-group',
        label: 'New Group Chat',
        description: 'Create a chat with several people'
      },
      {
        id: 'chat-muc',
        label: 'Create MUC',
        description: 'Open a multi-user chat room with settings'
      }
    ]
  }

  const fallbackChat = {
    id: 'empty',
    kind: 'direct',
    name: 'No conversations yet',
    secure: false,
    unread: 0,
    preview: 'Start a message to populate the live thread list.',
    lastActivityMinutesAgo: 0,
    messages: []
  }

  const fallbackFeedItem = {
    id: 'empty',
    sourceType: 'person',
    sourceId: 'self',
    sourceLabel: identity.nickname,
    avatar: initials(identity.nickname),
    title: 'No feed items yet',
    body: 'Publish a post to populate the live feed.',
    time: 'now',
    reactions: ['↩︎ 0', '♥ 0'],
    secure: false
  }

  const activeChat = () => chats.find((item) => item.id === activeChatId) ?? chats[0] ?? fallbackChat
  const activeFeedItem = () => feedItems.find((item) => item.id === activeFeedId) ?? feedItems[0] ?? fallbackFeedItem
  const onlineContacts = () => contacts.filter((item) => item.presence === 'available')
  const selectedFeedItem = () => activeFeedItem()
  const selectedComposerAction = () => {
    const actions = composerActions[section] ?? composerActions.feed
    return actions.find((item) => item.id === composerActionId) ?? actions[0]
  }
  const defaultComposerActionId = () => composerActions[section]?.[0]?.id ?? composerActions.feed[0].id
  const composerMenuActions = () => composerActions[section] ?? []

  const composerTarget = () =>
    composerTargetId === 'feed'
      ? { id: 'feed', label: 'My feed', tag: 'My feed', kind: 'profile' }
      : communities.find((item) => item.id === composerTargetId) ?? communities[0] ?? { id: 'feed', label: 'My feed', tag: 'My feed', kind: 'profile' }

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
    composerOpen = false
    composerMenuOpen = false
    endFabPress()
  }

  const setFeedFilter = (next) => {
    feedFilter = next
  }

  const setComposerTarget = (next) => {
    composerTargetId = next
  }

  const setComposerChatContact = (next) => {
    composerChatContactId = next
  }

  const toggleComposerGroupParticipant = (next) => {
    composerGroupParticipants = composerGroupParticipants.includes(next)
      ? composerGroupParticipants.filter((item) => item !== next)
      : [...composerGroupParticipants, next]
  }

  const resetComposerDraft = (actionId) => {
    destinationPickerOpen = false
    composerActionId = actionId
    composerBody = ''
    composerTopicTitle = ''
    composerGroupName = ''
    composerGroupParticipants = []
    composerChatContactId = contacts[0]?.id ?? ''
    composerMucRoomName = ''
    composerMucTopic = ''
    composerMucCommunityId = activeCommunityId ?? communities[0]?.id ?? ''
    composerSecure = true

    if (actionId === 'feed-post') {
      composerTargetId = 'feed'
      composerSecure = secure
    } else if (actionId === 'feed-community-post' || actionId === 'feed-topic-post') {
      composerTargetId = activeCommunityId ?? communities[0]?.id ?? ''
      composerSecure = secure || (communities.find((item) => item.id === composerTargetId)?.visibility === 'private')
    } else if (actionId === 'chat-direct') {
      composerSecure = true
    } else if (actionId === 'chat-group') {
      composerSecure = true
      composerGroupParticipants = contacts.slice(0, 2).map((item) => item.id)
    } else if (actionId === 'chat-muc') {
      composerSecure = true
      composerMucDefaultMode = 'secure'
      composerMucAutoJoin = true
      composerMucCommunityId = activeCommunityId ?? communities[0]?.id ?? ''
      composerMucTopic = activeChat().kind === 'muc' ? activeChat().topic ?? '' : ''
    }
  }

  const openComposerAction = (actionId = defaultComposerActionId()) => {
    resetComposerDraft(actionId)
    composerMenuOpen = false
    composerOpen = true
    feedDetailOpen = false
    chatDetailOpen = false
    section = actionId.startsWith('chat') ? 'chats' : 'feed'
  }

  const closePresenceSheet = () => {
    presenceSheetOpen = false
  }

  const closeCommunitySheet = () => {
    communitySheetId = null
  }

  const startFabPress = () => {
    if (section !== 'feed' && section !== 'chats') return

    fabLongPressTriggered = false
    if (fabPressTimer) clearTimeout(fabPressTimer)

    fabPressTimer = setTimeout(() => {
      fabPressTimer = null
      fabLongPressTriggered = true
      composerMenuOpen = true
      composerOpen = false
    }, 420)
  }

  const endFabPress = () => {
    if (fabPressTimer) {
      clearTimeout(fabPressTimer)
      fabPressTimer = null
    }
  }

  const activateFab = () => {
    if (fabLongPressTriggered) {
      fabLongPressTriggered = false
      return
    }

    openComposerAction(defaultComposerActionId())
  }

  const closeComposer = () => {
    composerOpen = false
  }

  const closeComposerMenu = () => {
    composerMenuOpen = false
  }

  const openFeedItem = (id) => {
    activeFeedId = id
    feedDetailOpen = true
    section = 'feed'
  }

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    let binary = ''

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }

    return btoa(binary)
  }

  const requestUploadSlot = async () => {
    if (!uploadFile || !uploadTargetPeerId) {
      return
    }

    uploadBusy = true
    clearRuntimeError()
    try {
      const slot = await postRuntimeResult('upload:request-slot', {
        target: uploadTargetPeerId,
        filename: uploadFile.name,
        size: uploadFile.size,
        contentType: uploadFile.type || 'application/octet-stream'
      })

      if (!slot?.putUrl || !slot?.getUrl) {
        throw new Error('Upload service did not return URLs')
      }

      const base64 = arrayBufferToBase64(await uploadFile.arrayBuffer())
      const result = await postRuntimeResult('upload:put', {
        putUrl: slot.putUrl,
        getUrl: slot.getUrl,
        base64,
        contentType: uploadFile.type || 'application/octet-stream'
      })

      uploadResultUrl = result?.getUrl ?? slot.getUrl
      uploadFile = null
    } catch (error) {
      openError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      uploadBusy = false
    }
  }

  const emitAttachment = async (kind, value) => {
    const item = selectedFeedItem()
    if (!item?.topic) return

    attachmentActionBusy = true
    try {
      await postRuntimeAction(kind === 'notice' ? 'attachment:notice' : 'attachment:react', {
        topic: item.topic,
        targetId: item.id,
        value,
        reaction: value
      })
    } finally {
      attachmentActionBusy = false
    }
  }

  const openReplyComposer = (item) => {
    if (item.sourceType === 'community') {
      composerActionId = 'feed-topic-post'
      composerTargetId = item.sourceId
      composerTopicTitle = `Re: ${item.title}`
    } else {
      composerActionId = 'feed-post'
      composerTargetId = 'feed'
      composerTopicTitle = `Re: ${item.title}`
    }

    composerBody = `Replying to ${item.sourceLabel}\n\n`
    composerSecure = secure
    composerMenuOpen = false
    composerOpen = true
    section = 'feed'
    feedDetailOpen = false
    chatDetailOpen = false
  }

  const handleGlobalKeydown = (event) => {
    if (event.key !== 'Escape') return

    if (composerOpen) {
      closeComposer()
      return
    }

    if (composerMenuOpen) {
      closeComposerMenu()
      return
    }

    if (presenceSheetOpen) {
      closePresenceSheet()
      return
    }

    if (communitySheetId) {
      closeCommunitySheet()
      return
    }

    if (advancedOpen) {
      advancedOpen = false
      return
    }

    if (feedDetailOpen) {
      closeFeedDetail()
      return
    }

    if (chatDetailOpen) {
      chatDetailOpen = false
    }
  }

  $: if (presenceSheetOpen && !presenceSheetWasOpen) {
    void focusModal(presenceDialogEl)
  }
  $: presenceSheetWasOpen = presenceSheetOpen

  $: if (composerMenuOpen && !composerMenuWasOpen) {
    void focusModal(composerMenuDialogEl)
  }
  $: composerMenuWasOpen = composerMenuOpen

  $: if (composerOpen && !composerWasOpen) {
    void focusModal(composerDialogEl)
  }
  $: composerWasOpen = composerOpen

  $: if (communitySheetId && !communitySheetWasOpen) {
    void focusModal(communityDialogEl)
  }
  $: communitySheetWasOpen = Boolean(communitySheetId)

  $: if (advancedOpen && !advancedWasOpen) {
    void focusModal(advancedDialogEl)
  }
  $: advancedWasOpen = advancedOpen

  const closeFeedDetail = () => {
    feedDetailOpen = false
  }

  const submitComposer = async (event) => {
    event.preventDefault()
    const body = composerBody.trim()
    const topicTitle = composerTopicTitle.trim()
    const groupName = composerGroupName.trim()
    const roomName = composerMucRoomName.trim() || 'lobby'
    const roomTopic = composerMucTopic.trim()
    const postTarget = composerTarget()
    const selectedContact = contacts.find((item) => item.id === composerChatContactId) ?? contacts[0]
    const selectedParticipants = composerGroupParticipants
      .map((participantId) => contacts.find((item) => item.id === participantId))
      .filter(Boolean)

    if (composerActionId === 'feed-post') {
      if (!body) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: 'feed',
        secure: false,
        title: topicTitle || undefined
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'feed-community-post') {
      if (!body) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: postTarget.id,
        secure: postTarget.visibility === 'private',
        title: `Posted to ${postTarget.name}`
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'feed-topic-post') {
      if (!body || !topicTitle) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: postTarget.id,
        secure: postTarget.visibility === 'private',
        title: topicTitle
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'chat-direct') {
      if (!selectedContact) return
      await postRuntimeAction('chat:direct', {
        peerId: selectedContact.id,
        body: body || 'Started a new chat.',
        secure: composerSecure
      })
      section = 'chats'
      chatDetailOpen = true
    } else if (composerActionId === 'chat-group') {
      const participants = selectedParticipants.length ? selectedParticipants.map((item) => item.name) : contacts.slice(0, 2).map((item) => item.name)
      await postRuntimeAction('chat:group', {
        name: groupName || participants.join(', ') || `group-${Date.now()}`,
        body: body || 'Started a group chat.',
        secure: composerSecure,
        participantIds: selectedParticipants.length ? selectedParticipants.map((item) => item.id) : contacts.slice(0, 2).map((item) => item.id)
      })
      section = 'chats'
      chatDetailOpen = true
    } else if (composerActionId === 'chat-muc') {
      if (!roomName) return
      await postRuntimeAction('chat:muc', {
        roomName: roomName.startsWith('#') ? roomName.slice(1) : roomName,
        body: body || 'Opened a new room.',
        secure: composerMucDefaultMode === 'secure',
        topic: roomTopic || undefined,
        communityId: composerMucCommunityId || undefined,
        autoJoin: composerMucAutoJoin,
        defaultMode: composerMucDefaultMode
      })
      section = 'chats'
      chatDetailOpen = true
    }

    composerBody = ''
    composerTopicTitle = ''
    composerGroupName = ''
    composerGroupParticipants = []
    composerChatContactId = contacts[0]?.id ?? ''
    composerMucRoomName = ''
    composerMucTopic = ''
    composerMucCommunityId = activeCommunityId ?? communities[0]?.id ?? ''
    composerMucDefaultMode = 'secure'
    composerMucAutoJoin = true
    composerOpen = false
  }
</script>

<svelte:head>
  <title>XMPP P2P Feed</title>
  <meta
    name="description"
    content="Mobile-first XMPP social app with a unified feed, simple bottom navigation, and plain-language profile and presence controls."
  />
</svelte:head>

<svelte:window on:keydown={handleGlobalKeydown} />

<div class="app-shell">
  <main class="main">
    <header class="topbar">
      <div class="topbar__identity">
        {#if (section === 'chats' && chatDetailOpen) || (section === 'feed' && feedDetailOpen)}
          <button
            class="topbar__back"
            type="button"
            aria-label={section === 'feed' ? 'Back to feed list' : 'Back to chats'}
            onclick={() => (section === 'feed' ? closeFeedDetail() : (chatDetailOpen = false))}
          >
            <span aria-hidden="true">&larr;</span>
            <span>{section === 'feed' ? 'Back to feed' : 'Back to chats'}</span>
          </button>
        {/if}
        <div class="avatar avatar--top">{initials(identity.nickname)}</div>
        <div class="topbar__copy">
          <p class="eyebrow">{section === 'feed' && feedDetailOpen ? 'Feed view' : sectionLabels[section]}</p>
          <strong>{identity.nickname}</strong>
        </div>
      </div>

      <button class="topbar__status" type="button" onclick={() => (presenceSheetOpen = true)}>
        <span class={`status-dot status-dot--${presence}`} aria-hidden="true"></span>
        <span class={badgeClass(presence)}>{presence}</span>
      </button>
    </header>

    {#if runtimeError}
      <div class="error-banner" role="status" aria-live="polite">
        <span>{runtimeError}</span>
        <button class="button button--ghost button--small" type="button" onclick={clearRuntimeError}>Dismiss</button>
      </div>
    {/if}

    {#if presenceSheetOpen}
      <div class="backdrop" aria-hidden="true" onclick={closePresenceSheet}></div>
      <div class="sheet" bind:this={presenceDialogEl} role="dialog" aria-label="Update presence" aria-modal="true" tabindex="-1">
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
          <button
            class="button button--ghost"
            type="button"
            onclick={async () => {
              await postRuntimeAction('presence:update', { presence, message: presenceMessage })
              presenceSheetOpen = false
            }}
          >
            Done
          </button>
        </div>
      </div>
    {/if}

    {#if advancedOpen}
      <div class="backdrop" aria-hidden="true" onclick={() => (advancedOpen = false)}></div>
      <div class="sheet" bind:this={advancedDialogEl} role="dialog" aria-label="Advanced protocol and peer state" aria-modal="true" tabindex="-1">
        <div class="surface__head">
          <div>
            <p class="eyebrow">Advanced</p>
            <h3>Protocol &amp; peer state</h3>
          </div>
          <button class="button button--ghost button--small" type="button" onclick={() => (advancedOpen = false)}>Close</button>
        </div>
        <div class="inspector__block">
          {#each protocol as item}
            <div class="kv"><span>{item.label}</span><span>{item.value}</span></div>
          {/each}
        </div>
        <div class="peer-list">
          {#each peers as peer}
            <div class="peer-row">
              <div class="row peer-row__identity">
                <div class="avatar-container">
                  <div class="avatar">{initials(peer.label)}</div>
                  <span class="avatar-status-dot status-{peer.status || 'offline'}"></span>
                </div>
                <div>
                  <strong>{peer.label}</strong>
                  <div class="meta">{peer.kind}</div>
                </div>
              </div>
              <span class="meta">{peer.status || 'offline'}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if section === 'feed' || section === 'chats'}
      <button
        class={`fab ${section === 'chats' ? 'fab--chat' : 'fab--feed'}`}
        type="button"
        aria-label={`Create a new ${section === 'feed' ? 'feed' : 'chat'} item`}
        title="Press and hold for more options"
        onpointerdown={startFabPress}
        onpointerup={endFabPress}
        onpointercancel={endFabPress}
        onpointerleave={endFabPress}
        onclick={activateFab}
      >
        +
      </button>
    {/if}

    {#if composerMenuOpen}
      <div class="backdrop" aria-hidden="true" onclick={closeComposerMenu}></div>
      <div class="sheet fab-menu" bind:this={composerMenuDialogEl} role="dialog" aria-label="Choose create action" aria-modal="true" tabindex="-1">
        <div class="surface__head">
          <div>
            <p class="eyebrow">{sectionLabels[section]}</p>
            <h3>Choose an action</h3>
          </div>
          <button class="button button--ghost button--small" type="button" onclick={closeComposerMenu}>Cancel</button>
        </div>

        <div class="fab-menu__grid">
          {#each composerMenuActions() as action}
            <button class="composer-option" type="button" onclick={() => openComposerAction(action.id)}>
              <strong>{action.label}</strong>
              <span class="meta">{action.description}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if composerOpen}
      <div class="backdrop" aria-hidden="true" onclick={closeComposer}></div>
      <div class="sheet composer composer--context" bind:this={composerDialogEl} role="dialog" aria-label={selectedComposerAction().label} aria-modal="true" tabindex="-1">
        <div class="composer-header">
          <button class="composer-header__cancel" type="button" onclick={closeComposer}>Cancel</button>
          <strong class="composer-header__title">{selectedComposerAction().label}</strong>
          <div class="composer-header__icons">
            {#if composerActionId === 'chat-direct' || composerActionId === 'chat-group'}
              <button
                class="icon-toggle"
                class:is-on={composerSecure}
                type="button"
                aria-pressed={composerSecure}
                aria-label={composerSecure ? 'Encryption on' : 'Encryption off'}
                onclick={() => (composerSecure = !composerSecure)}
              >
                🔒
              </button>
            {/if}
          </div>
        </div>

        {#if composerActionId === 'feed-post' || composerActionId === 'feed-community-post' || composerActionId === 'feed-topic-post'}
          <button class="composer-dest" type="button" onclick={() => (destinationPickerOpen = !destinationPickerOpen)}>
            <span class="composer-dest__label">Posting to</span>
            <span class="composer-dest__value">{composerTarget().tag} <span aria-hidden="true">⌄</span></span>
          </button>
          {#if destinationPickerOpen}
            <div class="composer__targets" aria-label="Post destination">
              {#each (composerActionId === 'feed-post' ? composerTargets() : communities) as target}
                <button
                  class="chip"
                  class:is-active={composerTargetId === target.id}
                  type="button"
                  onclick={() => { setComposerTarget(target.id); destinationPickerOpen = false }}
                >
                  {target.tag}
                </button>
              {/each}
            </div>
          {/if}
        {:else if composerActionId === 'chat-direct'}
          <button class="composer-dest" type="button" onclick={() => (destinationPickerOpen = !destinationPickerOpen)}>
            <span class="composer-dest__label">Sending to</span>
            <span class="composer-dest__value">{contacts.find((contact) => contact.id === composerChatContactId)?.name ?? 'Select a contact'} <span aria-hidden="true">⌄</span></span>
          </button>
          {#if destinationPickerOpen}
            <div class="composer__targets" aria-label="Chat contact">
              {#each contacts as contact}
                <button
                  class="chip"
                  class:is-active={composerChatContactId === contact.id}
                  type="button"
                  onclick={() => { setComposerChatContact(contact.id); destinationPickerOpen = false }}
                >
                  {contact.name}
                </button>
              {/each}
            </div>
          {/if}
        {:else if composerActionId === 'chat-group'}
          <label class="field field--grow">
            <span>Group name</span>
            <input bind:value={composerGroupName} type="text" placeholder="Project team" />
          </label>
          <div class="composer__targets composer__targets--wrap" aria-label="Group participants">
            {#each contacts as contact}
              <button
                class="chip"
                class:is-active={composerGroupParticipants.includes(contact.id)}
                type="button"
                onclick={() => toggleComposerGroupParticipant(contact.id)}
              >
                {contact.name}
              </button>
            {/each}
          </div>
        {:else if composerActionId === 'chat-muc'}
          <div class="composer__settings">
            <div class="section__title">
              <p class="eyebrow">Room settings</p>
              <h3>Configure the new MUC</h3>
              <p class="hint">The room topic and community choice are stored with the live thread snapshot when the room is created.</p>
            </div>

            <label class="field field--grow">
              <span>Room name</span>
              <input bind:value={composerMucRoomName} type="text" placeholder="lobby" required />
            </label>
            <div class="composer__targets" aria-label="Room community">
              {#each communities as community}
                <button
                  class="chip"
                  class:is-active={composerMucCommunityId === community.id}
                  type="button"
                  onclick={() => (composerMucCommunityId = community.id)}
                >
                  {community.tag}
                </button>
              {/each}
            </div>
            <label class="field field--grow">
              <span>Room topic</span>
              <input bind:value={composerMucTopic} type="text" placeholder="Protocol discussion" />
            </label>
            <div class="composer__settings-row">
              <label class="toggle">
                <input checked={composerMucDefaultMode === 'secure'} type="checkbox" onchange={(event) => (composerMucDefaultMode = event.currentTarget.checked ? 'secure' : 'open')} />
                <span>Secure by default</span>
              </label>
              <label class="toggle">
                <input bind:checked={composerMucAutoJoin} type="checkbox" />
                <span>Auto-join</span>
              </label>
            </div>
          </div>
        {/if}

        <form class="composer__form" onsubmit={submitComposer}>
          {#if composerActionId === 'feed-topic-post'}
            <label class="field field--grow">
              <span>Topic title</span>
              <input bind:value={composerTopicTitle} type="text" placeholder="Discussion title" />
            </label>
          {/if}

          <label class="field field--grow">
            <span>{composerActionId.startsWith('chat') ? 'Message' : 'Post text'}</span>
            <textarea
              bind:value={composerBody}
              rows="3"
              placeholder={composerActionId.startsWith('chat') ? 'Write the opening message' : 'Write a post'}
            ></textarea>
          </label>

          <div class="composer__actions">
            <p class="hint">
              {#if composerActionId === 'feed-post'}
                Posting to: {composerTarget().tag}
              {:else if composerActionId === 'feed-community-post' || composerActionId === 'feed-topic-post'}
                Posting to: {composerTarget().tag}
              {:else if composerActionId === 'chat-direct'}
                Starting chat with: {contacts.find((contact) => contact.id === composerChatContactId)?.name}
              {:else if composerActionId === 'chat-group'}
                Members: {composerGroupParticipants.length || 2}
              {:else}
                Room: {composerMucRoomName || 'New MUC'}
              {/if}
            </p>
            <div class="action-group">
                <button class="button button--ghost" type="button" onclick={closeComposer}>Cancel</button>
              <button class="button" type="submit">
                {composerActionId === 'chat-muc' ? 'Create room' : selectedComposerAction().label}
              </button>
            </div>
          </div>
        </form>
      </div>
    {/if}

    {#if section === 'feed'}
      <section class="section-stack">

        {#if feedDetailOpen}
          <article class="feed-detail">
            <div class="feed-detail__hero">
              <div class="feed-card__head">
                <div class="feed-author">
                  <div class="avatar avatar--feed feed-detail__avatar" class:avatar--square={selectedFeedItem().sourceType === 'community'}>
                    {selectedFeedItem().avatar}
                  </div>
                  <div>
                    <p class="eyebrow">Selected post</p>
                    <h3 class="feed-detail__title">{selectedFeedItem().title}</h3>
                    <div class="pill-row pill-row--tight">
                      {#if selectedFeedItem().sourceType === 'community'}
                        <button class="pill pill--community" type="button" onclick={() => (communitySheetId = selectedFeedItem().sourceId)}>
                          {selectedFeedItem().sourceLabel}
                        </button>
                      {:else}
                        <span class="pill pill--person">{selectedFeedItem().sourceLabel}</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="feed-detail__meta">
                  <span class="meta mono">{selectedFeedItem().time}</span>
                  <span class={selectedFeedItem().secure ? 'badge badge--secure' : 'badge badge--warn'}>
                    {selectedFeedItem().secure ? 'Encrypted' : 'Open'}
                  </span>
                </div>
              </div>

              <p class="feed-detail__body">{selectedFeedItem().body}</p>
            </div>

            <div class="feed-detail__panel">
              <div class="feed-card__actions feed-detail__actions">
                <div class="action-group">
                  {#each selectedFeedItem().reactions as reaction}
                    <span class="meta">{reaction}</span>
                  {/each}
                </div>
                <div class="action-group">
                  <button
                    class="button button--ghost button--small"
                    type="button"
                    disabled={attachmentActionBusy || !selectedFeedItem().topic}
                    onclick={() => emitAttachment('notice', 'Seen')}
                  >
                    Notice
                  </button>
                  <button
                    class="button button--ghost button--small"
                    type="button"
                    disabled={attachmentActionBusy || !selectedFeedItem().topic}
                    onclick={() => emitAttachment('react', '❤️')}
                  >
                    React
                  </button>
                  <button class="button button--small" type="button" onclick={() => openReplyComposer(selectedFeedItem())}>Reply</button>
                </div>
              </div>
            </div>
          </article>
        {:else}
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

        <section class="feed-list">
          {#each filteredFeedItems() as item}
              <article class="feed-card" class:feed-card--community={item.sourceType === 'community'} class:is-active={item.id === activeFeedId}>
                <button class="feed-card__open" type="button" aria-label={`Open ${item.title}`} onclick={() => openFeedItem(item.id)}>
                <div class="feed-card__head">
                  <div class="feed-author">
                    <div class="avatar avatar--feed" class:avatar--square={item.sourceType === 'community'}>{item.avatar}</div>
                    <div>
                      <strong>{item.title}</strong>
                      <div class="pill-row pill-row--tight">
                        <span class={item.sourceType === 'community' ? 'pill pill--community' : 'pill pill--person'}>
                          {item.sourceLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span class="meta mono">{item.time}</span>
                </div>

                <p class="feed-card__body">{item.body}</p>
                </button>

                <div class="feed-card__footer">
                  <div class="action-group">
                    {#each item.reactions as reaction}
                      <span class="meta">{reaction}</span>
                    {/each}
                    {#if item.secure}
                      <span class="meta" aria-label="Encrypted">🔒</span>
                    {/if}
                  </div>
                  <div class="action-group">
                    {#if item.sourceType === 'community'}
                    <button class="pill pill--community" type="button" onclick={() => (communitySheetId = item.sourceId)}>
                        {item.sourceLabel}
                      </button>
                    {/if}
                    <button class="button button--ghost button--small" type="button" onclick={() => openReplyComposer(item)}>Reply</button>
                  </div>
                </div>
              </article>
            {/each}
          </section>
        {/if}

        {#if communitySheetId}
          <div class="backdrop" aria-hidden="true" onclick={closeCommunitySheet}></div>
          <div class="sheet" bind:this={communityDialogEl} role="dialog" aria-label="Community details" aria-modal="true" tabindex="-1">
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
              <button class="button button--ghost" type="button" onclick={closeCommunitySheet}>Close</button>
            </div>
          </div>
        {/if}
      </section>
    {:else if section === 'chats'}
      <section class="section-stack">
        {#if !chatDetailOpen}
          <div class="list">
            {#each sortedChats(chats) as chat}
              <button
                class="row-flat"
                class:is-active={chat.id === activeChatId}
                type="button"
                onclick={() => {
                  activeChatId = chat.id
                  chatDetailOpen = true
                  syncMucDraftFromChat(chat)
                  if (chat.kind === 'muc') {
                    void postRuntimeAction('chat:muc:mam', { roomName: chat.roomName || chat.id })
                  }
                }}
              >
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
        {:else}
          <article class="thread-shell">
            {#if activeChat().kind === 'muc'}
              <header class="thread-header">
                <div class="thread-header__title">
                  <p class="eyebrow">Room</p>
                  <h3 class="thread-shell__title">{activeChat().name} · {activeChat().occupants.length} members</h3>
                  <p class="thread-topic">{activeChat().topic}</p>
                </div>
                <button
                  class="thread-header__manage"
                  type="button"
                  aria-label={activeChat().localAffiliation === 'owner' ? 'Room settings' : 'Room info'}
                  onclick={() => (mucSettingsOpen = !mucSettingsOpen)}
                >
                  {activeChat().localAffiliation === 'owner' ? '⚙' : 'ℹ'}
                </button>
              </header>

              <div class="roster-strip" aria-label="Room occupants">
                {#each activeChat().occupants.slice(0, 6) as occupant}
                  <div class="roster-strip__item">
                    <div class="avatar">{initials(occupant.nick)}</div>
                    <span class="meta roster-strip__label">{occupant.nick}</span>
                  </div>
                {/each}
                {#if activeChat().occupants.length > 6}
                  <div class="roster-strip__item roster-strip__item--overflow">
                    <div class="avatar">+{activeChat().occupants.length - 6}</div>
                    <span class="meta roster-strip__label">more</span>
                  </div>
                {/if}
              </div>

              {#if mucSettingsOpen && activeChat().localAffiliation === 'owner'}
                <div class="composer__settings thread-settings">
                  <div class="section__title">
                    <p class="eyebrow">Room controls</p>
                    <h3>Room topic and defaults</h3>
                  </div>
                  <label class="field field--grow">
                    <span>Room topic</span>
                    <input bind:value={mucTopicDraft} type="text" placeholder="Room topic" />
                  </label>
                  <div class="composer__settings-row">
                    <label class="toggle">
                      <input checked={mucDefaultModeDraft === 'secure'} type="checkbox" onchange={(event) => (mucDefaultModeDraft = event.currentTarget.checked ? 'secure' : 'open')} />
                      <span>Secure by default</span>
                    </label>
                    <label class="toggle">
                      <input bind:checked={mucAutoJoinDraft} type="checkbox" />
                      <span>Auto-join</span>
                    </label>
                  </div>
                  <div class="composer__actions">
                    <div class="meta">Saved settings control future room defaults and auto-join on restart.</div>
                    <button class="button button--small" type="button" onclick={saveMucRoomSettings}>Save room settings</button>
                  </div>
                </div>
              {:else if mucSettingsOpen}
                <div class="composer__settings thread-settings">
                  <div class="section__title">
                    <p class="eyebrow">Room info</p>
                    <h3>Room topic and defaults</h3>
                  </div>
                  <div class="kv"><span>Topic</span><span>{activeChat().topic}</span></div>
                  <div class="kv"><span>Occupants</span><span>{activeChat().occupants.length}</span></div>
                  <div class="kv"><span>Secure by default</span><span>{activeChat().defaultSecure === false ? 'Off' : 'On'}</span></div>
                  <div class="kv"><span>Auto-join</span><span>{activeChat().autoJoin === false ? 'Off' : 'On'}</span></div>
                </div>
              {/if}
            {:else}
              <div class="row row--space">
                <div>
                  <p class="eyebrow">Selected thread</p>
                  <h3 class="thread-shell__title">{activeChat().name}</h3>
                </div>
                <span class={activeChat().secure ? 'badge badge--secure' : 'badge badge--warn'}>
                  {activeChat().secure ? 'E2EE' : 'open'}
                </span>
              </div>
            {/if}

            <div class="thread">
              {#each activeChat().messages as message}
                <div class:bubble--self={message.self} class="bubble">
                  <div class="row row--space">
                    <strong>{message.from}</strong>
                    <span class="meta mono">{message.time}</span>
                  </div>
                  <p>{message.text} {#if message.corrected}<span class="meta message-corrected">(edited)</span>{/if}</p>
                  {#if message.markers && Object.keys(message.markers).length > 0}
                    <div class="row message-markers">
                      <span>✓ Seen by: {Object.keys(message.markers).join(', ')}</span>
                    </div>
                  {/if}
                </div>
              {/each}
              {#if activeChat().typingNicks && activeChat().typingNicks.length > 0}
                <div class="bubble typing-bubble">
                  <span class="meta message-corrected">{activeChat().typingNicks.join(', ')} {activeChat().typingNicks.length === 1 ? 'is' : 'are'} typing...</span>
                </div>
              {/if}
            </div>
          </article>
        {/if}
      </section>
    {:else if section === 'contacts'}
      <div class="contacts-layout">
        <!-- Left Column: Friends & Contacts List -->
        <section class="section-stack">
          <article class="profile-card">
            <div class="section__title row row--space roster-head">
              <div>
                <p class="eyebrow">Roster</p>
                <h3>Contacts</h3>
              </div>
              <button class="button button--small" type="button" onclick={() => showAddContact = !showAddContact}>
                {showAddContact ? 'Close' : 'Add Contact'}
              </button>
            </div>

            {#if showAddContact}
              <form class="roster-form" onsubmit={addRosterContact}>
                <label class="field field--grow">
                  <span>JID</span>
                  <input bind:value={rosterJid} type="text" placeholder="maya@chat.mesh" />
                </label>
                <label class="field field--grow">
                  <span>Name</span>
                  <input bind:value={rosterName} type="text" placeholder="Maya" />
                </label>
                <button class="button" type="submit" disabled={rosterActionBusy || !rosterJid.trim()}>
                  Add contact
                </button>
              </form>
            {/if}

            <!-- Search and Filter Bar -->
            <div class="contacts-toolbar">
              <input bind:value={contactsSearch} type="text" class="contacts-search" placeholder="Search JID or name..." />
              <div class="filter-pills">
                <button class="pill-btn" class:is-active={contactsFilter === 'all'} type="button" onclick={() => (contactsFilter = 'all')}>All</button>
                <button class="pill-btn" class:is-active={contactsFilter === 'online'} type="button" onclick={() => (contactsFilter = 'online')}>Online</button>
              </div>
            </div>

            <div class="list roster-list">
              {#if filteredContacts().length === 0}
                <div class="row-flat">
                  <div>
                    <strong>No contacts found</strong>
                    <div class="meta">Try adjusting your filter or adding a contact.</div>
                  </div>
                </div>
              {:else}
                {#each filteredContacts() as contact}
                  <div class="row-flat contact-item-row">
                    <div class="row row--space">
                      <div class="row contact-item-row__identity">
                        <div class="avatar-container">
                          <div class="avatar">{initials(contact.name)}</div>
                          <span class="avatar-status-dot status-{contact.presence || 'offline'}"></span>
                        </div>
                        <div>
                          <strong>{contact.name}</strong>
                          <div class="meta">{contact.jid}</div>
                        </div>
                      </div>
                      <span class="meta contact-trust">{contact.trust}</span>
                    </div>

                    <div class="row row--space contact-item-row__footer">
                      <div class="row contact-item-row__meta">
                        <span class="meta contact-pill">{contact.subscription}</span>
                        <span class="meta contact-pill">{contact.capability}</span>
                      </div>
                      <div class="action-group contact-item-row__actions">
                        <button class="button button--ghost button--small" type="button" onclick={() => toggleRosterPresence(contact)}>
                          {contact.subscription === 'none' || contact.subscription === 'from' ? 'Subscribe' : 'Unsubscribe'}
                        </button>
                        <button class="button button--ghost button--small button--destructive" type="button" onclick={() => removeRosterContact(contact)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </article>
        </section>

        <!-- Right Column: Local Profile, Network Map & State -->
        <section class="section-stack">
          <!-- My Profile -->
          <article class="profile-card">
            <div class="profile-head">
              <div class="feed-author profile-head__identity">
                <div class="avatar-container">
                  <div class="avatar avatar--feed">{initials(identity.nickname)}</div>
                  <span class="avatar-status-dot status-{presence || 'offline'}"></span>
                </div>
                <div>
                  <strong>{identity.nickname} (You)</strong>
                  <div class="meta">{identity.jid}</div>
                </div>
              </div>
            </div>

            <div class="profile-grid profile-grid--spaced">
              <div class="kv"><span>Status message</span><span>{presenceMessage || 'Online'}</span></div>
              <div class="kv"><span>Peer ID</span><span>{identity.peerId.slice(0, 18)}…</span></div>
              <div class="kv"><span>Transport</span><span>{identity.transport}</span></div>
              <div class="kv"><span>Connection</span><span>{identity.connection}</span></div>
            </div>
          </article>

          <!-- Connection summary -->
          <article class="profile-card">
            <div class="section__title">
              <p class="eyebrow">Connection</p>
              <h3>Network summary</h3>
            </div>
            <div class="profile-grid profile-grid--spaced">
              <div class="kv"><span>Transport</span><span>{identity.transport}</span></div>
              <div class="kv"><span>Peers</span><span>{nonLocalPeers().length}</span></div>
              <div class="kv"><span>Rooms</span><span>{chats.filter((chat) => chat.kind === 'muc').length}</span></div>
            </div>
            <button class="advanced-link" type="button" onclick={() => (advancedOpen = true)}>
              <span>Advanced — protocol &amp; peer state</span>
              <span aria-hidden="true">&rsaquo;</span>
            </button>
          </article>

          <article class="profile-card">
            <div class="section__title">
              <p class="eyebrow">Security</p>
              <h3>Crypto state</h3>
            </div>
            <div class="inspector__block">
              <div class="kv"><span>OMEMO device</span><span>{security.omemoDeviceId}</span></div>
              <div class="kv"><span>OMEMO bundle</span><span>{security.omemoPreKeys} pre-keys</span></div>
              <div class="kv"><span>OpenPGP fingerprint</span><span class="mono">{security.openPgpFingerprint}</span></div>
              <div class="kv"><span>OpenPGP key</span><span>{security.openPgpKeyAvailable ? 'Loaded' : 'Missing'}</span></div>
            </div>
          </article>

          <article class="profile-card">
            <div class="section__title">
              <p class="eyebrow">Uploads</p>
              <h3>Send a file</h3>
            </div>
            <p class="meta">Requests an upload slot from a contact, uploads the file, and returns the content-addressed URL.</p>
            <div class="roster-form">
              <label class="field field--grow">
                <span>Target contact</span>
                <select bind:value={uploadTargetPeerId}>
                  {#each contacts as contact}
                    <option value={contact.id}>{contact.name}</option>
                  {/each}
                </select>
              </label>
              <label class="field field--grow">
                <span>File</span>
                <input type="file" onchange={(event) => (uploadFile = event.currentTarget.files?.[0] ?? null)} />
              </label>
              <button class="button" type="button" disabled={uploadBusy || !uploadFile || !uploadTargetPeerId} onclick={requestUploadSlot}>
                {uploadBusy ? 'Uploading...' : 'Upload file'}
              </button>
              {#if uploadResultUrl}
                <div class="upload-result">
                  <span class="meta">Uploaded URL</span>
                  <a href={uploadResultUrl} target="_blank" rel="noreferrer">{uploadResultUrl}</a>
                </div>
              {/if}
            </div>
          </article>

          <article class="profile-card">
            <div class="section__title">
              <p class="eyebrow">Attachments</p>
              <h3>Recent activity</h3>
            </div>
            {#if attachmentSummaries.length === 0}
              <p class="meta">No attachment activity yet.</p>
            {:else}
              <div class="inspector__block">
                {#each attachmentSummaries as summary}
                  <div class="attachment-summary">
                    <div class="row row--space">
                      <strong>{summary.topic}</strong>
                      <span class="meta mono">{summary.updatedAt}</span>
                    </div>
                    <div class="meta">Target: {summary.targetId}</div>
                    <div class="meta">Total: {summary.total} · Notices: {summary.noticed} · Reactions: {summary.reactions}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        </section>
      </div>
    {/if}
  </main>

  <nav class="bottom-nav" aria-label="Primary navigation">
    <button class="nav__item" class:is-active={section === 'feed'} onclick={() => setSection('feed')}>Feed</button>
    <button class="nav__item" class:is-active={section === 'chats'} onclick={() => setSection('chats')}>Chats</button>
    <button class="nav__item" class:is-active={section === 'contacts'} onclick={() => setSection('contacts')}>Contacts</button>
  </nav>
</div>
