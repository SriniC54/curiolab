import React, { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../../contexts/AuthContext'

/**
 * /review/[id] — review screen for a single content_item.
 *
 * This is the decision point in the creator flow. After /create runs the
 * orchestrator and persists a content_items row, the creator lands here to:
 *   1. Read the final (post-revision) content.
 *   2. Read the validator's conversational summary.
 *   3. Pick what to do with it: Regenerate, Save to library, Assign,
 *      Publish public, or Discard.
 *
 * Each action maps to a backend transition:
 *   Regenerate          -> new content_item via POST /creator/content/generate
 *   Save to library     -> PUT status='validated'   (then -> /library, 404 until #14)
 *   Assign to students  -> PUT status='validated'   (then -> /teacher-dashboard)
 *   Publish public      -> PUT visibility='public'  (stays on page, banner)
 *   Discard             -> DELETE (soft, via deleted_at tombstone)
 *
 * The page hits GET /creator/content/{id} on mount so hard refresh works
 * and bookmarks resolve correctly. Backend 404s on cross-creator access,
 * so this page never leaks the existence of other creators' items.
 */

type ValidatorDimension = { verdict: 'pass' | 'concern'; notes: string }

type ContentItem = {
  id: number
  creator_id: number
  topic: string
  skill_level: string
  draft_content: string
  final_content: string
  validator_feedback: {
    dimensions: Record<string, ValidatorDimension>
    summary: string
    needs_revision: boolean
  } | null
  iteration_count: number
  status: string
  visibility: string
  created_at: string
  updated_at: string
}

type PageState = 'loading' | 'ready' | 'not_found' | 'error'

export default function ReviewPage() {
  const { user, token, isAuthenticated, isLoading, role, logout } = useAuth()
  const router = useRouter()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const id = router.query.id as string | undefined

  const [pageState, setPageState] = useState<PageState>('loading')
  const [item, setItem] = useState<ContentItem | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Action-in-flight flag so we can disable buttons during a PUT/DELETE.
  const [actionPending, setActionPending] = useState(false)
  const [actionFeedback, setActionFeedback] = useState('')

  // Modal state for the irreversible-feeling actions.
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)

  // --- Auth guard (creator-only).
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'creator')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  // --- Fetch the item once auth is ready and we have an id from the URL.
  const fetchItem = useCallback(async () => {
    if (!token || !id) return
    setPageState('loading')
    setErrorMessage('')
    try {
      const res = await fetch(`${API_URL}/creator/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) {
        setPageState('not_found')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as ContentItem
      setItem(data)
      setPageState('ready')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not load this draft.')
      setPageState('error')
    }
  }, [API_URL, token, id])

  useEffect(() => {
    if (isAuthenticated && role === 'creator' && id) fetchItem()
  }, [isAuthenticated, role, id, fetchItem])

  // --- Action handlers.

  const updateItem = async (patch: { status?: string; visibility?: string }) => {
    if (!item || !token) return null
    setActionPending(true)
    try {
      const res = await fetch(`${API_URL}/creator/content/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Update failed (HTTP ${res.status})`)
      }
      // Optimistic local update so the UI doesn't need a re-fetch round-trip.
      setItem(prev =>
        prev
          ? {
              ...prev,
              status: patch.status ?? prev.status,
              visibility: patch.visibility ?? prev.visibility,
            }
          : prev,
      )
      return true
    } catch (err: any) {
      setActionFeedback(err?.message || 'Something went wrong. Please try again.')
      return null
    } finally {
      setActionPending(false)
    }
  }

  const handleSaveToLibrary = async () => {
    const ok = await updateItem({ status: 'validated' })
    if (ok) router.push('/library')
  }

  const handleAssign = async () => {
    const ok = await updateItem({ status: 'validated' })
    if (ok) router.push('/teacher-dashboard')
  }

  const handlePublishConfirm = async () => {
    setShowPublishModal(false)
    const ok = await updateItem({ visibility: 'public' })
    if (ok) setActionFeedback('This article is now public.')
  }

  const handleUnpublish = async () => {
    const ok = await updateItem({ visibility: 'private' })
    if (ok) setActionFeedback('This article is private again.')
  }

  const handleDiscardConfirm = async () => {
    if (!item || !token) return
    setShowDiscardModal(false)
    setActionPending(true)
    try {
      const res = await fetch(`${API_URL}/creator/content/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Discard failed (HTTP ${res.status})`)
      }
      router.push('/create')
    } catch (err: any) {
      setActionFeedback(err?.message || 'Could not discard.')
      setActionPending(false)
    }
  }

  const handleRegenerateConfirm = async () => {
    setShowRegenerateModal(false)
    if (!item || !token) return
    // Fire a fresh generate using this row's topic + skill_level. We do NOT
    // touch the current row's status — it stays as a draft in the library.
    setActionPending(true)
    setActionFeedback('Generating a new version...')
    try {
      const res = await fetch(`${API_URL}/creator/content/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: item.topic, skill_level: item.skill_level }),
      })
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}))
        const detail = body.detail || {}
        setActionFeedback(detail.message || 'Daily generation limit reached.')
        setActionPending(false)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Regenerate failed (HTTP ${res.status})`)
      }
      const data = await res.json()
      router.push(`/review/${data.content_item_id}`)
    } catch (err: any) {
      setActionFeedback(err?.message || 'Could not regenerate.')
      setActionPending(false)
    }
  }

  // --- Auth still loading.
  if (isLoading || !isAuthenticated || role !== 'creator') {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  // --- Page-level loading / not-found / error states.
  if (pageState === 'loading') return <PageShell><LoadingSkeleton /></PageShell>
  if (pageState === 'not_found') return <PageShell><NotFound /></PageShell>
  if (pageState === 'error' || !item) return <PageShell><ErrorPanel message={errorMessage} onRetry={fetchItem} /></PageShell>

  const isPublic = item.visibility === 'public'

  return (
    <PageShell userLabel={user?.name || user?.email} onSignOut={logout}>

      <Head>
        <title>Review: {item.topic} — CurioLab</title>
      </Head>

      {/* Validator note — top of page so it informs the read */}
      {item.validator_feedback && (
        <ValidatorNote
          summary={item.validator_feedback.summary}
          needsRevision={item.validator_feedback.needs_revision}
        />
      )}

      {/* Meta line */}
      <div className="text-sm text-gray-500 mb-2 flex flex-wrap gap-x-3 gap-y-1">
        <span className="font-semibold text-gray-700">{item.topic}</span>
        <span>·</span>
        <span>{item.skill_level}</span>
        <span>·</span>
        <span>{formatTimeAgo(item.created_at)}</span>
        {isPublic && (
          <>
            <span>·</span>
            <span className="text-green-700 font-semibold">Public</span>
          </>
        )}
        {item.status === 'validated' && (
          <>
            <span>·</span>
            <span className="text-indigo-700 font-semibold">Saved</span>
          </>
        )}
      </div>

      {/* Article body */}
      <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10 mb-8 prose-spacing">
        <MarkdownContent markdown={item.final_content} />
      </article>

      {/* Action feedback banner (toast-like, inline) */}
      {actionFeedback && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-sm">
          {actionFeedback}
        </div>
      )}

      {/* Action bar */}
      <ActionBar
        isPublic={isPublic}
        actionPending={actionPending}
        onRegenerate={() => setShowRegenerateModal(true)}
        onSave={handleSaveToLibrary}
        onAssign={handleAssign}
        onPublish={() => setShowPublishModal(true)}
        onUnpublish={handleUnpublish}
        onDiscard={() => setShowDiscardModal(true)}
      />

      {/* Modals */}
      {showRegenerateModal && (
        <ConfirmModal
          title="Generate a new version?"
          body={`This will run a fresh generate-and-review pass on "${item.topic}" at ${item.skill_level} level. Uses 1 of your daily generations. This current draft stays in your library.`}
          confirmLabel="Generate new version"
          onConfirm={handleRegenerateConfirm}
          onCancel={() => setShowRegenerateModal(false)}
        />
      )}
      {showPublishModal && (
        <ConfirmModal
          title="Make this article public?"
          body="Other creators will be able to discover and reuse this article. You can change this back to private later."
          confirmLabel="Publish public"
          onConfirm={handlePublishConfirm}
          onCancel={() => setShowPublishModal(false)}
        />
      )}
      {showDiscardModal && (
        <ConfirmModal
          title="Discard this draft?"
          body="This draft will be removed from your library. You can re-generate the topic anytime."
          confirmLabel="Discard"
          confirmStyle="danger"
          onConfirm={handleDiscardConfirm}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}

    </PageShell>
  )
}


// ----------------------------------------------------------------------
// PageShell — nav + container. Kept lightweight so the page-level
// states (loading, not_found, error) can use the same chrome.
// ----------------------------------------------------------------------

function PageShell(props: {
  children: React.ReactNode
  userLabel?: string
  onSignOut?: () => void
}) {
  return (
    <div className="min-h-screen bg-[#f8f7ff]">
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/create" className="text-xl font-black text-indigo-700">🦉 CurioLab</a>
            <div className="flex items-center space-x-3">
              {props.userLabel && (
                <span className="text-sm text-gray-500 hidden sm:block">{props.userLabel}</span>
              )}
              <a href="/teacher-dashboard" className="px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-50 rounded transition-colors font-semibold">
                Dashboard
              </a>
              {props.onSignOut && (
                <button onClick={props.onSignOut} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-32 sm:pb-12">
        {props.children}
      </main>
    </div>
  )
}


// ----------------------------------------------------------------------
// ValidatorNote — the conversational editorial note callout.
// Renders differently when the validator passed cleanly vs. has concerns.
// ----------------------------------------------------------------------

function ValidatorNote(props: { summary: string; needsRevision: boolean }) {
  const hasConcerns = props.needsRevision
  const colors = hasConcerns
    ? { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-700' }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-700' }
  return (
    <div className={`mb-6 p-4 sm:p-5 ${colors.bg} ${colors.border} border rounded-xl`}>
      <div className={`text-xs font-bold uppercase tracking-wider ${colors.accent} mb-2`}>
        Review note
      </div>
      <p className="text-gray-800 leading-relaxed text-sm sm:text-base">
        {props.summary}
      </p>
    </div>
  )
}


// ----------------------------------------------------------------------
// MarkdownContent — render the generator's markdown shape.
//
// The generator produces:
//   - An intro paragraph at the top (no heading).
//   - 6-8 sections, each starting with `## EMOJI Heading` followed by 2-3
//     paragraphs.
//   - A closing paragraph.
// We don't need a full markdown parser — splitting on blank lines and
// detecting heading lines covers it. **Bold** is parsed inline because the
// generator occasionally bolds emphasis words.
// ----------------------------------------------------------------------

function MarkdownContent(props: { markdown: string }) {
  // Split into "blocks" on blank-line boundaries (the generator's natural
  // paragraph separator). Trim trailing whitespace; keep each block intact.
  const blocks = props.markdown
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean)

  return (
    <div className="text-gray-800 leading-relaxed text-base sm:text-lg space-y-5">
      {blocks.map((block, i) => {
        // Heading: `## ...` or `**...**` (the generator uses both styles).
        const headingMatch = block.match(/^##\s+(.*)$/m) || block.match(/^\*\*(.+?)\*\*$/)
        if (headingMatch) {
          return (
            <h2 key={i} className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-8 first:mt-0">
              {renderInline(headingMatch[1])}
            </h2>
          )
        }
        return (
          <p key={i} className="text-gray-800">
            {renderInline(block)}
          </p>
        )
      })}
    </div>
  )
}

/** Inline parser — handles **bold** and *italics*. Plain text otherwise. */
function renderInline(text: string): React.ReactNode {
  // Split on **bold** AND *italic* markers while keeping them.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })
}


// ----------------------------------------------------------------------
// ActionBar — the 5 buttons. Sticky bottom bar on mobile.
// ----------------------------------------------------------------------

function ActionBar(props: {
  isPublic: boolean
  actionPending: boolean
  onRegenerate: () => void
  onSave: () => void
  onAssign: () => void
  onPublish: () => void
  onUnpublish: () => void
  onDiscard: () => void
}) {
  const { isPublic, actionPending } = props
  const disabled = actionPending

  return (
    <div className="fixed sm:static bottom-0 left-0 right-0 bg-white sm:bg-transparent border-t sm:border-t-0 border-gray-200 sm:border-none p-4 sm:p-0 shadow-lg sm:shadow-none">
      <div className="max-w-4xl mx-auto flex flex-wrap gap-2 sm:gap-3">

        {/* Primary "keep" actions */}
        <button
          onClick={props.onSave}
          disabled={disabled}
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save to library
        </button>
        <button
          onClick={props.onAssign}
          disabled={disabled}
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Assign to students
        </button>
        {isPublic ? (
          <button
            onClick={props.onUnpublish}
            disabled={disabled}
            className="flex-1 sm:flex-none px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg font-bold hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Unpublish
          </button>
        ) : (
          <button
            onClick={props.onPublish}
            disabled={disabled}
            className="flex-1 sm:flex-none px-4 py-2 bg-white border border-indigo-300 text-indigo-700 rounded-lg font-bold hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Publish public
          </button>
        )}

        {/* Secondary "redo / drop" actions */}
        <button
          onClick={props.onRegenerate}
          disabled={disabled}
          className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Regenerate
        </button>
        <button
          onClick={props.onDiscard}
          disabled={disabled}
          className="flex-1 sm:flex-none px-4 py-2 bg-white border border-rose-300 text-rose-700 rounded-lg font-semibold hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Discard
        </button>

      </div>
    </div>
  )
}


// ----------------------------------------------------------------------
// ConfirmModal — generic confirm for Regenerate / Publish / Discard.
// ----------------------------------------------------------------------

function ConfirmModal(props: {
  title: string
  body: string
  confirmLabel: string
  confirmStyle?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmClass =
    props.confirmStyle === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700'
      : 'bg-indigo-600 hover:bg-indigo-700'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="text-xl font-extrabold text-gray-900 mb-2">{props.title}</h3>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">{props.body}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={props.onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={props.onConfirm}
            className={`px-4 py-2 ${confirmClass} text-white rounded-lg font-bold transition-colors`}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


// ----------------------------------------------------------------------
// Loading / NotFound / Error sub-panels.
// ----------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/3 mb-6" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-6 bg-gradient-to-r from-indigo-100 to-purple-100 rounded w-1/2 mt-6" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="text-4xl mb-2">🤷</div>
      <h2 className="text-xl font-extrabold text-gray-900 mb-2">Couldn&apos;t find that draft</h2>
      <p className="text-gray-500 text-sm mb-6">
        It may have been deleted, or it belongs to a different account.
      </p>
      <a
        href="/create"
        className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
      >
        Create something new
      </a>
    </div>
  )
}

function ErrorPanel(props: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <h2 className="text-xl font-extrabold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm mb-6">{props.message}</p>
      <button
        onClick={props.onRetry}
        className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}


// ----------------------------------------------------------------------
// formatTimeAgo — small helper. Prefers relative ("2 minutes ago") for
// recent items, falls back to absolute date for older ones.
// ----------------------------------------------------------------------

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' in UTC without a 'Z'; ensure Date
  // parses it as UTC, not local time.
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const then = new Date(normalized)
  if (isNaN(then.getTime())) return iso
  const diffSec = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000))
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} d ago`
  return then.toLocaleDateString()
}
