<script>
  import Avatar from '$lib/components/Avatar.svelte'
  import Badge from '$lib/components/Badge.svelte'
  import Pill from '$lib/components/Pill.svelte'

  let {
    feedDetailOpen,
    selectedFeedItem,
    communitySheetId = $bindable(),
    attachmentActionBusy,
    emitAttachment,
    openReplyComposer,
    feedFilter = $bindable(),
    filterLabels,
    communities,
    feedItems,
    activeFeedId,
    openFeedItem,
    closeCommunitySheet,
    communityDialogEl = $bindable(),
    communitySheetTarget,
    toggleCommunityMembership
  } = $props()

  const filteredFeedItems = () => {
    if (feedFilter === 'people') {
      return feedItems.filter((item) => item.sourceType === 'person')
    }

    if (feedFilter === 'communities') {
      return feedItems.filter((item) => item.sourceType === 'community')
    }

    if (feedFilter.startsWith('community:')) {
      const communityId = feedFilter.split(':')[1]
      return feedItems.filter((item) => item.sourceId === communityId)
    }

    return feedItems
  }
</script>

<section class="grid gap-[0.45rem]">
  {#if feedDetailOpen}
    <article class="grid gap-5 -mx-3 px-3 py-4 bg-[rgba(17,19,22,0.98)] border border-border shadow-[0_24px_60px_rgba(0,0,0,0.48)] rounded-none min-[900px]:-mx-6 min-[900px]:px-6 min-[900px]:py-6">
      <div class="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-start">
        <div class="flex flex-wrap gap-3 justify-between items-start">
          <div class="flex flex-nowrap gap-3 items-center min-w-0">
            <Avatar
              glyph={selectedFeedItem.avatar}
              square={selectedFeedItem.sourceType === 'community'}
              size="lg"
              class="bg-gradient-to-br from-accent/[0.24] to-accent/[0.08]"
            />
            <div>
              <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Selected post</p>
              <h3 class="m-0 font-display text-[1.05rem] leading-[1.08]">{selectedFeedItem.title}</h3>
              <div class="flex flex-wrap gap-2 items-center mt-[0.2rem]">
                {#if selectedFeedItem.sourceType === 'community'}
                  <Pill variant="community" class="cursor-pointer">
                    <button class="bg-transparent border-0 p-0 text-inherit font-inherit cursor-pointer" type="button" onclick={() => (communitySheetId = selectedFeedItem.sourceId)}>
                      {selectedFeedItem.sourceLabel}
                    </button>
                  </Pill>
                {:else}
                  <Pill variant="person">{selectedFeedItem.sourceLabel}</Pill>
                {/if}
              </div>
            </div>
          </div>
          <div class="grid gap-2 justify-items-start min-[900px]:justify-items-end min-[900px]:text-right">
            <span class="text-text-muted leading-[1.5] font-mono">{selectedFeedItem.time}</span>
            <Badge variant={selectedFeedItem.secure ? 'secure' : 'warn'}>
              {selectedFeedItem.secure ? 'Encrypted' : 'Open'}
            </Badge>
          </div>
        </div>

        <p class="m-0 text-text leading-[1.7] text-[1.05rem]">{selectedFeedItem.body}</p>
      </div>

      <div class="grid gap-4 pt-2 border-t border-white/[0.06] min-[900px]:grid-cols-[minmax(0,0.95fr)_auto] min-[900px]:items-start">
        <div class="flex flex-wrap justify-between gap-3 items-center w-full">
          <div class="flex flex-wrap gap-2 items-center">
            {#each selectedFeedItem.reactions as reaction}
              <span class="text-text-muted leading-[1.5]">{reaction}</span>
            {/each}
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <button
              class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer"
              type="button"
              disabled={attachmentActionBusy || !selectedFeedItem.topic}
              onclick={() => emitAttachment('notice', 'Seen')}
            >
              Notice
            </button>
            <button
              class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer"
              type="button"
              disabled={attachmentActionBusy || !selectedFeedItem.topic}
              onclick={() => emitAttachment('react', '❤️')}
            >
              React
            </button>
            <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => openReplyComposer(selectedFeedItem)}>Reply</button>
          </div>
        </div>
      </div>
    </article>
  {:else}
    <section class="p-3">
      <div class="flex flex-wrap gap-2 items-center overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Feed filters">
        <button class={`inline-flex min-h-10 px-[0.95rem] rounded-full border border-border bg-white/[0.03] text-text-muted whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer ${feedFilter === 'all' ? 'bg-accent/[0.16] border-accent/30 text-text' : ''}`} type="button" onclick={() => (feedFilter = 'all')}>
          {filterLabels.all}
        </button>
        <button class={`inline-flex min-h-10 px-[0.95rem] rounded-full border border-border bg-white/[0.03] text-text-muted whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer ${feedFilter === 'people' ? 'bg-accent/[0.16] border-accent/30 text-text' : ''}`} type="button" onclick={() => (feedFilter = 'people')}>
          {filterLabels.people}
        </button>
        <button class={`inline-flex min-h-10 px-[0.95rem] rounded-full border border-border bg-white/[0.03] text-text-muted whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer ${feedFilter === 'communities' ? 'bg-accent/[0.16] border-accent/30 text-text' : ''}`} type="button" onclick={() => (feedFilter = 'communities')}>
          {filterLabels.communities}
        </button>
        {#each communities as community}
          <button
            class={`inline-flex min-h-10 px-[0.95rem] rounded-full border border-border bg-white/[0.03] text-text-muted whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer ${feedFilter === `community:${community.id}` ? 'bg-accent/[0.16] border-accent/30 text-text' : ''}`}
            type="button"
            onclick={() => (feedFilter = `community:${community.id}`)}
          >
            {community.tag}
          </button>
        {/each}
      </div>
    </section>

    <section class="grid gap-[0.45rem]">
      {#each filteredFeedItems() as item}
        <article class={`grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl transition-[border-color,box-shadow,transform] duration-[250ms] hover:-translate-y-0.5 hover:border-accent/[0.34] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]
          ${item.sourceType === 'community' ? 'border-accent/30' : ''}
          ${item.id === activeFeedId ? 'border-accent/40 bg-accent/[0.07]' : ''}`}>
          <button class="grid gap-4 w-full p-0 border-0 bg-transparent text-left cursor-pointer" type="button" aria-label={`Open ${item.title}`} onclick={() => openFeedItem(item.id)}>
            <div class="flex flex-wrap gap-3 justify-between items-start w-full">
              <div class="flex flex-nowrap gap-3 items-center min-w-0">
                <Avatar
                  glyph={item.avatar}
                  square={item.sourceType === 'community'}
                  class="bg-gradient-to-br from-accent/[0.24] to-accent/[0.08]"
                />
                <div>
                  <strong>{item.title}</strong>
                  <div class="flex flex-wrap gap-2 items-center mt-[0.2rem]">
                    <Pill variant={item.sourceType === 'community' ? 'community' : 'person'}>
                      {item.sourceLabel}
                    </Pill>
                  </div>
                </div>
              </div>
              <span class="text-text-muted leading-[1.5] font-mono">{item.time}</span>
            </div>

            <p class="m-0 text-text leading-[1.55]">{item.body}</p>
          </button>

          <div class="flex flex-wrap justify-between gap-3 items-center pt-2 border-t border-white/[0.04]">
            <div class="flex flex-wrap gap-2 items-center">
              {#each item.reactions as reaction}
                <span class="text-text-muted leading-[1.5]">{reaction}</span>
              {/each}
              {#if item.secure}
                <span class="text-text-muted leading-[1.5]" aria-label="Encrypted">🔒</span>
              {/if}
            </div>
            <div class="flex flex-wrap gap-2 items-center">
              {#if item.sourceType === 'community'}
                <Pill variant="community" class="cursor-pointer">
                  <button class="bg-transparent border-0 p-0 text-inherit font-inherit cursor-pointer" type="button" onclick={() => (communitySheetId = item.sourceId)}>
                    {item.sourceLabel}
                  </button>
                </Pill>
              {/if}
              <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => openReplyComposer(item)}>Reply</button>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {/if}

  {#if communitySheetId}
    <div class="fixed inset-0 bg-[rgba(6,7,8,0.6)] backdrop-blur-sm z-[11] [animation:fadeIn_0.15s_ease-out]" aria-hidden="true" onclick={closeCommunitySheet}></div>
    <div class="fixed left-0 right-0 bottom-0 z-[12] bg-surface border border-border rounded-t-xl shadow-[0_24px_60px_rgba(0,0,0,0.48)] backdrop-blur-[18px] p-4 grid gap-4 max-h-[80vh] overflow-y-auto min-[900px]:static min-[900px]:rounded-xl min-[900px]:max-h-none" bind:this={communityDialogEl} role="dialog" aria-label="Community details" aria-modal="true" tabindex="-1">
      <div class="flex flex-wrap gap-2 items-center justify-between items-start">
        <div class="flex flex-wrap gap-2 items-center">
          <Avatar glyph={communitySheetTarget().name.slice(0, 1)} square={true} />
          <div>
            <strong>{communitySheetTarget().name}</strong>
            <div class="text-text-muted leading-[1.5] text-sm">{communitySheetTarget().tag}</div>
          </div>
        </div>
        <Badge variant={communitySheetTarget().visibility === 'public' ? 'secure' : 'warn'}>
          {communitySheetTarget().visibility}
        </Badge>
      </div>
      <p>{communitySheetTarget().description}</p>
      <div class="grid gap-2">
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0"><span>Members</span><span>{communitySheetTarget().members}</span></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 max-[540px]:flex-col max-[540px]:items-stretch">
        <button
          class={`inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer max-[540px]:w-full
            ${communitySheetTarget().joined ? 'bg-accent/[0.08] border border-accent/[0.24] text-text shadow-none' : 'bg-accent text-white shadow-[0_10px_28px_rgba(91,75,207,0.22)]'}`}
          type="button"
          onclick={toggleCommunityMembership}
        >
          {communitySheetTarget().joined ? 'Leave community' : 'Join community'}
        </button>
        <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent/[0.08] border border-accent/[0.24] text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer max-[540px]:w-full" type="button" onclick={closeCommunitySheet}>Close</button>
      </div>
    </div>
  {/if}
</section>
