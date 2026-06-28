import { describe, it, expect, beforeEach } from 'vitest'
import { IdentityController } from '../bridge/identity/controller'

describe('IdentityController', () => {
  let controller: IdentityController

  beforeEach(() => {
    localStorage.clear()
    controller = new IdentityController()
  })

  it('starts with no identity', () => {
    const state = controller.getState()
    expect(state.identity).toBeNull()
    expect(state.onboarding.completed).toBe(false)
  })

  it('creates an identity', () => {
    controller.createIdentity('Test User', 'testuser', 'secret123')
    const state = controller.getState()
    expect(state.identity?.displayName).toBe('Test User')
    expect(state.identity?.handle).toBe('testuser')
    expect(state.identity?.jid).toBe('testuser@peer')
    expect(state.identity?.recoveryPhrase).toHaveLength(12)
  })

  it('imports identity via phrase', () => {
    controller.importIdentity('phrase', {
      displayName: 'Imported User',
      handle: 'imported',
      phrase: ['word1', 'word2'],
    })
    const state = controller.getState()
    expect(state.identity?.displayName).toBe('Imported User')
    expect(state.identity?.recoveryPhrase).toEqual(['word1', 'word2'])
  })

  it('sets recovery phrase saved', () => {
    controller.createIdentity('Test', 'test')
    controller.setPhraseSaved()
    expect(controller.getState().identity?.recoveryPhraseSaved).toBe(true)
  })

  it('completes onboarding', () => {
    controller.completeOnboarding()
    expect(controller.getState().onboarding.completed).toBe(true)
    expect(controller.getState().onboarding.completedAt).toBeDefined()
    expect(controller.isOnboardingComplete()).toBe(true)
  })

  it('sets permissions', () => {
    controller.setPermissions({ notifications: false, microphone: true })
    expect(controller.getState().permissions.notifications).toBe(false)
    expect(controller.getState().permissions.microphone).toBe(true)
  })

  it('sets preferences', () => {
    controller.setPreferences({ theme: 'dark' })
    expect(controller.getState().preferences.theme).toBe('dark')
  })

  it('resets identity', () => {
    controller.createIdentity('Test', 'test')
    controller.completeOnboarding()
    controller.setPermissions({ notifications: false })
    controller.setPreferences({ theme: 'dark' })

    controller.resetIdentity()

    const state = controller.getState()
    expect(state.identity).toBeNull()
    expect(state.onboarding.completed).toBe(false)
    expect(state.permissions.notifications).toBe(true)
    expect(state.preferences.theme).toBe('system')
  })

  it('persists identity to localStorage', () => {
    controller.createIdentity('Persist', 'persist')
    const fromStorage = JSON.parse(localStorage.getItem('xmpp-p2p:identity')!)
    expect(fromStorage.displayName).toBe('Persist')
    expect(fromStorage.handle).toBe('persist')
  })
})
