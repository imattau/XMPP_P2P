interface XmppConnectionErrorProps {
  message: string
}

function getHint(message: string): string | undefined {
  if (/disconnected before authentication completed/i.test(message)) {
    return 'This endpoint closed the XMPP stream before sign-in finished. Confirm that the provider’s published wss:// address is the active XMPP-over-WebSocket endpoint for this account domain.'
  }
  if (/\b(?:ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ERR_NAME_NOT_RESOLVED)\b|\btimeout\b|timed out/i.test(message)) {
    return 'Could not reach that server address. Check your internet connection and the provider’s current secure WebSocket URL, then retry.'
  }
  if (/WebSocket.*(?:connection failed|ECONNERROR|ECONNREFUSED|timeout|timed out)|(?:ECONNERROR|ECONNREFUSED).*WebSocket/i.test(message)) {
    return 'Check that your provider offers XMPP over secure WebSockets and enter its published wss:// address above. Some servers only accept native XMPP connections.'
  }
  return undefined
}

export default function XmppConnectionError({ message }: XmppConnectionErrorProps) {
  const hint = getHint(message)
  return (
    <div role="alert" className="space-y-1 text-xs text-destructive">
      <p className="break-words">{message}</p>
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </div>
  )
}
