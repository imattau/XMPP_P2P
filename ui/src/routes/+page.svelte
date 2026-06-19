<script>
  import { badgeClass, chatAvatarGlyph, filterLabels, initials, sortedChats } from '$lib/social-data.js'
  import { tick } from 'svelte'
  import Topbar from '$lib/components/Topbar.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import ContactsView from '$lib/components/ContactsView.svelte'
  import FeedView from '$lib/components/FeedView.svelte'
  import ChatsView from '$lib/components/ChatsView.svelte'
  import Composer from '$lib/components/Composer.svelte'

  const clone = (value) => structuredClone(value)
  let { data } = $props()

  const snapshot = clone(data.snapshot)

  let section = $state(snapshot.section)
  let feedFilter = $state(snapshot.feedFilter)
  let secure = $state(snapshot.secure)
  let presence = $state(snapshot.presence)
  let presenceMessage = $state(snapshot.presenceMessage)
  let presenceSheetOpen = $state(false)
  let profileEditorOpen = $state(false)
  let activeChatId = $state(snapshot.activeChatId)
  let chatDetailOpen = $state(false)
  let activeCommunityId = $state(snapshot.communities[0]?.id ?? '')
  let activeFeedId = $state(snapshot.activeFeedId)
  let feedDetailOpen = $state(false)
  let composerTargetId = $state(snapshot.composerTargetId)
  let composerActionId = $state('feed-post')
  let composerBody = $state('')
  let composerCoverImageUrl = $state('')
  let composerTags = $state([])
  let composerTagDraft = $state('')
  let coverSectionOpen = $state(false)
  let titleSectionOpen = $state(false)
  let composerTopicTitle = $state('')
  let composerGroupName = $state('')
  let composerGroupParticipants = $state([])
  let composerChatContactId = $state(snapshot.contacts[0]?.id ?? '')
  let composerMucRoomName = $state('')
  let composerMucTopic = $state('')
  let composerMucCommunityId = $state(activeCommunityId)
  let composerMucDefaultMode = $state('secure')
  let composerMucAutoJoin = $state(true)
  let composerSecure = $state(snapshot.secure)
  let composerOpen = $state(false)
  let composerMenuOpen = $state(false)
  let destinationPickerOpen = $state(false)
  let fabPressTimer = $state(null)
  let fabLongPressTriggered = $state(false)
  let mucTopicDraft = $state('')
  let mucCommunityIdDraft = $state('')
  let mucDefaultModeDraft = $state('secure')
  let mucAutoJoinDraft = $state(true)
  let mucSettingsOpen = $state(false)
  let communitySheetId = $state(null)
  let rosterActionBusy = $state(false)
  let runtimeError = $state('')
  let presenceDialogEl = $state()
  let profileDialogEl = $state()
  let composerMenuDialogEl = $state()
  let composerDialogEl = $state()
  let communityDialogEl = $state()
  let presenceSheetWasOpen = $state(false)
  let profileEditorWasOpen = $state(false)
  let composerMenuWasOpen = $state(false)
  let composerWasOpen = $state(false)
  let communitySheetWasOpen = $state(false)
  let advancedOpen = $state(false)
  let advancedDialogEl = $state()
  let advancedWasOpen = $state(false)

  const communitySheetTarget = () => communities.find((item) => item.id === communitySheetId)
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

  const addRosterContact = async (jid, name) => {
    if (!jid) return

    await postRuntimeAction('roster:add', {
      jid,
      name
    })
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

  let identity = $state(clone(snapshot.identity))
  let profileFnDraft = $state(identity.displayName ?? identity.nickname ?? '')
  let profileNicknameDraft = $state(identity.nickname ?? identity.displayName ?? '')
  let profileAvatarTypeDraft = $state(identity.avatarType ?? '')
  let profileAvatarBinvalDraft = $state(identity.avatarBinval ?? '')
  let profileAvatarPreview = $state(identity.avatarDataUrl ?? '')
  let peers = $state(clone(snapshot.peers))
  let contacts = $state(clone(snapshot.contacts))
  let communities = $state(clone(snapshot.communities))
  let chats = $state(clone(snapshot.chats))
  let feedItems = $state(clone(snapshot.feedItems))
  let protocol = $state(clone(snapshot.protocol))
  let security = $state(clone(snapshot.security))
  let attachmentSummaries = $state(clone(snapshot.attachmentSummaries ?? []))
  let uploadTargetPeerId = $state(snapshot.contacts[0]?.id ?? '')
  let uploadResultUrl = $state('')
  let uploadBusy = $state(false)
  let composerCoverUploadBusy = $state(false)
  let composerCoverDropActive = $state(false)
  let attachmentActionBusy = $state(false)

  const applySnapshot = (next) => {
    identity = clone(next.identity)
    if (!profileEditorOpen) {
      syncProfileDraftFromIdentity()
    }
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

  const syncProfileDraftFromIdentity = () => {
    profileFnDraft = identity.displayName ?? identity.nickname ?? ''
    profileNicknameDraft = identity.nickname ?? identity.displayName ?? ''
    profileAvatarTypeDraft = identity.avatarType ?? ''
    profileAvatarBinvalDraft = identity.avatarBinval ?? ''
    profileAvatarPreview = identity.avatarDataUrl ?? ''
  }

  const profileDisplayName = () => identity.displayName ?? identity.nickname
  const profileNickname = () => identity.nickname ?? identity.displayName

  const composerActions = {
    feed: [
      {
        id: 'feed-post',
        label: 'New Post',
        description: 'Post to your feed'
      },
      {
        id: 'feed-article',
        label: 'New Article',
        description: 'Write a longer post with a cover image'
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
    sourceLabel: profileDisplayName(),
    avatar: initials(profileDisplayName()),
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

  const setSection = (next) => {
    section = next
    composerOpen = false
    composerMenuOpen = false
    endFabPress()
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

  const addComposerTag = () => {
    const value = composerTagDraft.trim().replace(/^#/, '')
    if (!value || composerTags.includes(value)) {
      composerTagDraft = ''
      return
    }
    composerTags = [...composerTags, value]
    composerTagDraft = ''
  }

  const removeComposerTag = (tag) => {
    composerTags = composerTags.filter((item) => item !== tag)
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
    composerCoverImageUrl = ''
    composerTags = []
    composerTagDraft = ''
    coverSectionOpen = actionId === 'feed-article'
    titleSectionOpen = actionId === 'feed-article'

    if (actionId === 'feed-post' || actionId === 'feed-article') {
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
    composerCoverDropActive = false
  }

  const closeComposerMenu = () => {
    composerMenuOpen = false
  }

  const openFeedItem = (id) => {
    activeFeedId = id
    feedDetailOpen = true
    section = 'feed'
  }

  const openProfileEditor = () => {
    syncProfileDraftFromIdentity()
    profileEditorOpen = true
  }

  const closeProfileEditor = () => {
    profileEditorOpen = false
  }

  const handleProfileAvatarPicker = async (event) => {
    const file = event.currentTarget.files?.[0] ?? null
    if (!file) return

    if (!(file.type ?? '').startsWith('image/')) {
      openError('Choose an image file for the profile photo.')
      return
    }

    clearRuntimeError()
    profileAvatarTypeDraft = file.type
    profileAvatarBinvalDraft = arrayBufferToBase64(await file.arrayBuffer())
    profileAvatarPreview = `data:${profileAvatarTypeDraft};base64,${profileAvatarBinvalDraft}`
  }

  const clearProfileAvatar = () => {
    profileAvatarTypeDraft = ''
    profileAvatarBinvalDraft = ''
    profileAvatarPreview = ''
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

  const uploadFileViaXep = async (file, targetPeerId) => {
    if (!file || !targetPeerId) {
      throw new Error('Select an upload target first')
    }

    const slot = await postRuntimeResult('upload:request-slot', {
      target: targetPeerId,
      filename: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream'
    })

    if (!slot?.putUrl || !slot?.getUrl) {
      throw new Error('Upload service did not return URLs')
    }

    const base64 = arrayBufferToBase64(await file.arrayBuffer())
    const result = await postRuntimeResult('upload:put', {
      putUrl: slot.putUrl,
      getUrl: slot.getUrl,
      base64,
      contentType: file.type || 'application/octet-stream'
    })

    return result?.getUrl ?? slot.getUrl
  }

  const requestUploadSlot = async (file, targetPeerId) => {
    if (!file || !targetPeerId) {
      return
    }

    uploadBusy = true
    clearRuntimeError()
    try {
      uploadResultUrl = await uploadFileViaXep(file, targetPeerId)
    } catch (error) {
      openError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      uploadBusy = false
    }
  }

  const uploadComposerCoverImage = async (file) => {
    if (!file) {
      return
    }

    if (!(file.type ?? '').startsWith('image/')) {
      openError('Choose an image file for the cover.')
      return
    }

    const targetPeerId = uploadTargetPeerId || contacts[0]?.id
    if (!targetPeerId) {
      openError('Select a contact to receive the upload slot.')
      return
    }

    composerCoverUploadBusy = true
    composerCoverDropActive = false
    clearRuntimeError()
    try {
      composerCoverImageUrl = await uploadFileViaXep(file, targetPeerId)
    } catch (error) {
      openError(error instanceof Error ? error.message : 'Cover image upload failed')
    } finally {
      composerCoverUploadBusy = false
    }
  }

  const handleComposerCoverDrop = async (event) => {
    event.preventDefault()
    composerCoverDropActive = false
    await uploadComposerCoverImage(event.dataTransfer?.files?.[0] ?? null)
  }

  const handleComposerCoverPicker = async (event) => {
    await uploadComposerCoverImage(event.currentTarget.files?.[0] ?? null)
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

    if (profileEditorOpen) {
      closeProfileEditor()
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

  $effect(() => {
    if (presenceSheetOpen && !presenceSheetWasOpen) {
      void focusModal(presenceDialogEl)
    }
    presenceSheetWasOpen = presenceSheetOpen
  })

  $effect(() => {
    if (profileEditorOpen && !profileEditorWasOpen) {
      void focusModal(profileDialogEl)
    }
    profileEditorWasOpen = profileEditorOpen
  })

  $effect(() => {
    if (composerMenuOpen && !composerMenuWasOpen) {
      void focusModal(composerMenuDialogEl)
    }
    composerMenuWasOpen = composerMenuOpen
  })

  $effect(() => {
    if (composerOpen && !composerWasOpen) {
      void focusModal(composerDialogEl)
    }
    composerWasOpen = composerOpen
  })

  $effect(() => {
    if (communitySheetId && !communitySheetWasOpen) {
      void focusModal(communityDialogEl)
    }
    communitySheetWasOpen = Boolean(communitySheetId)
  })

  $effect(() => {
    if (advancedOpen && !advancedWasOpen) {
      void focusModal(advancedDialogEl)
    }
    advancedWasOpen = advancedOpen
  })

  const closeFeedDetail = () => {
    feedDetailOpen = false
  }

  const submitComposer = async (event) => {
    event.preventDefault()
    const articleSuffix = composerActionId === 'feed-article'
      ? [
          composerCoverImageUrl.trim() ? `\n\n![cover](${composerCoverImageUrl.trim()})` : '',
          composerTags.length ? `\n\n${composerTags.map((tag) => `#${tag}`).join(' ')}` : ''
        ].join('')
      : ''
    const body = `${composerBody.trim()}${articleSuffix}`.trim()
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
        title: topicTitle || undefined,
        categories: composerTags
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'feed-community-post') {
      if (!body) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: postTarget.id,
        secure: postTarget.visibility === 'private',
        title: `Posted to ${postTarget.name}`,
        categories: composerTags
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'feed-topic-post') {
      if (!body || !topicTitle) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: postTarget.id,
        secure: postTarget.visibility === 'private',
        title: topicTitle,
        categories: composerTags
      })
      section = 'feed'
      feedDetailOpen = true
    } else if (composerActionId === 'feed-article') {
      if (!body) return
      await postRuntimeAction('feed:publish', {
        body,
        targetId: postTarget.id,
        secure: postTarget.visibility === 'private',
        title: topicTitle || undefined,
        categories: composerTags
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
        body,
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
    composerCoverImageUrl = ''
    composerTags = []
    composerTagDraft = ''
    coverSectionOpen = false
    titleSectionOpen = false
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

<div class="h-dvh min-h-dvh flex items-start justify-center overflow-hidden min-[900px]:flex-row min-[900px]:justify-start min-[900px]:items-stretch min-[900px]:w-full min-[900px]:p-4 min-[900px]:gap-4 min-[900px]:max-w-[100vw] min-[900px]:[background:radial-gradient(circle_at_12%_18%,rgba(91,75,207,0.1),transparent_35%),radial-gradient(circle_at_88%_82%,rgba(95,212,154,0.05),transparent_32%),#0c0d11]">
  <main class="w-[min(100%,72rem)] min-w-0 h-full min-h-0 grid content-start gap-4 p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] overflow-y-auto [overscroll-behavior:contain] [scrollbar-gutter:stable] transition-[padding] duration-300 min-[900px]:p-0 min-[900px]:pb-0 min-[900px]:h-[calc(100vh-2*var(--space-4))] min-[900px]:flex-1 min-[900px]:w-auto min-[900px]:max-w-[72rem]">
    <Topbar
      {section}
      {sectionLabels}
      {feedDetailOpen}
      {chatDetailOpen}
      {presence}
      {identity}
      profileDisplayName={profileDisplayName()}
      onBack={() => (section === 'feed' ? closeFeedDetail() : (chatDetailOpen = false))}
      onTogglePresence={() => (presenceSheetOpen = true)}
    />

    {#if runtimeError}
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border border-warning/[0.22] rounded-lg bg-warning/[0.08] text-warning" role="status" aria-live="polite">
        <span>{runtimeError}</span>
        <button class="inline-flex items-center justify-center min-h-[2.4rem] px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={clearRuntimeError}>Dismiss</button>
      </div>
    {/if}

    {#if presenceSheetOpen}
      <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={closePresenceSheet}></div>
      <div class="fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-4 max-h-[80vh] overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none" bind:this={presenceDialogEl} role="dialog" aria-label="Update presence" aria-modal="true" tabindex="-1">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Availability</p>
            <h3 class="m-0 font-display text-[1.05rem] leading-[1.08]">Update your status</h3>
          </div>
        </div>
        <div class="grid gap-3">
          <label class="grid gap-2 text-text-muted text-[0.9rem]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Status</span>
            <select bind:value={presence} class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text">
              <option value="available">Available</option>
              <option value="away">Away</option>
              <option value="busy">Busy</option>
              <option value="dnd">Do not disturb</option>
            </select>
          </label>
          <label class="grid gap-2 text-text-muted text-[0.9rem]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Message</span>
            <input bind:value={presenceMessage} type="text" placeholder="Online and reachable" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" />
          </label>
          <button
            class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer"
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

    {#if profileEditorOpen}
      <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={closeProfileEditor}></div>
      <div class="fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-4 max-h-[80vh] overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none" bind:this={profileDialogEl} role="dialog" aria-label="Edit profile" aria-modal="true" tabindex="-1">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Profile</p>
            <h3 class="m-0 font-display text-[1.05rem] leading-[1.08]">Edit your identity</h3>
          </div>
        </div>
        <form
          class="grid gap-3"
          onsubmit={async (event) => {
            event.preventDefault()
            const next = await postRuntimeAction('profile:update', {
              fn: profileFnDraft.trim() || undefined,
              nickname: profileNicknameDraft.trim() || undefined,
              photo: profileAvatarTypeDraft && profileAvatarBinvalDraft
                ? {
                    type: profileAvatarTypeDraft,
                    binval: profileAvatarBinvalDraft
                  }
                : undefined
            })
            if (next) {
              profileEditorOpen = false
            }
          }}
        >
          <div class="grid gap-3">
            {#if profileAvatarPreview}
              <img class="w-[2.1rem] h-[2.1rem] rounded-full object-cover border border-border [background:linear-gradient(145deg,rgba(91,75,207,0.24),rgba(91,75,207,0.08))]" src={profileAvatarPreview} alt="" />
            {:else}
              <div class="w-[2.1rem] h-[2.1rem] rounded-full grid place-items-center border border-border font-bold flex-none [background:linear-gradient(145deg,rgba(91,75,207,0.24),rgba(91,75,207,0.08))]">{initials(profileDisplayName())}</div>
            {/if}
            <div class="grid gap-3">
              <label class="grid gap-2 text-text-muted text-[0.9rem]">
                <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Profile photo</span>
                <input accept="image/*" type="file" onchange={handleProfileAvatarPicker} class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" />
              </label>
              <div class="flex flex-wrap gap-2 items-center justify-start">
                {#if profileAvatarPreview}
                  <button class="inline-flex items-center justify-center min-h-[2.4rem] px-[0.9rem] text-[0.88rem] rounded-full border border-warning/40 text-[#ffd9ae] hover:bg-warning/[0.08] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={clearProfileAvatar}>Clear photo</button>
                {/if}
              </div>
            </div>
          </div>
          <label class="grid gap-2 text-text-muted text-[0.9rem]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Display name</span>
            <input bind:value={profileFnDraft} type="text" placeholder="Atlas" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" />
          </label>
          <label class="grid gap-2 text-text-muted text-[0.9rem]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Nickname</span>
            <input bind:value={profileNicknameDraft} type="text" placeholder="atlas" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" />
          </label>
          <p class="text-text-muted leading-[1.5] m-0">The display name updates your vCard FN. The nickname is broadcast in presence and chat headers. The photo is saved as the vCard PHOTO payload.</p>
          <div class="flex flex-wrap gap-2 items-center">
            <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={closeProfileEditor}>Cancel</button>
            <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="submit">Save profile</button>
          </div>
        </form>
      </div>
    {/if}

    {#if advancedOpen}
      <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={() => (advancedOpen = false)}></div>
      <div class="fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-4 max-h-[80vh] overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none" bind:this={advancedDialogEl} role="dialog" aria-label="Advanced protocol and peer state" aria-modal="true" tabindex="-1">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Advanced</p>
            <h3 class="m-0 font-display text-[1.05rem] leading-[1.08]">Protocol &amp; peer state</h3>
          </div>
          <button class="inline-flex items-center justify-center min-h-[2.4rem] px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => (advancedOpen = false)}>Close</button>
        </div>
        <div class="grid gap-3">
          {#each protocol as item}
            <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
              <span class="text-text-soft">{item.label}</span>
              <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{item.value}</span>
            </div>
          {/each}
        </div>
        <div class="grid gap-2">
          {#each peers as peer}
            <div class="flex items-center justify-between gap-3 py-3 border-b border-white/[0.06] min-w-0 last:border-b-0">
              <div class="flex flex-wrap gap-3 items-center">
                <div class="relative inline-block">
                  <div class="w-[1.9rem] h-[1.9rem] rounded-full grid place-items-center bg-white/[0.06] border border-border font-bold flex-none">{initials(peer.label)}</div>
                  <span class={`absolute -bottom-px -right-px w-[11px] h-[11px] rounded-full border-2 border-[var(--bg-elevated)] shadow-[0_0_0_1px_rgba(0,0,0,0.2)] ${peer.status === 'available' || peer.status === 'online' ? 'bg-positive' : peer.status === 'away' ? 'bg-warning' : peer.status === 'busy' || peer.status === 'dnd' ? 'bg-[#ff8a8a]' : 'bg-text-soft'}`}></span>
                </div>
                <div>
                  <strong class="[overflow-wrap:anywhere] break-words min-w-0">{peer.label}</strong>
                  <div class="text-text-muted leading-[1.5] m-0 [overflow-wrap:anywhere] break-words min-w-0">{peer.kind}</div>
                </div>
              </div>
              <span class="text-text-muted leading-[1.5] m-0">{peer.status || 'offline'}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <Composer
      {section}
      {sectionLabels}
      {contacts}
      {communities}
      {startFabPress}
      {endFabPress}
      {activateFab}
      bind:composerMenuOpen
      bind:composerMenuDialogEl
      {closeComposerMenu}
      {composerMenuActions}
      {openComposerAction}
      bind:composerOpen
      bind:composerDialogEl
      {closeComposer}
      {selectedComposerAction}
      bind:composerActionId
      bind:composerSecure
      bind:destinationPickerOpen
      {composerTarget}
      bind:composerTargetId
      {composerTargets}
      {setComposerTarget}
      bind:coverSectionOpen
      bind:titleSectionOpen
      bind:composerCoverDropActive
      {composerCoverUploadBusy}
      bind:composerCoverImageUrl
      {handleComposerCoverDrop}
      {handleComposerCoverPicker}
      bind:composerTopicTitle
      bind:composerTags
      bind:composerTagDraft
      bind:composerBody
      {addComposerTag}
      {removeComposerTag}
      bind:composerChatContactId
      {setComposerChatContact}
      bind:composerGroupName
      bind:composerGroupParticipants
      {toggleComposerGroupParticipant}
      bind:composerMucRoomName
      bind:composerMucCommunityId
      bind:composerMucTopic
      bind:composerMucDefaultMode
      bind:composerMucAutoJoin
      {submitComposer}
    />

    {#if section === 'feed'}
      <FeedView
        {feedDetailOpen}
        selectedFeedItem={selectedFeedItem()}
        bind:communitySheetId
        {attachmentActionBusy}
        {emitAttachment}
        {openReplyComposer}
        bind:feedFilter
        {filterLabels}
        {communities}
        {feedItems}
        {activeFeedId}
        {openFeedItem}
        {closeCommunitySheet}
        bind:communityDialogEl
        {communitySheetTarget}
        {toggleCommunityMembership}
      />
    {:else if section === 'chats'}
      <ChatsView
        bind:chatDetailOpen
        bind:activeChatId
        {chats}
        bind:mucSettingsOpen
        bind:mucTopicDraft
        bind:mucDefaultModeDraft
        bind:mucAutoJoinDraft
        activeChat={activeChat()}
        {syncMucDraftFromChat}
        {postRuntimeAction}
        {saveMucRoomSettings}
      />
    {:else if section === 'contacts'}
      <ContactsView
        {contacts}
        {identity}
        {presence}
        {presenceMessage}
        {chats}
        {security}
        {attachmentSummaries}
        {rosterActionBusy}
        bind:uploadTargetPeerId
        bind:uploadResultUrl
        {uploadBusy}
        bind:advancedOpen
        {peers}
        {addRosterContact}
        {toggleRosterPresence}
        {removeRosterContact}
        {openProfileEditor}
        {requestUploadSlot}
      />
    {/if}
  </main>

  <BottomNav {section} onSelect={setSection} />
  </div>
