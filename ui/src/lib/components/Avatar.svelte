<script>
  let { glyph = '', imageUrl = undefined, square = false, size = 'default', class: className = '' } = $props()
</script>

<div
  class={`flex items-center justify-center border border-border font-bold flex-none
    ${size === 'lg' ? 'w-[2.1rem] h-[2.1rem]' : 'w-[1.9rem] h-[1.9rem]'}
    ${square ? 'rounded-[0.4rem]' : 'rounded-full'}
    ${imageUrl ? 'object-cover' : 'bg-white/[0.06]'}
    ${className}`}
>
  {#if imageUrl}
    <img src={imageUrl} alt="" class="w-full h-full object-cover rounded-[inherit]" />
  {:else}
    {glyph}
  {/if}
</div>
