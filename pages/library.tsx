import React, { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

/**
 * /library — the creator's view of every content_item they've created.
 *
 * Read-only listing. All state transitions (save, assign, publish,
 * discard) live on the review screen so the library doesn't duplicate
 * action logic. Click any row → /review/[id] handles the rest.
 *
 * No pagination, filters, or search for MVP — creators won't have
 * enough items for browsing to become painful. We add those when the
 * library starts feeling crowded.
 */

type LibraryItem = {
  id: number
  topic: string
  skill_level: string
  status: string
  visibility: string
  iteration_count: number
  created_at: string
  updated_at: string
}

type PageState = 'loading' | 'ready' | 'empty' | 'error'

export default function LibraryPage() {
  const { user, token, isAuthenticated, isLoading, role, logout } = useAuth()
  const router = useRouter()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const [pageState, setPageState] = useState<PageState>('loading')
  const [items, setItems] = useState<LibraryItem[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  // --- Auth guard.
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'creator')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  // --- Fetch library.
  const fetchItems = useCallback(async () => {
    if (!token) return
    setPageState('loading')
    setErrorMessage('')
    try {
      const res = await fetch(`${API_URL}/creator/content`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const fetched = (data.items || []) as LibraryItem[]
      setItems(fetched)
      setPageState(fetched.length === 0 ? 'empty' : 'ready')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not load your library.')
      setPageState('error')
    }
  }, [API_URL, token])

  useEffect(() => {
    if (isAuthenticated && role === 'creator') fetchItems()
  }, [isAuthenticated, role, fetchItems])

  // --- Auth still resolving.
  if (isLoading || !isAuthenticated || role !== 'creator') {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7ff]">
      <Head>
        <title>Your library — CurioLab</title>
      </Head>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/create" className="text-xl font-black text-indigo-700">🦉 CurioLab</a>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500 hidden sm:block">
                {user?.name || user?.email}
              </span>
              <a
                href="/creator-dashboard"
                className="px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-50 rounded transition-colors font-semibold"
              >
                Dashboard
              </a>
              <button
                onClick={logout}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header */}
        <div className="flex justify-between items-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Your library</h1>
          <a
            href="/create"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors text-sm sm:text-base"
          >
            + Create new
          </a>
        </div>

        {pageState === 'loading' && <LoadingList />}
        {pageState === 'empty' && <EmptyState />}
        {pageState === 'error' && <ErrorPanel message={errorMessage} onRetry={fetchItems} />}
        {pageState === 'ready' && <ItemList items={items} onOpen={id => router.push(`/review/${id}`)} />}

      </main>
    </div>
  )
}

// ----------------------------------------------------------------------
// ItemList — the main rendered table-of-cards.
// ----------------------------------------------------------------------

function ItemList(props: { items: LibraryItem[]; onOpen: (id: number) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {props.items.map((item, idx) => (
        <button
          key={item.id}
          onClick={() => props.onOpen(item.id)}
          className={
            'w-full text-left flex items-center justify-between px-5 sm:px-6 py-5 hover:bg-gray-50 transition-colors ' +
            (idx > 0 ? 'border-t border-gray-100' : '')
          }
        >
          {/* Left: topic + badges + meta */}
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-extrabold text-gray-900 text-base sm:text-lg truncate">
                {item.topic}
              </span>
              <StatusBadge status={item.status} />
              {item.visibility === 'assigned' && <Badge color="indigo">Assigned</Badge>}
              {item.visibility === 'public' && <Badge color="green">Public</Badge>}
            </div>
            <div className="text-sm text-gray-500">
              {item.skill_level} · {formatTimeAgo(item.created_at)}
            </div>
          </div>

          {/* Right: open chevron */}
          <span className="text-indigo-600 font-bold text-sm shrink-0">Open →</span>
        </button>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------
// Badges
// ----------------------------------------------------------------------

function StatusBadge(props: { status: string }) {
  if (props.status === 'validated') return <Badge color="indigo">Saved</Badge>
  if (props.status === 'published') return <Badge color="green">Published</Badge>
  return <Badge color="gray">Draft</Badge>
}

function Badge(props: { color: 'gray' | 'indigo' | 'green'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    green: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${map[props.color]}`}>
      {props.children}
    </span>
  )
}

// ----------------------------------------------------------------------
// Page-state panels
// ----------------------------------------------------------------------

function LoadingList() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      {[0, 1, 2].map(i => (
        <div key={i} className={'px-5 sm:px-6 py-5 ' + (i > 0 ? 'border-t border-gray-100' : '')}>
          <div className="h-5 bg-gray-100 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/4" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
      <div className="text-5xl mb-3">📚</div>
      <h2 className="text-xl font-extrabold text-gray-900 mb-2">No content yet</h2>
      <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
        Generate your first article — pick a topic, choose a skill level, and we&apos;ll do the rest.
      </p>
      <a
        href="/create"
        className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
      >
        Create your first article
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
// formatTimeAgo — same shape as the helper in /review/[id]. Duplicated
// here rather than extracted into a shared module since this is the
// second of two callers and the function is tiny.
// ----------------------------------------------------------------------

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
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
