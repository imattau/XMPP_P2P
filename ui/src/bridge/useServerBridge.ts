import { useCallback, useEffect, useState } from 'react'
import { getBrowserXmppBridge, type BridgeServerConnectionInfo, type BridgeStoredComponentConfig } from './runtime'

export interface ServerBridgeState {
  connections: BridgeServerConnectionInfo[]
  savedConfigs: BridgeStoredComponentConfig[]
  connecting: boolean
  federationEnabled: boolean
  gatewayOnline: boolean
  gatewayConnections: BridgeServerConnectionInfo[]
}

export function useServerBridge() {
  const [state, setState] = useState<ServerBridgeState>({
    connections: [],
    savedConfigs: [],
    connecting: false,
    federationEnabled: true,
    gatewayOnline: false,
    gatewayConnections: [],
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

  const refreshGatewayStatus = useCallback(async () => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.getServerStatus) return
    try {
      const status = runtime.getServerStatus()
      setState(prev => ({ ...prev, gatewayOnline: status.online, gatewayConnections: status.connections }))
    } catch {
      setState(prev => ({ ...prev, gatewayOnline: false, gatewayConnections: [] }))
    }
  }, [])

  useEffect(() => {
    const runtime = getBrowserXmppBridge()

    refreshConnections()
    refreshFederationEnabled()
    void refreshSavedConfigs()
    void refreshGatewayStatus()

    const interval = setInterval(refreshGatewayStatus, 10000)

    if (!runtime?.onServerConnection) {
      return () => clearInterval(interval)
    }

    const unsub = runtime.onServerConnection(() => {
      refreshConnections()
    })

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [refreshConnections, refreshSavedConfigs, refreshFederationEnabled, refreshGatewayStatus])

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

  const registerServer = useCallback(async (jid: string, password: string, service: string): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.registerServer) throw new Error('Bridge not available')
    setState(prev => ({ ...prev, connecting: true }))
    try {
      await runtime.registerServer(jid, password, service)
      refreshConnections()
      await refreshGatewayStatus()
    } finally {
      setState(prev => ({ ...prev, connecting: false }))
    }
  }, [refreshConnections, refreshGatewayStatus])

  const connectServer = useCallback(async (jid: string, password: string, service?: string): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.connectServer) throw new Error('Bridge not available')
    setState(prev => ({ ...prev, connecting: true }))
    try {
      await runtime.connectServer(jid, password, service)
      refreshConnections()
      await refreshGatewayStatus()
    } finally {
      setState(prev => ({ ...prev, connecting: false }))
    }
  }, [refreshConnections, refreshGatewayStatus])

  const disconnectServer = useCallback(async (): Promise<void> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.disconnectServer) throw new Error('Bridge not available')
    await runtime.disconnectServer()
  }, [])

  const isServerConnected = useCallback((): boolean => {
    const runtime = getBrowserXmppBridge()
    return runtime?.isServerConnected?.() ?? false
  }, [])

  const setFederationEnabled = useCallback((enabled: boolean): void => {
    const runtime = getBrowserXmppBridge()
    runtime?.setFederationEnabled?.(enabled)
    setState(prev => ({ ...prev, federationEnabled: enabled }))
    refreshConnections()
  }, [refreshConnections])

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
    registerServer,
    connectServer,
    disconnectServer,
    isServerConnected,
    setFederationEnabled,
    saveComponentConfig,
    removeComponentConfig,
    refreshSavedConfigs,
  }
}
