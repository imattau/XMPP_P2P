<script>
  let { variant = 'person', class: className = '', children } = $props()

  const variantClasses = {
    community: 'bg-accent/[0.12] border-accent/[0.28] text-accent-text',
    person: 'bg-white/5 border-white/[0.12] text-[#edf4fb]'
  }
</script>

<span class={`inline-flex items-center gap-[0.35rem] px-[0.7rem] py-[0.45rem] rounded-full border text-[0.78rem] font-semibold ${variantClasses[variant]} ${className}`}>
  {@render children?.()}
</span>
