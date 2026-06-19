<script>
  import { initials } from '$lib/social-data.js'
  import Avatar from '$lib/components/Avatar.svelte'

  let {
    contacts,
    identity,
    presence,
    presenceMessage,
    chats,
    security,
    attachmentSummaries,
    rosterActionBusy,
    uploadTargetPeerId = $bindable(),
    uploadResultUrl = $bindable(),
    uploadBusy,
    advancedOpen = $bindable(),
    addRosterContact,
    toggleRosterPresence,
    removeRosterContact,
    openProfileEditor,
    requestUploadSlot,
    peers = []
  } = $props()

  let showAddContact = $state(false)
  let rosterJid = $state('')
  let rosterName = $state('')
  let contactsSearch = $state('')
  let contactsFilter = $state('all')
  let uploadFile = $state(null)

  const profileDisplayName = () => identity.displayName ?? identity.nickname
  const profileNickname = () => identity.nickname ?? identity.displayName
  const nonLocalPeers = () => identity.peers ? identity.peers.filter(p => p.kind !== 'local') : [] // fallback

  const activePeers = () => peers.filter((peer) => peer.kind !== 'local')

  const filteredContacts = () => {
    let result = contacts
    if (contactsFilter === 'online') {
      result = result.filter(c => c.presence && c.presence !== 'offline' && c.presence !== 'unavailable')
    }
    const q = contactsSearch.trim().toLowerCase()
    if (q) {
      result = result.filter(c => 
        (c.name || '').toLowerCase().includes(q) || 
        (c.jid || '').toLowerCase().includes(q)
      )
    }
    return result
  }

  const handleAddContactSubmit = async (event) => {
    event.preventDefault()
    const jid = rosterJid.trim()
    if (!jid) return
    await addRosterContact(jid, rosterName.trim() || undefined)
    rosterJid = ''
    rosterName = ''
  }

  const getStatusColorClass = (status) => {
    if (status === 'available' || status === 'online') return 'bg-positive'
    if (status === 'away') return 'bg-warning'
    if (status === 'busy' || status === 'dnd') return 'bg-[#ff8a8a]'
    return 'bg-text-soft'
  }
</script>

<div class="flex flex-col gap-4 w-full min-[900px]:grid min-[900px]:grid-cols-[1.2fr_1fr] min-[900px]:gap-5 min-[900px]:items-start">
  <!-- Left Column: Friends & Contacts List -->
  <section class="grid gap-[0.45rem]">
    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div class="flex flex-wrap gap-2 items-center justify-between items-start mb-4">
        <div>
          <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Roster</p>
          <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Contacts</h3>
        </div>
        <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => showAddContact = !showAddContact}>
          {showAddContact ? 'Close' : 'Add Contact'}
        </button>
      </div>

      {#if showAddContact}
        <form class="grid gap-3 items-end min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]" onsubmit={handleAddContactSubmit}>
          <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">JID</span>
            <input bind:value={rosterJid} type="text" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" placeholder="maya@chat.mesh" />
          </label>
          <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
            <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Name</span>
            <input bind:value={rosterName} type="text" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" placeholder="Maya" />
          </label>
          <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="submit" disabled={rosterActionBusy || !rosterJid.trim()}>
            Add contact
          </button>
        </form>
      {/if}

      <!-- Search and Filter Bar -->
      <div class="grid gap-2 mb-4">
        <input bind:value={contactsSearch} type="text" class="w-full px-3 py-2 rounded-md border border-border bg-surface-soft focus:outline focus:outline-1 focus:outline-accent focus:border-accent-strong focus:bg-surface-strong" placeholder="Search JID or name..." />
        <div class="flex gap-2 flex-wrap">
          <button class={`inline-flex items-center justify-center border border-border text-text-muted cursor-pointer transition-all font-medium rounded-full min-h-8 px-4 text-[0.8rem] hover:bg-white/[0.08] hover:text-text ${contactsFilter === 'all' ? 'bg-accent/[0.18] border-accent/40 text-accent-text' : ''}`} type="button" onclick={() => (contactsFilter = 'all')}>All</button>
          <button class={`inline-flex items-center justify-center border border-border text-text-muted cursor-pointer transition-all font-medium rounded-full min-h-8 px-4 text-[0.8rem] hover:bg-white/[0.08] hover:text-text ${contactsFilter === 'online' ? 'bg-accent/[0.18] border-accent/40 text-accent-text' : ''}`} type="button" onclick={() => (contactsFilter = 'online')}>Online</button>
        </div>
      </div>

      <div class="grid gap-[0.45rem] max-h-[min(58vh,38rem)] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {#if filteredContacts().length === 0}
          <div class="grid gap-1 py-[0.55rem] px-[0.4rem] border-b border-white/[0.06] bg-transparent shadow-none [backdrop-filter:none] rounded-none text-left last:border-b-0">
            <div>
              <strong>No contacts found</strong>
              <div class="color-text-muted leading-normal">Try adjusting your filter or adding a contact.</div>
            </div>
          </div>
        {:else}
          {#each filteredContacts() as contact}
            <div class="grid gap-[0.45rem] border border-border rounded-md p-[0.7rem] bg-surface-soft transition-[transform,border-color] hover:border-border-strong">
              <div class="flex flex-wrap gap-2 items-center justify-between items-start">
                <div class="flex items-center gap-3 min-w-0 items-center gap-3">
                  <div class="relative inline-block">
                    <Avatar glyph={initials(contact.name)} />
                    <span class={`absolute bottom-[-1px] right-[-1px] rounded-full border-2 border-bg-elevated shadow-[0_0_0_1px_rgba(0,0,0,0.2)] w-[11px] h-[11px] ${getStatusColorClass(contact.presence)}`}></span>
                  </div>
                  <div>
                    <strong>{contact.name}</strong>
                    <div class="text-text-muted leading-[1.5] text-sm">{contact.jid}</div>
                  </div>
                </div>
                <span class="text-[0.75rem] bg-white/[0.06] px-2 py-0.5 rounded text-text-muted">{contact.trust}</span>
              </div>

              <div class="flex flex-wrap gap-2 items-center justify-between items-start pt-2 border-t border-white/[0.04]">
                <div class="flex flex-wrap gap-2 items-center gap-2">
                  <span class="text-[0.72rem] text-text-soft">{contact.subscription}</span>
                  <span class="text-[0.72rem] text-text-soft">{contact.capability}</span>
                </div>
                <div class="flex flex-wrap gap-2 items-center gap-2">
                  <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => toggleRosterPresence(contact)}>
                    {contact.subscription === 'none' || contact.subscription === 'from' ? 'Subscribe' : 'Unsubscribe'}
                  </button>
                  <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full border border-warning/40 text-[#ffd9ae] hover:bg-warning/[0.08] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={() => removeRosterContact(contact)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </article>
  </section>

  <!-- Right Column: Local Profile, Network Map & State -->
  <section class="grid gap-[0.45rem]">
    <!-- My Profile -->
    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div>
        <div class="flex flex-nowrap gap-3 items-center min-w-0">
          <div class="relative inline-block">
            <Avatar glyph={initials(profileDisplayName())} imageUrl={identity.avatarDataUrl} />
            <span class={`absolute bottom-[-1px] right-[-1px] w-[11px] h-[11px] rounded-full border-2 border-bg-elevated shadow-[0_0_0_1px_rgba(0,0,0,0.2)] ${getStatusColorClass(presence)}`}></span>
          </div>
          <div>
            <strong>{profileDisplayName()} (You)</strong>
            <div class="text-text-muted leading-[1.5] text-sm">{identity.jid}</div>
          </div>
        </div>
      </div>

      <div class="grid gap-2 min-[900px]:grid-cols-2 min-[900px]:gap-4">
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Display name</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{identity.displayName ?? identity.nickname}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Nickname</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{profileNickname()}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Status message</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{presenceMessage || 'Online'}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Peer ID</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{identity.peerId.slice(0, 18)}…</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Transport</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{identity.transport}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Connection</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{identity.connection}</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 items-center mt-2">
        <button class="inline-flex items-center justify-center min-h-10 px-[0.9rem] text-[0.88rem] rounded-full bg-transparent border border-border-strong text-text shadow-none transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" onclick={openProfileEditor}>Edit profile</button>
      </div>
    </article>

    <!-- Connection summary -->
    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div>
        <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Connection</p>
        <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Network summary</h3>
      </div>
      <div class="grid gap-2 min-[900px]:grid-cols-2 min-[900px]:gap-4">
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Transport</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{identity.transport}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Peers</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{activePeers().length}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">Rooms</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{chats.filter((chat) => chat.kind === 'muc').length}</span>
        </div>
      </div>
      <button class="flex items-center justify-between w-full mt-2 px-1 py-[0.7rem] border-0 border-t border-border bg-transparent text-accent-text font-semibold text-[0.9rem] hover:text-text cursor-pointer" type="button" onclick={() => (advancedOpen = true)}>
        <span>Advanced — protocol &amp; peer state</span>
        <span aria-hidden="true">&rsaquo;</span>
      </button>
    </article>

    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div>
        <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Security</p>
        <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Crypto state</h3>
      </div>
      <div class="grid gap-2">
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">OMEMO device</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{security.omemoDeviceId}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">OMEMO bundle</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{security.omemoPreKeys} pre-keys</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">OpenPGP fingerprint</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0 font-mono">{security.openPgpFingerprint}</span>
        </div>
        <div class="flex justify-between gap-3 flex-wrap py-[0.55rem] border-b border-white/[0.06] min-w-0">
          <span class="text-text-soft">OpenPGP key</span>
          <span class="text-right text-text [overflow-wrap:anywhere] break-words min-w-0">{security.openPgpKeyAvailable ? 'Loaded' : 'Missing'}</span>
        </div>
      </div>
    </article>

    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div>
        <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Uploads</p>
        <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Send a file</h3>
      </div>
      <p class="text-text-muted leading-[1.5] text-sm">Requests an upload slot from a contact, uploads the file, and returns the content-addressed URL.</p>
      <div class="grid gap-3 items-end min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
          <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">Target contact</span>
          <select bind:value={uploadTargetPeerId} class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text">
            {#each contacts as contact}
              <option value={contact.id}>{contact.name}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap-2 text-text-muted text-[0.9rem] flex-[1_1_100%]">
          <span class="text-text-soft text-[0.76rem] tracking-[0.08em] uppercase">File</span>
          <input type="file" class="w-full border border-border rounded-md px-[0.95rem] py-[0.85rem] bg-white/[0.03] text-text" onchange={(event) => (uploadFile = event.currentTarget.files?.[0] ?? null)} />
        </label>
        <button class="inline-flex items-center justify-center min-h-[2.9rem] rounded-full px-4 bg-accent text-white font-bold shadow-[0_10px_28px_rgba(91,75,207,0.22)] transition-[transform,background-color,border-color,color,box-shadow] duration-[180ms] hover:-translate-y-px cursor-pointer" type="button" disabled={uploadBusy || !uploadFile || !uploadTargetPeerId} onclick={() => requestUploadSlot(uploadFile, uploadTargetPeerId)}>
          {uploadBusy ? 'Uploading...' : 'Upload file'}
        </button>
        {#if uploadResultUrl}
          <div class="mt-2 text-sm">
            <span class="text-text-muted block text-xs uppercase tracking-wide">Uploaded URL</span>
            <a href={uploadResultUrl} target="_blank" rel="noreferrer" class="text-accent-text hover:text-text break-all">{uploadResultUrl}</a>
          </div>
        {/if}
      </div>
    </article>

    <article class="grid gap-[0.45rem] p-[0.7rem] border border-border bg-surface rounded-xl">
      <div>
        <p class="m-0 text-text-soft text-[0.72rem] tracking-[0.16em] uppercase">Attachments</p>
        <h3 class="margin-0 font-display text-[1.05rem] leading-[1.08]">Recent activity</h3>
      </div>
      {#if attachmentSummaries.length === 0}
        <p class="text-text-muted leading-[1.5] text-sm">No attachment activity yet.</p>
      {:else}
        <div class="grid gap-2">
          {#each attachmentSummaries as summary}
            <div class="border-b border-white/[0.06] pb-2 last:border-0 last:pb-0">
              <div class="flex flex-wrap gap-2 items-center justify-between">
                <strong>{summary.topic}</strong>
                <span class="text-text-muted text-xs font-mono">{summary.updatedAt}</span>
              </div>
              <div class="text-text-muted text-xs">Target: {summary.targetId}</div>
              <div class="text-text-muted text-xs">Total: {summary.total} · Notices: {summary.noticed} · Reactions: {summary.reactions}</div>
            </div>
          {/each}
        </div>
      {/if}
    </article>
  </section>
</div>
