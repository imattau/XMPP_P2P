export interface IdentityState {
  displayName: string
  handle: string
  jid: string
  recoveryPasscode?: string
  publicProfile: boolean
  recoveryPhrase: string[]
  recoveryPhraseSaved: boolean
  createdAt: string
}

export interface OnboardingState {
  completed: boolean
  completedAt?: string
}

export interface PermissionsState {
  notifications: boolean
  nearbyDiscovery: boolean
  photosAndFiles: boolean
  microphone: boolean
}

export interface PreferencesState {
  messageNotifications: boolean
  feedNotifications: boolean
  autoDownloadMedia: boolean
  theme: 'system' | 'dark'
}

export interface IdentityViewState {
  identity: IdentityState | null
  onboarding: OnboardingState
  permissions: PermissionsState
  preferences: PreferencesState
}
