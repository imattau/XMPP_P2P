import * as React from 'react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  X, Hash, Users, Globe, Lock, Image, Smile,
  Mic, ChevronDown, Zap, Shield, AtSign,
  AlertCircle, Plus, Upload, ImagePlus,
} from 'lucide-react'

type PostType = 'post' | 'topic' | 'community'
type Privacy = 'public' | 'followers' | 'community'

const TOPICS = ['DecentralWeb', 'XMPPProtocol', 'Privacy', 'OpenSource', 'FediDev', 'SelfHosted', 'WebDev', 'Infosec']
const COMMUNITIES = [
  { name: 'OpenSourceDev', icon: '⚙️' },
  { name: 'WeeklyDevChat', icon: '💬' },
  { name: 'FediDev', icon: '🌐' },
  { name: 'Infra Team', icon: '🔧' },
]

const PRIVACY_OPTIONS: { id: Privacy; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }[] = [
  { id: 'public', label: 'Public', icon: Globe, description: 'Visible to everyone on the fediverse' },
  { id: 'followers', label: 'Followers only', icon: Lock, description: 'Only your followers can see this' },
  { id: 'community', label: 'Community', icon: Users, description: 'Shared only within the selected community' },
]

const MAX_CHARS = 500
const MAX_IMAGES = 4

const EMOJI_CATEGORIES: { id: string; label: string; icon: string; emojis: string[] }[] = [
  { id: 'recent', label: 'Recent', icon: '🕐', emojis: ['👍', '❤️', '😂', '🔥', '✅', '🚀', '👀', '💯', '🙏', '😎', '🤔', '⚡'] },
  { id: 'smileys', label: 'Smileys', icon: '😀', emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘', '😗', '🙂', '🤗', '🤩', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤫', '🤔', '🤭', '🫢', '😶', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
  { id: 'gestures', label: 'Gestures', icon: '👋', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '🤙', '💪', '🦾', '🖕', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🙏', '✍️', '💅', '🤳', '💃', '🕺'] },
  { id: 'people', label: 'People', icon: '👤', emojis: ['👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🧕', '👮', '🕵️', '💂', '🥷', '👷', '🫅', '🤴', '👸', '👳', '👲', '🧙', '🧝', '🧛', '🧟', '🧞', '🧜', '🧚', '👼', '🤶', '🎅', '🦸', '🦹'] },
  { id: 'nature', label: 'Nature', icon: '🌿', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🌿', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '⭐', '🔥', '🌈', '☁️', '⛅', '❄️', '🌊'] },
  { id: 'food', label: 'Food', icon: '🍕', emojis: ['🍕', '🍔', '🌮', '🌯', '🥗', '🍜', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍛', '🍝', '🍠', '🥘', '🍲', '🥫', '🧆', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🥪', '🧀', '🥨', '🥐', '🍞', '🥖', '🫓', '🍰', '🎂', '🧁', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '☕', '🍵', '🧃', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹'] },
  { id: 'travel', label: 'Travel', icon: '✈️', emojis: ['🚀', '✈️', '🛸', '🚁', '🛺', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🛻', '🚚', '🚛', '🚜', '🏎', '🏍', '🛵', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣', '🛤', '⛽', '🚨', '🚥', '🚦', '🛑', '⚓', '🚢', '🛳', '⛴', '🛥', '🚤', '🏊', '🏄', '🌍', '🗺', '🧭', '🏔', '⛰', '🌋', '🗻', '🏕', '🏖', '🏜', '🏝'] },
  { id: 'objects', label: 'Objects', icon: '💡', emojis: ['💡', '🔦', '🕯', '🪔', '💻', '🖥', '🖨', '⌨️', '🖱', '🖲', '💽', '💾', '💿', '📀', '📱', '☎️', '📞', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '🧭', '⏱', '⏰', '⌚', '📡', '🔋', '🪫', '🔌', '💡', '🔦', '🕯', '🗑', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '🪙', '💎', '⚖️', '🧲', '🔧', '🪛', '🔩', '⚙️', '🗜', '🔗', '⛓', '🪝', '🔪', '🗡', '⚔️', '🛡', '🪃', '🏹', '🔑', '🗝', '🔐', '🔒', '🔓'] },
  { id: 'symbols', label: 'Symbols', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💬', '💭', '💤', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '✅', '❌', '⭕', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔷', '🔶', '🔹', '🔸', '▶️', '⏩', '⏪', '⏫', '⏬', '⏭', '⏮', '🔀', '🔁', '🔂', '▶️', '⏸', '⏹', '⏺', '🎦', '🔅', '🔆', '📶', '📳', '📴', '📵', '📳'] },
]

const GALLERY_PHOTOS = [
  { id: 'g1', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop&auto=format', alt: 'Circuit board' },
  { id: 'g2', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=200&h=200&fit=crop&auto=format', alt: 'Server rack' },
  { id: 'g3', url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=200&h=200&fit=crop&auto=format', alt: 'Office workspace' },
  { id: 'g4', url: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&h=200&fit=crop&auto=format', alt: 'Code on monitor' },
  { id: 'g5', url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=200&h=200&fit=crop&auto=format', alt: 'Developer at laptop' },
  { id: 'g6', url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&h=200&fit=crop&auto=format', alt: 'Matrix digital rain' },
  { id: 'g7', url: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=200&h=200&fit=crop&auto=format', alt: 'Laptop on desk' },
  { id: 'g8', url: 'https://images.unsplash.com/photo-1509395176047-4a66953fd231?w=200&h=200&fit=crop&auto=format', alt: 'Network cables' },
  { id: 'g9', url: 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=200&h=200&fit=crop&auto=format', alt: 'Data center' },
  { id: 'g10', url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=200&h=200&fit=crop&auto=format', alt: 'Network switch' },
  { id: 'g11', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop&auto=format', alt: 'Microchip' },
  { id: 'g12', url: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=200&h=200&fit=crop&auto=format', alt: 'Code terminal' },
]

export default function ComposePage() {
  const navigate = useNavigate()
  const [postType, setPostType] = useState<PostType>('post')
  const [content, setContent] = useState('')
  const [privacy, setPrivacy] = useState<Privacy>('public')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [selectedCommunity, setSelectedCommunity] = useState('')
  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [showCommunityPicker, setShowCommunityPicker] = useState(false)
  const [showPrivacyPicker, setShowPrivacyPicker] = useState(false)
  const [topicSearch, setTopicSearch] = useState('')
  const [topics, setTopics] = useState(TOPICS)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [newTopicTag, setNewTopicTag] = useState('')
  const [newTopicDesc, setNewTopicDesc] = useState('')
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('recent')
  const [emojiSearch, setEmojiSearch] = useState('')
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [selectedImages, setSelectedImages] = useState<{ id: string; url: string; alt: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleImage = (photo: { id: string; url: string; alt: string }) => {
    setSelectedImages((prev) => {
      if (prev.find((p) => p.id === photo.id)) return prev.filter((p) => p.id !== photo.id)
      if (prev.length >= MAX_IMAGES) return prev
      return [...prev, photo]
    })
  }

  const remaining = MAX_CHARS - content.length
  const overLimit = remaining < 0
  const nearLimit = remaining <= 50 && !overLimit
  const canPost = content.trim().length > 0 && !overLimit
    && (postType !== 'topic' || selectedTopic)
    && (postType !== 'community' || selectedCommunity)

  const PrivacyIcon = PRIVACY_OPTIONS.find((p) => p.id === privacy)?.icon || Globe

  const POST_TYPES: { id: PostType; label: string; desc: string }[] = [
    { id: 'post', label: 'Post', desc: 'Share to your followers' },
    { id: 'topic', label: 'Topic post', desc: 'Post in a topic channel' },
    { id: 'community', label: 'Community', desc: 'Post to a community' },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="font-semibold text-sm">New post</span>
        </div>
        <button
          disabled={!canPost}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            canPost ? 'bg-primary text-white hover:bg-primary/90' : 'bg-primary/20 text-primary/40 cursor-not-allowed'
          }`}
        >
          Post
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 border-b border-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Post type</p>
          <div className="flex gap-2">
            {POST_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setPostType(t.id)}
                className={`flex-1 px-2 py-2 rounded-lg text-[11px] font-medium border transition-all text-center ${
                  postType === t.id
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {postType === 'topic' && (
          <div className="px-4 py-3 border-b border-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Topic</p>
            <button
              onClick={() => { setShowTopicPicker((v) => !v); setShowCommunityPicker(false); setShowPrivacyPicker(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                selectedTopic ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-border bg-secondary text-muted-foreground hover:border-foreground/20'
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Hash size={14} style={selectedTopic ? { color: '#3b82f6' } : {}} />
                {selectedTopic || 'Select a topic'}
              </span>
              <ChevronDown size={14} className={`transition-transform ${showTopicPicker ? 'rotate-180' : ''}`} />
            </button>

            {showTopicPicker && (
              <div className="mt-2 rounded-lg border border-border bg-popover overflow-hidden">
                {!showCreateTopic ? (
                  <>
                    <div className="p-2 border-b border-border">
                      <input
                        autoFocus
                        value={topicSearch}
                        onChange={(e) => setTopicSearch(e.target.value)}
                        placeholder="Search topics…"
                        className="w-full bg-secondary rounded px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {topics.filter((t) => t.toLowerCase().includes(topicSearch.toLowerCase())).map((t) => (
                        <button
                          key={t}
                          onClick={() => { setSelectedTopic(t); setShowTopicPicker(false); setTopicSearch(''); setShowCreateTopic(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-secondary border-b border-border last:border-0 ${selectedTopic === t ? 'text-primary' : 'text-foreground/80'}`}
                        >
                          <Hash size={13} className={selectedTopic === t ? 'text-primary' : 'text-muted-foreground'} />#{t}
                        </button>
                      ))}
                      {topics.filter((t) => t.toLowerCase().includes(topicSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-[12px] text-muted-foreground">No topics match "{topicSearch}"</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowCreateTopic(true); setNewTopicTag(topicSearch); setTopicSearch(''); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors border-t border-border"
                    >
                      <Plus size={14} />
                      Create new topic
                    </button>
                  </>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">New topic</span>
                      <button
                        onClick={() => { setShowCreateTopic(false); setNewTopicTag(''); setNewTopicDesc(''); }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="mb-2.5">
                      <div className="flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-colors">
                        <span className="pl-3 text-primary font-mono text-sm font-medium">#</span>
                        <input
                          autoFocus
                          value={newTopicTag}
                          onChange={(e) => setNewTopicTag(e.target.value.replace(/\s+/g, '').replace(/^#+/, ''))}
                          placeholder="TopicName"
                          className="flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none"
                        />
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground mt-1">No spaces - use CamelCase or hyphens</p>
                    </div>
                    <div className="mb-3">
                      <input
                        value={newTopicDesc}
                        onChange={(e) => setNewTopicDesc(e.target.value)}
                        placeholder="Short description (optional)"
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <button
                      disabled={!newTopicTag.trim()}
                      onClick={() => {
                        const tag = newTopicTag.trim()
                        if (!tag) return
                        setTopics((prev) => prev.includes(tag) ? prev : [...prev, tag])
                        setSelectedTopic(tag)
                        setShowTopicPicker(false)
                        setShowCreateTopic(false)
                        setNewTopicTag('')
                        setNewTopicDesc('')
                      }}
                      className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${newTopicTag.trim() ? 'bg-primary text-white hover:bg-primary/90' : 'bg-primary/20 text-primary/40 cursor-not-allowed'}`}
                    >
                      Create #{newTopicTag || '…'} and select
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {postType === 'community' && (
          <div className="px-4 py-3 border-b border-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Community</p>
            <button
              onClick={() => { setShowCommunityPicker((v) => !v); setShowTopicPicker(false); setShowPrivacyPicker(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                selectedCommunity ? 'border-amber-500/40 bg-amber-500/5 text-foreground' : 'border-border bg-secondary text-muted-foreground hover:border-foreground/20'
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                {selectedCommunity
                  ? <>{COMMUNITIES.find((c) => c.name === selectedCommunity)?.icon} {selectedCommunity}</>
                  : <><Users size={14} /> Select a community</>
                }
              </span>
              <ChevronDown size={14} className={`transition-transform ${showCommunityPicker ? 'rotate-180' : ''}`} />
            </button>

            {showCommunityPicker && (
              <div className="mt-2 rounded-lg border border-border bg-popover overflow-hidden">
                {COMMUNITIES.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => { setSelectedCommunity(c.name); setShowCommunityPicker(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-secondary border-b border-border last:border-0 ${selectedCommunity === c.name ? 'text-amber-400' : 'text-foreground/80'}`}
                  >
                    <span>{c.icon}</span>{c.name}
                  </button>
                ))}
                <button
                  onClick={() => { setShowCommunityPicker(false); navigate('/communities/new'); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors border-t border-border"
                >
                  <Plus size={14} />
                  Create new community
                </button>
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-secondary border border-border overflow-hidden">
                <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=48&h=48&fit=crop&auto=format" alt="You" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm font-semibold text-foreground">You</span>
                <Shield size={11} className="text-primary" />
                <span className="font-mono text-[10px] text-muted-foreground">@you@jabber.de</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  postType === 'topic' && selectedTopic
                    ? `What's happening in #${selectedTopic}?`
                    : postType === 'community' && selectedCommunity
                    ? `Post to ${selectedCommunity}…`
                    : "What's on your mind?"
                }
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed min-h-[120px]"
              />
            </div>
          </div>

          {content.length > 0 && (
            <div className={`flex items-center justify-end gap-1.5 mt-2 ${overLimit ? 'text-destructive' : nearLimit ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {overLimit && <AlertCircle size={12} />}
              <span className="font-mono text-[11px]">{remaining}</span>
            </div>
          )}
        </div>

        {showMentionPicker && (
          <div className="border-t border-border bg-background flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-2.5 py-1.5">
                <AtSign size={13} className="text-primary flex-shrink-0" />
                <input
                  autoFocus
                  value={mentionSearch}
                  onChange={(e) => setMentionSearch(e.target.value)}
                  placeholder="Search people to mention…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {mentionSearch && (
                  <button onClick={() => setMentionSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={() => { setShowMentionPicker(false); setMentionSearch(''); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="overflow-y-auto max-h-52">
              {(() => {
                const CONTACTS = [
                  { handle: 'maren@social.coop', name: 'Maren Holdt', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, online: true },
                  { handle: 'felixb@chaos.social', name: 'Felix Bergström', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', online: false },
                  { handle: 'ingridl@sigmoid.social', name: 'Ingrid Larsen', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', online: true },
                  { handle: 'kvold@fosstodon.org', name: 'Kaspar Vold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, online: false },
                  { handle: 'theo_n@hachyderm.io', name: 'Theo Nakashima', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', online: true },
                  { handle: 'yukitan@infosec.exchange', name: 'Yuki Tanaka', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', online: false },
                  { handle: 'elif_dev@mastodon.social', name: 'Elif Şahin', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', online: true },
                  { handle: 'amara_d@blacktwitter.io', name: 'Amara Diallo', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=48&h=48&fit=crop&auto=format', online: false },
                ]
                const q = mentionSearch.toLowerCase()
                const filtered = q
                  ? CONTACTS.filter((c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q))
                  : CONTACTS

                if (filtered.length === 0) {
                  return <div className="py-8 text-center text-sm text-muted-foreground">No users found</div>
                }

                return filtered.map((c) => (
                  <button
                    key={c.handle}
                    onClick={() => {
                      const mention = `@${c.handle} `
                      setContent((prev) => (prev.endsWith(' ') || prev === '' ? prev + mention : prev + ' ' + mention))
                      setShowMentionPicker(false)
                      setMentionSearch('')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-left border-b border-border last:border-0"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary border border-border">
                        <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                      </div>
                      <span className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${c.online ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                        {c.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground block truncate">@{c.handle}</span>
                    </div>
                    <AtSign size={13} className="text-muted-foreground/40 flex-shrink-0" />
                  </button>
                ))
              })()}
            </div>
          </div>
        )}

        {showEmojiPicker && (
          <div className="border-t border-border bg-background flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-2.5 py-1.5">
                <span className="text-[13px]">🔍</span>
                <input
                  value={emojiSearch}
                  onChange={(e) => {
                    setEmojiSearch(e.target.value)
                    if (e.target.value) setEmojiCategory('')
                  }}
                  placeholder="Search emoji…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {emojiSearch && (
                  <button onClick={() => { setEmojiSearch(''); setEmojiCategory('recent') }} className="text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={() => { setShowEmojiPicker(false); setEmojiSearch(''); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            {!emojiSearch && (
              <div className="flex overflow-x-auto border-b border-border" style={{ scrollbarWidth: 'none' }}>
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setEmojiCategory(cat.id)}
                    className={`flex-shrink-0 px-3 py-2 text-base transition-colors relative ${emojiCategory === cat.id ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
                    title={cat.label}
                  >
                    {cat.icon}
                    {emojiCategory === cat.id && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-primary rounded-t-full" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="overflow-y-auto max-h-44 px-1 py-1">
              {(() => {
                const emojis = emojiSearch
                  ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e, i, arr) => arr.indexOf(e) === i)
                  : (EMOJI_CATEGORIES.find((c) => c.id === emojiCategory)?.emojis ?? [])

                return (
                  <div className="grid grid-cols-9 gap-0">
                    {emojis.map((emoji, i) => (
                      <button
                        key={`${emoji}-${i}`}
                        onClick={() => setContent((prev) => prev + emoji)}
                        className="text-xl p-1.5 rounded hover:bg-secondary transition-colors leading-none aspect-square flex items-center justify-center"
                      >
                        {emoji}
                      </button>
                    ))}
                    {emojis.length === 0 && (
                      <div className="col-span-9 py-6 text-center text-sm text-muted-foreground">No results</div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {showImagePicker && (
          <div className="border-t border-border bg-background flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Select photos</span>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${selectedImages.length >= MAX_IMAGES ? 'bg-amber-500/10 text-amber-400' : 'bg-secondary text-muted-foreground'}`}>
                  {selectedImages.length}/{MAX_IMAGES}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                >
                  <Upload size={12} />
                  Upload
                </button>
                <button
                  onClick={() => setShowImagePicker(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                files.slice(0, MAX_IMAGES - selectedImages.length).forEach((file, i) => {
                  const url = URL.createObjectURL(file)
                  toggleImage({ id: `upload-${Date.now()}-${i}`, url, alt: file.name })
                })
                e.target.value = ''
              }}
            />

            <div className="grid grid-cols-4 gap-0.5 p-0.5 max-h-52 overflow-y-auto">
              {GALLERY_PHOTOS.map((photo) => {
                const isSelected = !!selectedImages.find((s) => s.id === photo.id)
                const isDisabled = !isSelected && selectedImages.length >= MAX_IMAGES
                return (
                  <button
                    key={photo.id}
                    onClick={() => !isDisabled && toggleImage(photo)}
                    className={`relative aspect-square overflow-hidden rounded transition-all ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:ring-2 hover:ring-primary/60'} ${isSelected ? 'ring-2 ring-primary' : ''}`}
                  >
                    <img src={photo.url} alt={photo.alt} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-end justify-end p-1">
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">
                            {selectedImages.findIndex((s) => s.id === photo.id) + 1}
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedImages.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border flex justify-end">
                <button
                  onClick={() => setShowImagePicker(false)}
                  className="px-4 py-1.5 bg-primary text-white rounded-lg text-[12px] font-semibold hover:bg-primary/90 transition-colors"
                >
                  Done · {selectedImages.length} photo{selectedImages.length > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        {selectedImages.length > 0 && !showImagePicker && (
          <div className="px-4 py-2.5 border-t border-border flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {selectedImages.map((img, i) => (
              <div key={img.id} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-secondary group">
                <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                <button
                  onClick={() => setSelectedImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} className="text-foreground" />
                </button>
                <span className="absolute bottom-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold">{i + 1}</span>
              </div>
            ))}
            <button
              onClick={() => setShowImagePicker(true)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${selectedImages.length >= MAX_IMAGES ? 'border-border/30 opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/50 cursor-pointer'}`}
            >
              <ImagePlus size={16} className="text-muted-foreground" />
              <span className="font-mono text-[9px] text-muted-foreground">{MAX_IMAGES - selectedImages.length} left</span>
            </button>
          </div>
        )}

        <div className="px-4 pb-4 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setShowImagePicker((v) => !v); setShowEmojiPicker(false); setShowMentionPicker(false); setShowTopicPicker(false); setShowCommunityPicker(false); setShowPrivacyPicker(false); }}
                className={`p-2 rounded-lg transition-colors ${showImagePicker || selectedImages.length > 0 ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
              >
                <Image size={18} />
              </button>
              <button
                onClick={() => { setShowMentionPicker((v) => !v); setShowImagePicker(false); setShowEmojiPicker(false); setShowTopicPicker(false); setShowCommunityPicker(false); setShowPrivacyPicker(false); }}
                className={`p-2 rounded-lg transition-colors ${showMentionPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
              >
                <AtSign size={18} />
              </button>
              <button
                onClick={() => { setShowEmojiPicker((v) => !v); setShowMentionPicker(false); setShowImagePicker(false); setShowTopicPicker(false); setShowCommunityPicker(false); setShowPrivacyPicker(false); }}
                className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
              >
                <Smile size={18} />
              </button>
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <Mic size={18} />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => { setShowPrivacyPicker((v) => !v); setShowTopicPicker(false); setShowCommunityPicker(false); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors text-[11px] font-mono"
              >
                <PrivacyIcon size={12} />
                {PRIVACY_OPTIONS.find((p) => p.id === privacy)?.label}
                <ChevronDown size={11} className={`transition-transform ${showPrivacyPicker ? 'rotate-180' : ''}`} />
              </button>

              {showPrivacyPicker && (
                <div className="absolute bottom-full right-0 mb-1 w-56 rounded-lg border border-border bg-popover overflow-hidden shadow-xl z-10">
                  {PRIVACY_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.id}
                        onClick={() => { setPrivacy(opt.id); setShowPrivacyPicker(false); }}
                        className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary ${privacy === opt.id ? 'text-primary' : 'text-foreground/80'}`}
                      >
                        <Icon size={14} className={`mt-0.5 flex-shrink-0 ${privacy === opt.id ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-[12px] font-medium leading-tight">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{opt.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {postType !== 'post' && !selectedTopic && !selectedCommunity && (
          <div className="mx-4 mb-4 flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-amber-400">
              {postType === 'topic' ? 'Select a topic to post in' : 'Select a community to post to'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
