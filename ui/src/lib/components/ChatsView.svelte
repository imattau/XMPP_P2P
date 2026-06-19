<script>
  import { chatAvatarGlyph, initials, sortedChats } from '$lib/social-data.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import Badge from '$lib/components/Badge.svelte'

  let {
    chatDetailOpen = $bindable(),
    activeChatId = $bindable(),
    chats,
    mucSettingsOpen = $bindable(),
    mucTopicDraft = $bindable(),
    mucDefaultModeDraft = $bindable(),
    mucAutoJoinDraft = $bindable(),
    activeChat,
    syncMucDraftFromChat,
    postRuntimeAction,
    saveMucRoomSettings
  } = $props()
</script>

<section class="grid gap-[0.45rem]">
  {#if !chatDetailOpen}
    <div class="grid gap-[0.45rem]">
      {#each sortedChats(chats) as chat}
        <button
          class={`grid gap-1 py-[0.55rem] px-[0.4rem] border-b border-white/[0.06] bg-transparent shadow-none [backdrop-filter:none] rounded-none text-left last:border-b-0 cursor-pointer w-full
            ${chat.id === activeChatId ? 'bg-accent/[0.08]' : 'hover:bg-white/[0.03]'}`}
          type="button"
          onclick={() => {
            activeChatId = chat.id
            chatDetailOpen = true
            syncMucDraftFromChat(chat)
            if (chat.kind === 'muc') {
              void postRuntimeAction('chat:muc:mam', { roomName: chat.roomName || chat.id })
            }
          }}
        >
          <div class="flex flex-wrap gap-2 items-center justify-between items-start">
            <div class="flex flex-wrap gap-2 items-center flex-nowrap">
              <Avatar glyph={chatAvatarGlyph(chat)} square={chat.kind === 'muc'} />
              <div>
                <strong>{chat.name}</strong>
                <div class="text-text-muted leading-[1.5] text-sm">{chat.preview}</div>
              </div>
            </div>
            {#if chat.kind === 'muc'}
              <span class="text-text-muted leading-[1.5] text-sm">{chat.occupants.length} in room</span>
            {:else if chat.unread}
              <Badge variant="secure" class="bg-accent/15 border-accent/25 text-text font-bold">
                {chat.unread} unread
              </Badge>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <article class="-mx-3 px-3 py-4 bg-[rgba(17,19,22,0.98)] border border-border shadow-[0_24px_60px_rgba(0,0,0,0.48)] rounded-none min-[900px]:-mx-6 min-[900px]:px-6 min-[900px]:py-6">
      {#if activeChat.kind === 'muc'}
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Room</p>
            <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">{activeChat.name} · {activeChat.occupants.length} members</h3>
            <p class="mt-[0.3rem] mb-0 text-text text-[0.98rem] leading-[1.4]">{activeChat.topic}</p>
          </div>
          <button
            class="flex-none w-10 h-10 rounded-md border border-border bg-white/[0.03] text-text-muted text-[1.1rem] hover:border-border-strong hover:text-text cursor-pointer"
            type="button"
            aria-label={activeChat.localAffiliation === 'owner' ? 'Room settings' : 'Room info'}
            onclick={() => (mucSettingsOpen = !mucSettingsOpen)}
          >
            {activeChat.localAffiliation === 'owner' ? '⚙' : 'ℹ'}
          </button>
        </header>

        <div class="flex gap-3 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Room occupants">
          {#each activeChat.occupants.slice(0, 6) as occupant}
            <div class="grid justify-items-center gap-1 flex-none w-[3.4rem]">
              <Avatar glyph={initials(occupant.nick)} />
              <span class="text-[0.68rem] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-text-soft">{occupant.nick}</span>
            </div>
          {/each}
          {#if activeChat.occupants.length > 6}
            <div class="grid justify-items-center gap-1 flex-none w-[3.4rem]">
              <Avatar
                glyph={`+${activeChat.occupants.length - 6}`}
                class="bg-surface-soft text-text-muted text-[0.72rem] font-semibold"
              />
              <span class="text-[0.68rem] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-text-soft">more</span>
            </div>
          {/if}
        </div>

        {#if mucSettingsOpen && activeChat.localAffiliation === 'owner'}
          <div class="grid gap-4 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02] mb-3">
            <div class="section__title">
              <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Room controls</p>
              <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Room topic and defaults</h3>
            </div>
            <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
              <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Room topic</span>
              <input bind:value={mucTopicDraft} type="text" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" placeholder="Room topic" />
            </label>
            <div class="flex flex-wrap gap-3">
              <label class="inline-flex items-center gap-2 px-[0.7rem] py-[0.45rem] rounded-full border border-border bg-white/[0.03] text-text-muted cursor-pointer">
                <input checked={mucDefaultModeDraft === 'secure'} type="checkbox" onchange={(event) => (mucDefaultModeDraft = event.currentTarget.checked ? 'secure' : 'open')} />
                <span>Secure by default</span>
              </label>
              <label class="inline-flex items-center gap-2 px-[0.7rem] py-[0.45rem] rounded-full border border-border bg-white/[0.03] text-text-muted cursor-pointer">
                <input bind:checked={mucAutoJoinDraft} type="checkbox" />
                <span>Auto-join</span>
              </label>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 max-[540px]:flex-col max-[540px]:items-stretch">
              <div class="text-text-muted leading-[1.5] text-sm">Saved settings control future room defaults and auto-join on restart.</div>
              <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={saveMucRoomSettings}>Save room settings</button>
            </div>
          </div>
        {:else if mucSettingsOpen}
          <div class="grid gap-4 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02] mb-3">
            <div class="section__title">
              <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Room info</p>
              <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Room topic and defaults</h3>
            </div>
            <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
              <span class="text-text-soft">Topic</span>
              <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{activeChat.topic}</span>
            </div>
            <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
              <span class="text-text-soft">Occupants</span>
              <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{activeChat.occupants.length}</span>
            </div>
            <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
              <span class="text-text-soft">Secure by default</span>
              <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{activeChat.defaultSecure === false ? 'Off' : 'On'}</span>
            </div>
            <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
              <span class="text-text-soft">Auto-join</span>
              <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{activeChat.autoJoin === false ? 'Off' : 'On'}</span>
            </div>
          </div>
        {/if}
      {:else}
        <div class="flex flex-wrap gap-2 items-center justify-between items-start">
          <div>
            <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Selected thread</p>
            <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">{activeChat.name}</h3>
          </div>
          <Badge variant={activeChat.secure ? 'secure' : 'warn'}>
            {activeChat.secure ? 'E2EE' : 'open'}
          </Badge>
        </div>
      {/if}

      <div class="grid gap-2 mt-4">
        {#each activeChat.messages as message}
          <div class={`max-w-[42ch] px-[0.95rem] py-[0.8rem] rounded-[1.1rem] bg-white/[0.04] border border-white/[0.06]
            ${message.self ? 'bg-accent/10 border-accent/[0.26] ms-auto' : ''}`}>
            <div class="flex flex-wrap gap-2 items-center justify-between items-start">
              <strong>{message.from}</strong>
              <span class="text-text-muted leading-[1.5] font-mono text-xs">{message.time}</span>
            </div>
            <p class="m-0 mt-1">{message.text} {#if message.corrected}<span class="italic text-[0.8em] text-text-muted">(edited)</span>{/if}</p>
            {#if message.markers && Object.keys(message.markers).length > 0}
              <div class="flex justify-end text-[0.7rem] opacity-60 mt-1">
                <span>✓ Seen by: {Object.keys(message.markers).join(', ')}</span>
              </div>
            {/if}
          </div>
        {/each}
        {#if activeChat.typingNicks && activeChat.typingNicks.length > 0}
          <div class="self-start bg-transparent border-0 shadow-none pt-0 pb-0 bubble typing-bubble">
            <span class="italic text-[0.8em] text-text-soft">{activeChat.typingNicks.join(', ')} {activeChat.typingNicks.length === 1 ? 'is' : 'are'} typing...</span>
          </div>
        {/if}
      </div>
    </article>
  {/if}
</section>
