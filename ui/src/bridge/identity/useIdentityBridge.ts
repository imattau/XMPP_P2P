import { useEffect, useState } from 'react'
import type { IdentityViewState, PermissionsState, PreferencesState } from './types'
import { identityController } from './controller'

export function useIdentityBridge() {
  const [state, setState] = useState<IdentityViewState>(identityController.getState())

  useEffect(() => {
    return identityController.subscribe(setState)
  }, [])

  return {
    ...state,
    createIdentity: (displayName: string, handle: string, passcode?: string) =>
      identityController.createIdentity(displayName, handle, passcode),
    importIdentity: (method: 'qr' | 'phrase' | 'backup' | 'paste', data: { displayName: string; handle: string; jid?: string; phrase?: string[] }) =>
      identityController.importIdentity(method, data),
    setPhraseSaved: () => identityController.setPhraseSaved(),
    completeOnboarding: () => identityController.completeOnboarding(),
    setPermissions: (p: Partial<PermissionsState>) => identityController.setPermissions(p),
    setPreferences: (p: Partial<PreferencesState>) => identityController.setPreferences(p),
    setTheme: (t: 'system' | 'dark') => identityController.setTheme(t),
    resetIdentity: () => identityController.resetIdentity(),
  }
}
