# Feed Page XMPP/P2P Mapping

Scratch file for implementation planning.

## Scope

This maps the current Feed page UI in `ui/src/pages/FeedPage.tsx` to existing backend surfaces in `src/core/`.

## Backend surfaces already available

- `XmppNode.publishFeed()`
- `XmppNode.getFeedPosts()`
- `XmppNode.subscribeFeed()`
- `XmppNode.setFeedSubscriptionVisibility()`
- `XmppNode.unsubscribeFeed()`
- `XmppNode.getFeedSubscriptions()`
- `XmppNode.getPublicFeedSubscriptions()`
- `XmppNode.watchFeedFollowers()`
- `XmppNode.getFeedFollowers()`
- `XmppNode.publishCollection()`
- `XmppNode.getCollections()`
- `XmppNode.getCollectionPosts()`
- `XmppNode.createCollection()`
- `XmppNode.addFeedToCollection()`
- `XmppNode.subscribeCollection()`
- `XmppNode.unsubscribeCollection()`
- `XmppNode.react()`
- `XmppNode.notice()`
- `XmppNode.getVCard()`
- `XmppNode.setVCard()`
- `XmppNode.broadcastPresence()`
- `XmppNode.getEntityCapabilities()`
- `XmppNode.getDiscoInfo()`
- `XmppNode.getRosterEntries()`
- `XmppNode.subscribePresence()`
- `XmppNode.unsubscribePresence()`

## Feed UI to backend mapping

| Feed UI area | Existing backend match | Notes |
|---|---|---|
| App header identity, local status, avatar | `getVCard()`, `jid`, `broadcastPresence()` | Local user profile is available. The current UI does not yet read it. |
| Main timeline items | `getFeedPosts()` | Direct source for local feed history and incoming feed posts. |
| Post title/body/timestamp/categories | `XmppFeedPost.title`, `.body`, `.publishedAt`, `.categories` | These fields already exist. |
| Author handle / display name / avatar / verified badge | `getVCard()`, `getRosterEntries()`, `getEntityCapabilities()`, `getDiscoInfo()` | This is not a direct feed field. It needs an enrichment layer. |
| Topic tags and topic feeds | `getFeedPosts()`, `getPublicFeedSubscriptions()`, `subscribeFeed()` | The backend has feed topics, but the UI’s social-style topic cards are a presentation layer on top. |
| Community cards | `getCollections()`, `getCollectionPosts()`, `createCollection()`, `subscribeCollection()` | Community feed is closer to collections than to plain feed posts. |
| Open post detail page | `getFeedPosts()`, `getCollectionPosts()`, `getAttachments()` | Detail view can be built from the stored post plus attachment summaries. |
| Like button | `react()` | There is backend support for reactions as attachments. |
| Bookmark/save button | none | No dedicated bookmark primitive exists. |
| Share button | none | Share is a UI action only unless we add a publish/export action. |
| Reply/comment count | partial | No first-class threaded reply store exists in the feed API. This likely needs a separate message/thread model or an attachment-based convention. |
| Search box | none | Current backend exposes no query/search API for feed text. Client-side filtering only works on already-fetched data. |
| Pinned / trending / sort tabs | none | These are presentation logic unless derived from feed stats or collection metadata. |
| Follow/unfollow topic or peer | `subscribeFeed()`, `setFeedSubscriptionVisibility()`, `unsubscribeFeed()` | This is the real backend follow model. |
| Followers panel | `getFeedFollowers()`, `watchFeedFollowers()`, `getPublicFeedSubscriptions()` | Useful for counts and public follower lists. |
| Compose new feed post | `publishFeed()` | This is the primary write path for the Feed page. |
| Compose community post | `publishCollection()` | Use this when the target is a collection/community. |

## Gaps between UI and backend

1. The browser UI does not yet have a transport or bridge into `XmppNode`.
2. The Feed page currently uses mock `FeedPost` objects with social-network fields that do not exist in `XmppFeedPost`.
3. There is no built-in aggregation layer for author enrichment, verification, avatar lookup, or server display.
4. There is no backend bookmark model.
5. There is no backend feed search endpoint.
6. There is no first-class threaded reply/comment store in the feed API.
7. There is no backend notion of likes/repost counts as durable counters unless we build them from attachments or a separate index.
8. The UI’s `topic` and `community` cards need a normalization step to decide whether a card represents:
   - a feed subscription,
   - a collection,
   - a local category tag,
   - or a synthetic view over mixed feed history.

## Recommended implementation seam

- Add a small frontend data adapter that reads from a backend bridge instead of from mock arrays.
- Normalize backend records into a UI feed model with:
  - `type`
  - `author`
  - `body`
  - `timestamp`
  - `topic`
  - `collectionId`
  - `attachmentSummary`
- Treat likes/bookmarks/replies as follow-on features unless we decide to encode them via pubsub attachments or another persisted model.

## Priority implementation order

1. Wire the Feed page to `getFeedPosts()` and `publishFeed()`.
2. Enrich authors from `getVCard()` / `getRosterEntries()`.
3. Map follow actions to `subscribeFeed()` / `unsubscribeFeed()` / `setFeedSubscriptionVisibility()`.
4. Add collection support for community posts using `getCollections()` / `publishCollection()`.
5. Decide on reaction/comment/bookmark storage before building those buttons out.
