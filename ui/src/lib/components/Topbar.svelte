<script>
  import { badgeClass, initials } from '$lib/social-data.js'

  let {
    section,
    sectionLabels,
    feedDetailOpen,
    chatDetailOpen,
    presence,
    identity,
    profileDisplayName,
    onBack,
    onTogglePresence
  } = $props()
</script>

<header class="sticky top-0 z-8 flex items-center justify-between gap-3 -mx-3 px-3 py-[0.55rem] bg-[rgba(6,7,8,0.96)] border-b border-border">
  <div class="flex items-center gap-3 min-w-0">
    {#if (section === 'chats' && chatDetailOpen) || (section === 'feed' && feedDetailOpen)}
      <button
        class="inline-flex items-center gap-2 min-h-[2.3rem] px-[0.8rem] border border-border-strong rounded-full bg-white/[0.04] text-text text-[0.88rem] font-semibold flex-none cursor-pointer"
        type="button"
        aria-label={section === 'feed' ? 'Back to feed list' : 'Back to chats'}
        onclick={onBack}
      >
        <span aria-hidden="true">&larr;</span>
        <span>{section === 'feed' ? 'Back to feed' : 'Back to chats'}</span>
      </button>
    {/if}
    {#if identity.avatarDataUrl}
      <img class="flex-none w-[1.9rem] h-[1.9rem] rounded-full object-cover border border-border" src={identity.avatarDataUrl} alt="" />
    {:else}
      <div class="flex items-center justify-center border border-border font-bold flex-none w-[1.9rem] h-[1.9rem] rounded-full bg-white/[0.06]">{initials(profileDisplayName)}</div>
    {/if}
    <div class="grid gap-[0.2rem] min-w-0">
      <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">{section === 'feed' && feedDetailOpen ? 'Feed view' : sectionLabels[section]}</p>
      <strong class="font-display text-[1.05rem] leading-[1.08]">{profileDisplayName}</strong>
    </div>
  </div>

  <button class="inline-flex items-center gap-2 flex-none border-0 bg-transparent p-0 font-inherit cursor-pointer" type="button" onclick={onTogglePresence}>
    <span class={`w-[0.65rem] h-[0.65rem] rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.04)] ${presence === 'available' ? 'bg-positive status-pulse' : presence === 'away' ? 'bg-warning' : 'bg-[#ff8a8a]'}`} aria-hidden="true"></span>
    <span class={badgeClass(presence)}>{presence}</span>
  </button>
</header>
