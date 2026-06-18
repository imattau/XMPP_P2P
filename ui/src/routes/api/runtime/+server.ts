import { json } from '@sveltejs/kit'
import { getXmppUiRuntime } from '$lib/server/xmpp-runtime.js'

export async function GET() {
  const runtime = await getXmppUiRuntime()
  return json(await runtime.snapshot())
}

export async function POST({ request }) {
  const runtime = await getXmppUiRuntime()
  const payload = await request.json()

  switch (payload.action) {
    case 'presence:update':
      await runtime.setPresence(payload.presence, payload.message ?? '')
      break
    case 'feed:publish':
      await runtime.publishFeed(
        payload.body ?? '',
        payload.targetId ?? 'feed',
        Boolean(payload.secure),
        payload.title,
        payload.categories ?? []
      )
      break
    case 'chat:direct':
      await runtime.sendDirectMessage(payload.peerId ?? '', payload.body ?? '', Boolean(payload.secure))
      break
    case 'chat:group':
      await runtime.sendGroupMessage(payload.name ?? '', payload.body ?? '', Boolean(payload.secure), payload.participantIds ?? [])
      break
    case 'chat:muc':
      await runtime.sendRoomMessage(payload.roomName ?? '', payload.body ?? '', Boolean(payload.secure), {
        topic: payload.topic,
        communityId: payload.communityId,
        autoJoin: payload.autoJoin,
        defaultMode: payload.defaultMode
      })
      break
    case 'chat:muc:update':
      await runtime.updateRoomSettings(payload.roomName ?? '', {
        topic: payload.topic,
        communityId: payload.communityId,
        autoJoin: payload.autoJoin,
        defaultMode: payload.defaultMode
      })
      break
    case 'chat:muc:mam':
      await runtime.queryRoomHistory(payload.roomName ?? '')
      break
    case 'roster:add':
      await runtime.addRosterContact(payload.jid ?? '', payload.name)
      break
    case 'roster:remove':
      await runtime.removeRosterContact(payload.jid ?? '')
      break
    case 'roster:subscribe':
      await runtime.subscribeRosterPresence(payload.jid ?? '')
      break
    case 'roster:unsubscribe':
      await runtime.unsubscribeRosterPresence(payload.jid ?? '')
      break
    case 'community:join':
      await runtime.joinCommunity(payload.id ?? '', payload.name)
      break
    case 'community:leave':
      await runtime.leaveCommunity(payload.id ?? '')
      break
    case 'upload:request-slot':
      return json(
        await runtime.requestUploadSlot(
          payload.target ?? '',
          payload.filename ?? 'upload.bin',
          Number(payload.size ?? 0),
          payload.contentType
        )
      )
    case 'upload:put':
      await runtime.putUpload(payload.putUrl ?? '', payload.base64 ?? '', payload.contentType)
      return json({ getUrl: payload.getUrl ?? payload.putUrl ?? '' })
    case 'attachment:notice':
      return json(await runtime.notice(payload.topic ?? '', payload.targetId ?? '', payload.value))
    case 'attachment:react':
      return json(await runtime.react(payload.topic ?? '', payload.targetId ?? '', payload.reaction ?? ''))
    default:
      return json({ error: `Unknown action: ${payload.action}` }, { status: 400 })
  }

  return json(await runtime.snapshot())
}
