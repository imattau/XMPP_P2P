/**
 * @packageDocumentation Shared IPC contract for the Electron native shell.
 *
 * The renderer talks to one `BrowserXmppRuntimeBridge` living in the main
 * process. Everything that is not an event subscription is a plain method
 * call; a small set of getters must remain synchronous because the existing
 * React hooks read them during render.
 */

/** Methods that return synchronously in `XmppRuntimeBridge`. */
export const SYNC_METHODS = [
  'getConnectedPeers',
  'getLocalJid',
  'getServerJid',
  'getLocalPeerAddresses',
  'getMucParticipants',
  'isComponentConnected',
  'isServerConnected',
  'getServerStatus',
  'getServerConnections'
] as const

/** Event subscription methods (`onX(cb) => unsubscribe`). */
export const EVENT_METHODS = [
  'onAttachmentSummary',
  'onMessage',
  'onPresence',
  'onFeedPost',
  'onCollectionPost',
  'onConnectionChange',
  'onChatState',
  'onMucMessage',
  'onMucJoin',
  'onMucLeave',
  'onMucError',
  'onMucChatState',
  'onMucMarker',
  'onServerConnection',
  'onServerRosterChange',
  'onServerPresenceSubscriptionRequest'
] as const

/** Asynchronous request/response methods exposed over `ipcRenderer.invoke`. */
export const ASYNC_METHODS = [
  'getFeedPosts',
  'getAttachments',
  'publishFeed',
  'subscribeFeed',
  'setFeedSubscriptionVisibility',
  'unsubscribeFeed',
  'getFeedSubscriptions',
  'getFollowedFeedSources',
  'followFeedSource',
  'unfollowFeedSource',
  'discoverRssFeeds',
  'addRssFeed',
  'getRssFeeds',
  'refreshRssFeed',
  'setRssFeedPaused',
  'removeRssFeed',
  'getPublicFeedSubscriptions',
  'watchFeedFollowers',
  'getFeedFollowers',
  'getCollections',
  'createCollection',
  'subscribeCollection',
  'unsubscribeCollection',
  'getCollectionPosts',
  'publishCollection',
  'react',
  'notice',
  'createPrivateMucRoom',
  'joinMucRoom',
  'leaveMucRoom',
  'joinServerMuc',
  'leaveServerMuc',
  'getMucRoomSettings',
  'updateMucRoomSettings',
  'sendChatMessage',
  'getVCard',
  'setVCard',
  'broadcastPresence',
  'getRosterEntries',
  'addRosterEntry',
  'removeRosterEntry',
  'sendChatState',
  'sendMucChatState',
  'getMucHistory',
  'queryChatHistory',
  'queryServerChatHistory',
  'queryServerMucHistory',
  'discoverServerMucRooms',
  'subscribeServerMicroblog',
  'getServerMicroblogSubscriptions',
  'unsubscribeServerMicroblog',
  'refreshServerMicroblog',
  'publishServerMicroblog',
  'connectComponent',
  'disconnectComponent',
  'connectServer',
  'disconnectServer',
  'registerServer',
  'approveServerPresenceSubscription',
  'denyServerPresenceSubscription',
  'saveComponentConfig',
  'listSavedComponentConfigs',
  'removeComponentConfig',
  'uploadFile',
  'resolveUploadUrl',
  'getOmemoFingerprint',
  'getPeerOmemoFingerprint',
  'kickMucParticipant',
  'banMucParticipant'
] as const

/** Every callable method accepted by the main-process dispatcher. */
export const ALL_METHODS = new Set<string>([
  ...SYNC_METHODS,
  ...EVENT_METHODS,
  ...ASYNC_METHODS,
  'disconnect'
])

/** IPC channel names. */
export const IPC = {
  start: 'xmpp:start',
  call: 'xmpp:call',
  callSync: 'xmpp:call-sync',
  disconnect: 'xmpp:disconnect',
  event: 'xmpp:event'
} as const

export interface NativeStartOptions {
  recoveryPhrase?: string[]
  nickname?: string
  dbName?: string
  bootstrapAddrs?: string[]
}
