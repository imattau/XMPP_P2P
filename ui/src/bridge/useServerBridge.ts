import { useCallback, useEffect, useState } from 'react'
import { getBrowserXmppBridge, type BridgeServerConnectionInfo, type BridgeStoredComponentConfig } from './runtime'

export interface ServerBridgeState {
  connections: BridgeServerConnectionInfo[]
  savedConfigs: BridgeStoredComponentConfig[]
  connecting: boolean
  federationEnabled: boolean
}

export function useServerBridge() {
  const [state, setState] = useState<ServerBridgeState>({
    connections: [],
    savedConfigs: [],
    connecting: false,
    federationEnabled: true,
  })

  const refreshSavedConfigs = useCallback(async () => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.listSavedComponentConfigs) return
    try {
      const configs = await runtime.listSavedComponentConfigs()
      setState(prev => ({ ...prev, savedConfigs: configs }))
    } catch {
      // ignore
    }
  }, [])

  const refreshConnections = useCallback(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.getServerConnections) return
    const connections = runtime.getServerConnections()
    setState(prev => ({ ...prev, connections }))
  }, [])

  const refreshFederationEnabled = useCallback(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.isFederationEnabled) return
    const enabled = runtime.isFederationEnabled()
    setState(prev => ({ ...prev, federationEnabled: enabled }))
  }, [])

  useEffect(() => {
    const runtime = getBrowserXmppBridge()

    refreshConnections()
    refreshFederationEnabled()
    void refreshSavedConfigs()

    if (!runtime?.onServerConnection) return

    const unsub = runtime.onServerConnection(() => {
      refreshConnections()
    })

    return unsub
  }, [refreshConnections, refreshSavedConfigs, refreshFederationEnabled])

  const connectComponent = useCallback(async (host: string, port: number, secret: string, domain: string): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.connectComponent) throw new Error('Bridge not available')
    setState(prev => ({ ...prev, connecting: true }))
    try {
      await runtime.connectComponent(host, port, secret, domain)
    } finally {
      setState(prev => ({ ...prev, connecting: false }))
    }
  }, [])

  const disconnectComponent = useCallback(async (): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.disconnectComponent) throw new Error('Bridge not available')
    await runtime.disconnectComponent()
  }, [])

  const isComponentConnected = useCallback((): boolean => {
    const runtime = getBrowserXmppBridge()
    return runtime?.isComponentConnected?.() ?? false
  }, [])

  const setS2SDomain = useCallback((domain: string): void => {
    const runtime = getBrowserXmppBridge()
    runtime?.setS2SDomain?.(domain)
  }, [])

  const setFederationEnabled = useCallback((enabled: boolean): void => {
    const runtime = getBrowserXmppBridge()
    runtime?.setFederationEnabled?.(enabled)
    setState(prev => ({ ...prev, federationEnabled: enabled }))
    refreshConnections()
  }, [refreshConnections])

  const resolveComponentEndpoint = useCallback(async (domain: string): Promise<{ host: string; port: number }> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.resolveComponentEndpoint) throw new Error('Bridge not available')
    return runtime.resolveComponentEndpoint(domain)
  }, [])

  const saveComponentConfig = useCallback(async (domain: string, secret: string, host: string, port: number): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.saveComponentConfig) throw new Error('Bridge not available')
    await runtime.saveComponentConfig(domain, secret, host, port)
    await refreshSavedConfigs()
  }, [refreshSavedConfigs])

  const removeComponentConfig = useCallback(async (domain: string): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.removeComponentConfig) throw new Error('Bridge not available')
    await runtime.removeComponentConfig(domain)
    await refreshSavedConfigs()
  }, [refreshSavedConfigs])

  return {
    ...state,
    connectComponent,
    disconnectComponent,
    isComponentConnected,
    setS2SDomain,
    setFederationEnabled,
    resolveComponentEndpoint,
    saveComponentConfig,
    removeComponentConfig,
    refreshSavedConfigs,
  }
}
