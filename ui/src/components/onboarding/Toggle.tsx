import type { FC } from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

const Toggle: FC<ToggleProps> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-[42px] h-[26px] rounded-full transition-colors flex-shrink-0 ${
      checked ? 'bg-primary' : 'bg-secondary'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`absolute top-[4px] w-[18px] h-[18px] bg-white rounded-full transition-transform ${
        checked ? 'translate-x-[20px]' : 'translate-x-[4px]'
      }`}
    />
  </button>
)

export default Toggle
