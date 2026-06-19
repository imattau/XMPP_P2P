<script>
  let {
    section,
    sectionLabels,
    contacts,
    communities,
    startFabPress,
    endFabPress,
    activateFab,
    composerMenuOpen = $bindable(),
    composerMenuDialogEl = $bindable(),
    closeComposerMenu,
    composerMenuActions,
    openComposerAction,
    composerOpen = $bindable(),
    composerDialogEl = $bindable(),
    closeComposer,
    selectedComposerAction,
    composerActionId = $bindable(),
    composerSecure = $bindable(),
    destinationPickerOpen = $bindable(),
    composerTarget,
    composerTargetId = $bindable(),
    composerTargets,
    setComposerTarget,
    coverSectionOpen = $bindable(),
    titleSectionOpen = $bindable(),
    composerCoverDropActive = $bindable(),
    composerCoverUploadBusy,
    composerCoverImageUrl = $bindable(),
    handleComposerCoverDrop,
    handleComposerCoverPicker,
    composerTopicTitle = $bindable(),
    composerTags = $bindable(),
    composerTagDraft = $bindable(),
    composerBody = $bindable(),
    addComposerTag,
    removeComposerTag,
    composerChatContactId = $bindable(),
    setComposerChatContact,
    composerGroupName = $bindable(),
    composerGroupParticipants = $bindable(),
    toggleComposerGroupParticipant,
    composerMucRoomName = $bindable(),
    composerMucCommunityId = $bindable(),
    composerMucTopic = $bindable(),
    composerMucDefaultMode = $bindable(),
    composerMucAutoJoin = $bindable(),
    submitComposer
  } = $props()
</script>

{#if section === 'feed' || section === 'chats'}
  <button
    class={`fixed right-4 bottom-[5.6rem] z-[11] w-[3.25rem] h-[3.25rem] rounded-full flex items-center justify-center text-[1.5rem] font-bold leading-none border-0 [touch-action:manipulation] bg-accent text-white shadow-[0_12px_28px_rgba(91,75,207,0.28)]`}
    type="button"
    aria-label={`Create a new ${section === 'feed' ? 'feed' : 'chat'} item`}
    title="Press and hold for more options"
    onpointerdown={startFabPress}
    onpointerup={endFabPress}
    onpointercancel={endFabPress}
    onpointerleave={endFabPress}
    onclick={activateFab}
  >
    +
  </button>
{/if}

{#if composerMenuOpen}
  <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={closeComposerMenu}></div>
  <div
    class="fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-3 max-h-[80vh] overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none"
    bind:this={composerMenuDialogEl}
    role="dialog"
    aria-label="Choose create action"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="surface__head">
      <div>
        <p class="eyebrow">{sectionLabels[section]}</p>
        <h3>Choose an action</h3>
      </div>
      <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px" type="button" onclick={closeComposerMenu}>Cancel</button>
    </div>

    <div class="grid gap-2">
      {#each composerMenuActions() as action}
        <button class="grid gap-1 w-full text-left p-3 rounded-md border border-border bg-white/[0.03] text-text hover:border-accent/[0.24] hover:bg-accent/[0.06]" type="button" onclick={() => openComposerAction(action.id)}>
          <strong class="font-display text-base">{action.label}</strong>
          <span class="meta">{action.description}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if composerOpen}
  <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={closeComposer}></div>
  <div
    class="fixed top-0 left-0 right-0 bottom-0 max-h-screen h-screen rounded-none z-[12] bg-surface border border-border shadow-[var(--shadow)] backdrop-blur-[18px] p-4 grid gap-4 overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none"
    bind:this={composerDialogEl}
    role="dialog"
    aria-label={selectedComposerAction().label}
    aria-modal="true"
    tabindex="-1"
  >
    <div class="flex items-center justify-between gap-3 pb-3 border-b border-border">
      <button class="bg-transparent text-text-muted text-[0.88rem] p-0" type="button" onclick={closeComposer}>Cancel</button>
      <strong class="font-display text-[0.95rem]">{selectedComposerAction().label}</strong>
      <div class="flex items-center gap-2 min-w-[1.6rem] justify-end">
        {#if composerActionId === 'chat-direct' || composerActionId === 'chat-group'}
          <button
            class={`w-[1.8rem] h-[1.8rem] rounded-md border border-border bg-white/[0.03] text-text-soft text-[0.85rem] ${composerSecure ? 'bg-positive/[0.12] border-positive/[0.32] text-positive-strong' : ''}`}
            type="button"
            aria-pressed={composerSecure}
            aria-label={composerSecure ? 'Encryption on' : 'Encryption off'}
            onclick={() => (composerSecure = !composerSecure)}
          >
            🔒
          </button>
        {/if}
      </div>
    </div>

    {#if composerActionId === 'feed-post' || composerActionId === 'feed-article' || composerActionId === 'feed-community-post' || composerActionId === 'feed-topic-post'}
      <button class="flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 border-b border-border text-text-muted text-[0.85rem]" type="button" onclick={() => (destinationPickerOpen = !destinationPickerOpen)}>
        <span>Posting to</span>
        <span class="text-accent-text font-semibold">{composerTarget().tag} <span aria-hidden="true">⌄</span></span>
      </button>
      {#if destinationPickerOpen}
        <div class="flex flex-wrap gap-2 items-center" aria-label="Post destination">
          {#each (composerActionId === 'feed-post' || composerActionId === 'feed-article' ? composerTargets() : communities) as target}
            <button
              class="chip"
              class:is-active={composerTargetId === target.id}
              type="button"
              onclick={() => { setComposerTarget(target.id); destinationPickerOpen = false }}
            >
              {target.tag}
            </button>
          {/each}
        </div>
      {/if}
      {#if composerActionId === 'feed-article'}
        <div class="border-b border-border">
          <button class="flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 text-text-soft text-[0.85rem]" type="button" onclick={() => (coverSectionOpen = !coverSectionOpen)}>
            <span>{coverSectionOpen ? '−' : '+'} Cover image</span>
            <span aria-hidden="true">{coverSectionOpen ? '⌃' : '⌄'}</span>
          </button>
          {#if coverSectionOpen}
            <div class="grid gap-2 pb-3">
              <label
                class={`grid gap-2 p-3 rounded-lg border border-dashed border-border bg-white/[0.03] cursor-pointer ${composerCoverDropActive ? 'border-accent/50 bg-accent/[0.08]' : ''}`}
                ondragover={(event) => { event.preventDefault(); composerCoverDropActive = true }}
                ondragleave={() => (composerCoverDropActive = false)}
                ondrop={handleComposerCoverDrop}
              >
                <input accept="image/*" type="file" onchange={handleComposerCoverPicker} />
                <span class="text-text-muted text-[0.9rem] leading-[1.4]">
                  {composerCoverUploadBusy ? 'Uploading cover...' : 'Drop an image here or choose a file'}
                </span>
                {#if composerCoverImageUrl}
                  <a class="meta mono" href={composerCoverImageUrl} target="_blank" rel="noreferrer">{composerCoverImageUrl}</a>
                {/if}
              </label>
            </div>
          {/if}
        </div>
        <div class="border-b border-border">
          <button class="flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 text-text-soft text-[0.85rem]" type="button" onclick={() => (titleSectionOpen = !titleSectionOpen)}>
            <span>{titleSectionOpen ? '−' : '+'} Title &amp; tags</span>
            <span aria-hidden="true">{titleSectionOpen ? '⌃' : '⌄'}</span>
          </button>
          {#if titleSectionOpen}
            <div class="grid gap-2 pb-3">
              <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
                <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Title</span>
                <input class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" bind:value={composerTopicTitle} type="text" placeholder="Post title" />
              </label>
              <div class="flex flex-wrap gap-2 items-center">
                {#each composerTags as tag}
                  <button class="text-[0.78rem] px-[0.6rem] py-[0.3rem] rounded-md bg-accent/10 text-accent-text border border-accent/[0.26]" type="button" onclick={() => removeComposerTag(tag)}>#{tag} ✕</button>
                {/each}
                <input
                  class="text-[0.78rem] px-[0.6rem] py-[0.3rem] rounded-md bg-transparent border border-dashed border-border-strong text-text-muted min-w-[6rem]"
                  type="text"
                  placeholder="+ tag"
                  bind:value={composerTagDraft}
                  onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addComposerTag() } }}
                  onblur={addComposerTag}
                />
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {:else if composerActionId === 'chat-direct'}
      <button class="flex items-center justify-between w-full py-[0.6rem] bg-transparent border-0 border-b border-border text-text-muted text-[0.85rem]" type="button" onclick={() => (destinationPickerOpen = !destinationPickerOpen)}>
        <span>Sending to</span>
        <span class="text-accent-text font-semibold">{contacts.find((contact) => contact.id === composerChatContactId)?.name ?? 'Select a contact'} <span aria-hidden="true">⌄</span></span>
      </button>
      {#if destinationPickerOpen}
        <div class="flex flex-wrap gap-2 items-center" aria-label="Chat contact">
          {#each contacts as contact}
            <button
              class="chip"
              class:is-active={composerChatContactId === contact.id}
              type="button"
              onclick={() => { setComposerChatContact(contact.id); destinationPickerOpen = false }}
            >
              {contact.name}
            </button>
          {/each}
        </div>
      {/if}
    {:else if composerActionId === 'chat-group'}
      <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
        <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Group name</span>
        <input class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" bind:value={composerGroupName} type="text" placeholder="Project team" />
      </label>
      <div class="flex flex-wrap gap-2 items-center flex-wrap overflow-x-visible" aria-label="Group participants">
        {#each contacts as contact}
          <button
            class="chip"
            class:is-active={composerGroupParticipants.includes(contact.id)}
            type="button"
            onclick={() => toggleComposerGroupParticipant(contact.id)}
          >
            {contact.name}
          </button>
        {/each}
      </div>
    {:else if composerActionId === 'chat-muc'}
      <div class="grid gap-4 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <div class="section__title">
          <p class="eyebrow">Room settings</p>
          <h3>Configure the new MUC</h3>
          <p class="hint">The room topic and community choice are stored with the live thread snapshot when the room is created.</p>
        </div>

        <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
          <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Room name</span>
          <input class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" bind:value={composerMucRoomName} type="text" placeholder="lobby" required />
        </label>
        <div class="flex flex-wrap gap-2 items-center" aria-label="Room community">
          {#each communities as community}
            <button
              class="chip"
              class:is-active={composerMucCommunityId === community.id}
              type="button"
              onclick={() => (composerMucCommunityId = community.id)}
            >
              {community.tag}
            </button>
          {/each}
        </div>
        <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
          <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Room topic</span>
          <input class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" bind:value={composerMucTopic} type="text" placeholder="Protocol discussion" />
        </label>
        <div class="flex flex-wrap gap-3">
          <label class="inline-flex items-center gap-2 px-[0.7rem] py-[0.45rem] rounded-full border border-border bg-white/[0.03] text-text-muted">
            <input checked={composerMucDefaultMode === 'secure'} type="checkbox" onchange={(event) => (composerMucDefaultMode = event.currentTarget.checked ? 'secure' : 'open')} />
            <span>Secure by default</span>
          </label>
          <label class="inline-flex items-center gap-2 px-[0.7rem] py-[0.45rem] rounded-full border border-border bg-white/[0.03] text-text-muted">
            <input bind:checked={composerMucAutoJoin} type="checkbox" />
            <span>Auto-join</span>
          </label>
        </div>
      </div>
    {/if}

    {#if composerActionId === 'feed-article'}
      <div class="flex items-center gap-2 py-2 border-b border-border" role="toolbar" aria-label="Rich text formatting">
        <button class="w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center" type="button" aria-label="Bold">B</button>
        <button class="w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center" type="button" aria-label="Italic">I</button>
        <button class="w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center" type="button" aria-label="Heading">H</button>
        <button class="w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center" type="button" aria-label="Link">🔗</button>
        <button class="w-[1.7rem] h-[1.7rem] rounded-md bg-white/[0.03] border border-border text-text-muted text-[0.75rem] grid place-items-center" type="button" aria-label="List">≣</button>
      </div>
    {/if}

    <form class="flex flex-col flex-1 gap-3 min-h-0" onsubmit={submitComposer}>
      {#if composerActionId === 'feed-topic-post'}
        <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
          <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Topic title</span>
          <input class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" bind:value={composerTopicTitle} type="text" placeholder="Discussion title" />
        </label>
      {/if}

      <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%] flex-1 flex flex-col min-h-0">
        <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">{composerActionId.startsWith('chat') ? 'Message' : 'Post text'}</span>
        <textarea
          class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text flex-1 min-h-24 resize-none"
          bind:value={composerBody}
          placeholder={composerActionId === 'chat-muc' ? 'Optional opening message' : composerActionId.startsWith('chat') ? 'Write the opening message' : 'Write a post'}
        ></textarea>
      </label>

      <div class="flex flex-wrap items-center justify-between gap-3 max-[540px]:flex-col max-[540px]:items-stretch">
        <p class="hint">
          {#if composerActionId === 'feed-post'}
            Posting to: {composerTarget().tag}
          {:else if composerActionId === 'feed-community-post' || composerActionId === 'feed-topic-post'}
            Posting to: {composerTarget().tag}
          {:else if composerActionId === 'chat-direct'}
            Starting chat with: {contacts.find((contact) => contact.id === composerChatContactId)?.name}
          {:else if composerActionId === 'chat-group'}
            Members: {composerGroupParticipants.length || 2}
          {:else}
            Room: {composerMucRoomName || 'New MUC'}
          {/if}
        </p>
        <div class="action-group">
          <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-transparent border border-border-strong text-text shadow-none font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px max-[540px]:w-full" type="button" onclick={closeComposer}>Cancel</button>
          <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px max-[540px]:w-full" type="submit">
            {composerActionId === 'chat-muc' ? 'Create room' : selectedComposerAction().label}
          </button>
        </div>
      </div>
    </form>
  </div>
{/if}
