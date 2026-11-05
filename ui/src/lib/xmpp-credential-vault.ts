import { Capacitor, registerPlugin, type Plugin } from '@capacitor/core'
import { isElectronShell } from '../native-shell'

export interface SavedXmppCredentials {
  jid: string
  password: string
  service?: string
}

interface AndroidCredentialVault extends Plugin {
  get(): Promise<{ value?: string }>
  set(options: { value: string }): Promise<void>
  clear(): Promise<void>
}

interface ElectronCredentialVault {
  getXmppCredentials(): Promise<SavedXmppCredentials | undefined>
  saveXmppCredentials(credentials: SavedXmppCredentials): Promise<boolean>
  clearXmppCredentials(): Promise<void>
}

const androidVault = registerPlugin<AndroidCredentialVault>('CredentialVault')

function electronVault(): ElectronCredentialVault | undefined {
  return (window as Window & { __XMPP_P2P_NATIVE__?: ElectronCredentialVault }).__XMPP_P2P_NATIVE__
}

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function loadSavedXmppCredentials(): Promise<SavedXmppCredentials | undefined> {
  try {
    if (isAndroid()) {
      const { value } = await androidVault.get()
      return value ? JSON.parse(value) as SavedXmppCredentials : undefined
    }
    if (isElectronShell()) return await electronVault()?.getXmppCredentials()
  } catch (error) {
    console.warn('[XMPP] Could not read saved credentials from secure storage:', error)
  }
  return undefined
}

export async function saveXmppCredentials(credentials: SavedXmppCredentials): Promise<boolean> {
  const serialized = JSON.stringify(credentials)
  if (isAndroid()) {
    await androidVault.set({ value: serialized })
    return true
  }
  if (isElectronShell()) {
    return await electronVault()?.saveXmppCredentials(credentials) ?? false
  }
  return false
}

export async function clearSavedXmppCredentials(): Promise<void> {
  if (isAndroid()) {
    await androidVault.clear()
  } else if (isElectronShell()) {
    await electronVault()?.clearXmppCredentials()
  }
}
