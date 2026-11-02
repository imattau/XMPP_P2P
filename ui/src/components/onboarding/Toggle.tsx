import type { FC } from 'react'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

const Toggle: FC<ToggleProps> = ({ label, checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-offset-2 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    }`}
  >
    <span aria-hidden="true" className={`relative h-[26px] w-[42px] rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}>
      <span className={`absolute left-0 top-[4px] w-[18px] h-[18px] bg-white rounded-full transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[4px]'}`} />
    </span>
  </button>
)

export default Toggle
