<script>
  let { section, onSelect } = $props()
</script>

<nav
  class="fixed left-2 right-2 bottom-2 z-10 grid grid-cols-3 gap-[0.35rem] p-[0.45rem] rounded-full bg-[rgba(5,6,7,0.94)] border border-border backdrop-blur-[20px]
    min-[900px]:relative min-[900px]:left-auto min-[900px]:right-auto min-[900px]:bottom-auto min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-2 min-[900px]:w-[240px] min-[900px]:h-[calc(100vh-2*var(--spacing-4))] min-[900px]:rounded-xl min-[900px]:px-4 min-[900px]:py-6 min-[900px]:bg-[rgba(11,13,16,0.45)] min-[900px]:backdrop-blur-[24px] min-[900px]:order-first min-[900px]:justify-start min-[900px]:shrink-0"
  aria-label="Primary navigation"
>
  <span class="hidden min-[900px]:block font-bold text-[1.35rem] tracking-[-0.03em] mb-6 pl-4 bg-gradient-to-r from-accent to-accent-strong bg-clip-text text-transparent">
    XMPP P2P
  </span>

  <button
    class={`flex items-center justify-center rounded-full px-4 bg-transparent border border-transparent text-text-muted font-semibold tracking-[0.01em] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] cursor-pointer min-h-12 px-[0.35rem] text-[0.8rem]
      min-[900px]:justify-start min-[900px]:w-full min-[900px]:min-h-[3.25rem] min-[900px]:px-4 min-[900px]:py-3 min-[900px]:text-[0.95rem] min-[900px]:rounded-md
      ${section === 'feed' ? 'bg-accent/[0.18] border-accent/30 text-text' : 'hover:text-text'}`}
    onclick={() => onSelect('feed')}
  >
    Feed
  </button>

  <button
    class={`flex items-center justify-center rounded-full px-4 bg-transparent border border-transparent text-text-muted font-semibold tracking-[0.01em] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] cursor-pointer min-h-12 px-[0.35rem] text-[0.8rem]
      min-[900px]:justify-start min-[900px]:w-full min-[900px]:min-h-[3.25rem] min-[900px]:px-4 min-[900px]:py-3 min-[900px]:text-[0.95rem] min-[900px]:rounded-md
      ${section === 'chats' ? 'bg-accent/[0.18] border-accent/30 text-text' : 'hover:text-text'}`}
    onclick={() => onSelect('chats')}
  >
    Chats
  </button>

  <button
    class={`flex items-center justify-center rounded-full px-4 bg-transparent border border-transparent text-text-muted font-semibold tracking-[0.01em] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] cursor-pointer min-h-12 px-[0.35rem] text-[0.8rem]
      min-[900px]:justify-start min-[900px]:w-full min-[900px]:min-h-[3.25rem] min-[900px]:px-4 min-[900px]:py-3 min-[900px]:text-[0.95rem] min-[900px]:rounded-md
      ${section === 'contacts' ? 'bg-accent/[0.18] border-accent/30 text-text' : 'hover:text-text'}`}
    onclick={() => onSelect('contacts')}
  >
    Contacts
  </button>
</nav>
