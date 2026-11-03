import * as React from 'react'
import { useNavigate } from 'react-router'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'

export default function PermissionsPage() {
  const navigate = useNavigate()
  const { identity } = useIdentityBridge()
  React.useEffect(() => {
    navigate(identity ? '/onboarding/network' : '/onboarding', { replace: true })
  }, [identity, navigate])
  return null
}
