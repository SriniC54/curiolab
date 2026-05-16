import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

/**
 * /create — the page a signed-in creator uses to generate a new content item.
 *
 * The orchestrator (backend) takes 20-60 seconds for a generate-validate-
 * revise cycle. This page's whole job is to make that wait feel deliberate
 * rather than broken:
 *
 *   - Idle: a focused form (topic + skill level + Generate).
 *   - Generating: a skeleton placeholder shaped like the article that's
 *     coming, with rotating phase labels ('Generating draft...' ->
 *     'Reviewing content...' -> 'Revising for clarity...'). The labels
 *     are client-side scripted on a timer — they aren't driven by real
 *     backend status (we don't have an SSE channel), but they're sequenced
 *     to roughly match what the backend is actually doing.
 *   - Error: inline retry card. Form state preserved.
 *   - Success: redirect to /review/[content_item_id] (task #13 builds that
 *     screen; until it lands, that route 404s).
 *
 * Daily generation cap (3 per creator per day, midnight UTC reset) is
 * fetched on mount from GET /creator/content/budget and re-derived from
 * the generate response's remaining_today field. 429 responses are
 * handled gracefully.
 */

type SkillLevel = 'Beginner' | 'Explorer' | 'Expert'
type PageState = 'idle' | 'generating' | 'error'

const SKILL_LEVELS: { value: SkillLevel; label: string; description: string }[] = [
  {
    value: 'Beginner',
    label: 'Beginner',
    description: 'Younger readers. Simple vocabulary, short sentences, foundational concepts.',
  },
  {
    value: 'Explorer',
    label: 'Explorer',
    description: 'Curious kids. Intermediate vocabulary, comprehensive coverage from multiple angles.',
  },
  {
    value: 'Expert',
    label: 'Expert',
    description: 'Older kids. Advanced vocabulary, in-depth analysis, sophisticated connections.',
  },
]

const PHASE_LABELS = [
  'Generating draft...',
  'Reviewing content...',
  'Checking accuracy and balance...',
  'Revising for clarity...',
  'Final review...',
]

export default function CreatePage() {
  const { user, token, isAuthenticated, isLoading, role, logout } = useAuth()
  const router = useRouter()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  // Form state — preserved across error retries so the creator doesn't retype.
  const [topic, setTopic] = useState('')
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Explorer')

  // Page lifecycle state.
  const [pageState, setPageState] = useState<PageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Daily budget. null = not yet fetched. Re-derived from generate
  // response when one comes back.
  const [remainingToday, setRemainingToday] = useState<number | null>(null)
  const [dailyLimit, setDailyLimit] = useState<number>(3)
  const [capHit, setCapHit] = useState(false)

  // Rotating phase label index. Cycles on a timer while generating.
  const [phaseIndex, setPhaseIndex] = useState(0)
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // --- Auth guard. Same pattern as teacher-dashboard.tsx.
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'creator')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  // --- Fetch budget on mount.
  useEffect(() => {
    if (!isAuthenticated || role !== 'creator' || !token) return
    fetch(`${API_URL}/creator/content/budget`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(data => {
        setRemainingToday(data.remaining_today)
        setDailyLimit(data.daily_limit)
        setCapHit(data.remaining_today <= 0)
      })
      .catch(err => {
        // Non-fatal — we just don't show the budget. Generate still works
        // (and will surface a 429 inline if the cap is actually hit).
        console.warn('Could not fetch budget', err)
      })
  }, [isAuthenticated, role, token, API_URL])

  // --- Rotate phase labels while generating.
  useEffect(() => {
    if (pageState !== 'generating') {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current)
        phaseTimerRef.current = null
      }
      return
    }
    setPhaseIndex(0)
    phaseTimerRef.current = setInterval(() => {
      setPhaseIndex(i => Math.min(i + 1, PHASE_LABELS.length - 1))
    }, 8000)
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current)
    }
  }, [pageState])

  // --- Submit handler.
  const handleGenerate = async () => {
    const trimmed = topic.trim()
    if (trimmed.length < 2) return
    if (capHit) return

    setPageState('generating')
    setErrorMessage('')

    try {
      const res = await fetch(`${API_URL}/creator/content/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: trimmed, skill_level: skillLevel }),
      })

      if (res.status === 429) {
        // Daily cap hit on the server side (we may have been out of sync).
        const body = await res.json().catch(() => ({}))
        const detail = body.detail || {}
        setErrorMessage(
          detail.message ||
            `You've used all ${dailyLimit} of your daily generations. Your budget resets at midnight UTC.`,
        )
        setRemainingToday(0)
        setCapHit(true)
        setPageState('error')
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Generation failed (HTTP ${res.status})`)
      }

      const data = await res.json()
      // Update budget from the response so the next attempt reflects reality.
      if (typeof data.remaining_today === 'number') {
        setRemainingToday(data.remaining_today)
        setCapHit(data.remaining_today <= 0)
      }
      // Hand off to the review screen (task #13).
      router.push(`/review/${data.content_item_id}`)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Generation failed. Please try again.')
      setPageState('error')
    }
  }

  const canSubmit = topic.trim().length >= 2 && !capHit

  // --- Loading auth state.
  if (isLoading || !isAuthenticated || role !== 'creator') {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Create new content — CurioLab</title>
      </Head>

      <div className="min-h-screen bg-[#f8f7ff]">

        {/* Nav */}
        <nav className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/create" className="text-xl font-black text-indigo-700">
                🦉 CurioLab
              </a>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500 hidden sm:block">
                  {user?.name || user?.email}
                </span>
                <a
                  href="/teacher-dashboard"
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

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">

          {pageState === 'generating' ? (
            <GeneratingSkeleton phaseLabel={PHASE_LABELS[phaseIndex]} topic={topic.trim()} />
          ) : (
            <FormPanel
              topic={topic}
              setTopic={setTopic}
              skillLevel={skillLevel}
              setSkillLevel={setSkillLevel}
              canSubmit={canSubmit}
              capHit={capHit}
              remainingToday={remainingToday}
              dailyLimit={dailyLimit}
              onSubmit={handleGenerate}
              errorMessage={pageState === 'error' ? errorMessage : ''}
            />
          )}

        </main>

      </div>
    </>
  )
}

// ----------------------------------------------------------------------
// FormPanel — idle + error state. Topic input, skill level cards, CTA.
// ----------------------------------------------------------------------

function FormPanel(props: {
  topic: string
  setTopic: (s: string) => void
  skillLevel: SkillLevel
  setSkillLevel: (s: SkillLevel) => void
  canSubmit: boolean
  capHit: boolean
  remainingToday: number | null
  dailyLimit: number
  onSubmit: () => void
  errorMessage: string
}) {
  const {
    topic, setTopic, skillLevel, setSkillLevel,
    canSubmit, capHit, remainingToday, dailyLimit,
    onSubmit, errorMessage,
  } = props

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">
      <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2">
        What do you want to teach today?
      </h1>
      <p className="text-gray-500 mb-8">
        Pick any topic and skill level. We&apos;ll generate, review, and revise an article you can assign.
      </p>

      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-sm">
          {errorMessage}
        </div>
      )}

      {capHit && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
          You&apos;ve used all {dailyLimit} of your daily generations. Your budget resets at midnight UTC.
          {' '}<a href="/library" className="font-semibold underline">Review your library</a> in the meantime.
        </div>
      )}

      {/* Topic input */}
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        Topic
      </label>
      <input
        type="text"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit() }}
        placeholder="e.g. Volcanoes, Ancient Egypt, Fractions, Photosynthesis..."
        className="w-full px-4 py-3 text-base sm:text-lg rounded-xl border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-gray-800 bg-gray-50 font-medium mb-8"
        autoFocus
      />

      {/* Skill level cards */}
      <label className="block text-sm font-semibold text-gray-700 mb-3">
        Skill level
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {SKILL_LEVELS.map(opt => {
          const selected = skillLevel === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSkillLevel(opt.value)}
              className={
                'p-4 rounded-xl border-2 text-left transition-all ' +
                (selected
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300')
              }
            >
              <div className={'font-extrabold mb-1 ' + (selected ? 'text-indigo-700' : 'text-gray-900')}>
                {opt.label}
              </div>
              <div className="text-xs text-gray-500 leading-relaxed">
                {opt.description}
              </div>
            </button>
          )
        })}
      </div>

      {/* CTA + budget */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-extrabold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          Generate →
        </button>
        {remainingToday !== null && (
          <span className="text-sm text-gray-500 text-center sm:text-right">
            {remainingToday} / {dailyLimit} generations left today
          </span>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// GeneratingSkeleton — animated placeholder shaped like the article that
// is coming. Cycles a phase label below the skeleton to convey progress.
// ----------------------------------------------------------------------

function GeneratingSkeleton(props: { phaseLabel: string; topic: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">

      <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-600">
        Working on it
      </div>
      <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-1">
        Building your article on “{props.topic}”
      </h2>
      <p className="text-gray-500 text-sm mb-8">
        Usually takes 20–60 seconds. Hang tight.
      </p>

      {/* Skeleton article body — shaped like what's coming */}
      <div className="space-y-6 animate-pulse">

        {/* Article title bar */}
        <div className="h-8 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg w-3/4" />

        {/* Intro paragraph */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
        </div>

        {/* Section heading */}
        <div className="h-6 bg-gradient-to-r from-indigo-100 to-purple-100 rounded w-1/2 mt-8" />

        {/* Section body */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-11/12" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-4/5" />
        </div>

        {/* Section heading */}
        <div className="h-6 bg-gradient-to-r from-indigo-100 to-purple-100 rounded w-2/5 mt-8" />

        {/* Section body */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-4 bg-gray-100 rounded w-full" />
        </div>

      </div>

      {/* Phase label */}
      <div className="mt-10 flex items-center gap-3 text-indigo-700">
        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm font-semibold">{props.phaseLabel}</span>
      </div>

    </div>
  )
}
