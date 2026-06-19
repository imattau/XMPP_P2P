<script>
  let { variant = 'default', class: className = '', children } = $props()

  const variantClasses = {
    default: '',
    secure: 'text-positive-strong border-positive/25 bg-positive/[0.09]',
    warn: 'text-warning border-warning/25 bg-warning/[0.08]',
    muted: 'text-text-soft',
    time: 'font-mono'
  }
</script>

<span class={`inline-flex items-center gap-[0.35rem] px-[0.6rem] py-[0.35rem] rounded-full border border-border text-text-muted text-[0.78rem] ${variantClasses[variant]} ${className}`}>
  {@render children?.()}
</span>
