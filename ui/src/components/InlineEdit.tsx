import { type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface InlineEditBase {
  label: string
}

interface InlineEditInput extends InlineEditBase, InputHTMLAttributes<HTMLInputElement> {
  multiline?: false
}

interface InlineEditTextarea extends InlineEditBase, TextareaHTMLAttributes<HTMLTextAreaElement> {
  multiline: true
}

type InlineEditProps = InlineEditInput | InlineEditTextarea

const inputClass = 'w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors font-mono'

export function InlineEdit(props: InlineEditProps) {
  const { label, multiline, ...rest } = props
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-mono text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea className={`${inputClass} resize-none leading-relaxed min-h-[72px]`} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input className={inputClass} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
    </div>
  )
}
