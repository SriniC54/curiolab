import React, { useState, useEffect, useRef, useCallback } from 'react'

export interface Section {
  heading: string
  body: string
  image_url: string
  image_alt: string
  photographer: string
}

interface Props {
  sections: Section[]
  topic: string
  onClose: () => void
}

const API_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  : 'http://localhost:8000'

// Strip emojis + markdown for clean TTS text
function buildSpeechText(section: Section): string {
  const emojiRx = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FE0F}]/gu
  const head = section.heading
    .replace(emojiRx, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const body = section.body
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return head ? `${head}. ${body}` : body
}

export default function StoryPlayer({ sections, topic, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [imgKey, setImgKey] = useState(0)
  // 'openai' | 'browser' | null — detected on first play attempt
  const [ttsMode, setTtsMode] = useState<'openai' | 'browser' | null>(null)

  const audioEl = useRef<HTMLAudioElement | null>(null)
  const blobCache = useRef<Map<number, string>>(new Map())
  const fetchPromises = useRef<Map<number, Promise<string>>>(new Map())
  const playGen = useRef(0)
  const isPlayingRef = useRef(false)
  const loadedIdxRef = useRef<number | null>(null)

  useEffect(() => {
    audioEl.current = new Audio()
    return () => {
      audioEl.current?.pause()
      blobCache.current.forEach(url => URL.revokeObjectURL(url))
      window.speechSynthesis?.cancel()
    }
  }, [])

  // ── OpenAI TTS helpers ──────────────────────────────────────────────────────

  const fetchAudio = useCallback(async (idx: number): Promise<string> => {
    if (blobCache.current.has(idx)) return blobCache.current.get(idx)!
    if (fetchPromises.current.has(idx)) return fetchPromises.current.get(idx)!
    const promise = (async () => {
      const res = await fetch(`${API_URL}/tts-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: buildSpeechText(sections[idx]) }),
      })
      if (!res.ok) throw new Error(`TTS ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      blobCache.current.set(idx, url)
      return url
    })()
    fetchPromises.current.set(idx, promise)
    promise.catch(() => {}) // suppress unhandled-rejection — caller's await catches the real error
    promise.finally(() => fetchPromises.current.delete(idx))
    return promise
  }, [sections])

  const prefetch = useCallback((idx: number) => {
    if (idx >= 0 && idx < sections.length) fetchAudio(idx).catch(() => {})
  }, [fetchAudio, sections.length])

  const playFromOpenAI = useCallback(async (idx: number) => {
    const gen = ++playGen.current
    const el = audioEl.current
    if (!el) return
    el.pause(); el.onended = null; el.onerror = null

    try {
      setIsLoadingAudio(!blobCache.current.has(idx))
      const url = await fetchAudio(idx)
      if (gen !== playGen.current || !isPlayingRef.current) return
      el.src = url
      loadedIdxRef.current = idx
      el.onended = () => {
        if (gen !== playGen.current || !isPlayingRef.current) return
        const next = idx + 1
        if (next < sections.length) {
          setCurrentIdx(next); setImgKey(k => k + 1)
          prefetch(next + 1)
          setTimeout(() => playFromOpenAI(next).catch(() => {}), 350)
        } else {
          isPlayingRef.current = false; setIsPlaying(false)
        }
      }
      el.onerror = () => {
        if (gen !== playGen.current) return
        isPlayingRef.current = false; setIsPlaying(false); setIsLoadingAudio(false)
      }
      await el.play()
      setIsLoadingAudio(false)
      prefetch(idx + 1)
    } catch {
      if (gen !== playGen.current) return
      // OpenAI failed — fall back to browser TTS silently
      setTtsMode('browser')
      playFromBrowser(idx)
    }
  }, [sections.length, fetchAudio, prefetch])

  // ── Browser (Web Speech) TTS fallback ──────────────────────────────────────

  const getBestVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices()
    const preferred = ['Samantha', 'Alex', 'Karen', 'Daniel', 'Moira', 'Tessa', 'Fiona']
    for (const name of preferred) {
      const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
      if (v) return v
    }
    return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en')) || null
  }

  const playFromBrowser = useCallback((idx: number) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    setIsLoadingAudio(false)
    const utterance = new SpeechSynthesisUtterance(buildSpeechText(sections[idx]))
    utterance.rate = 0.92; utterance.pitch = 1.05; utterance.volume = 1.0
    const voice = getBestVoice()
    if (voice) utterance.voice = voice
    utterance.onend = () => {
      if (!isPlayingRef.current) return
      const next = idx + 1
      if (next < sections.length) {
        setCurrentIdx(next); setImgKey(k => k + 1)
        setTimeout(() => playFromBrowser(next), 350)
      } else {
        isPlayingRef.current = false; setIsPlaying(false)
      }
    }
    utterance.onerror = () => { isPlayingRef.current = false; setIsPlaying(false) }
    window.speechSynthesis.speak(utterance)
  }, [sections])

  // ── Unified play/pause/goTo ─────────────────────────────────────────────────

  const playFrom = useCallback((idx: number, mode: 'openai' | 'browser') => {
    if (mode === 'openai') playFromOpenAI(idx).catch(() => {})
    else playFromBrowser(idx)
  }, [playFromOpenAI, playFromBrowser])

  const handlePlay = async () => {
    const el = audioEl.current
    // Resume paused OpenAI audio
    if (
      ttsMode === 'openai' && el?.src &&
      loadedIdxRef.current === currentIdx &&
      el.paused && !el.ended
    ) {
      isPlayingRef.current = true; setIsPlaying(true)
      await el.play(); return
    }

    isPlayingRef.current = true; setIsPlaying(true)

    if (ttsMode === 'browser') {
      playFromBrowser(currentIdx)
      return
    }

    // First play: try OpenAI, fallback handled inside playFromOpenAI
    setTtsMode('openai')
    prefetch(currentIdx + 1)
    playFromOpenAI(currentIdx).catch(() => {})
  }

  const handlePause = () => {
    audioEl.current?.pause()
    window.speechSynthesis?.cancel()
    isPlayingRef.current = false; setIsPlaying(false)
  }

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= sections.length) return
    audioEl.current?.pause()
    window.speechSynthesis?.cancel()
    setCurrentIdx(idx); setImgKey(k => k + 1)
    if (isPlaying) {
      if (ttsMode === 'browser') playFromBrowser(idx)
      else { prefetch(idx + 1); playFromOpenAI(idx).catch(() => {}) }
    }
  }

  const section = sections[currentIdx]
  if (!section) return null

  return (
    <div className="flex flex-col gap-4 py-6 px-6 lg:px-10">

      {/* Top bar: back + dot progress */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex-shrink-0"
        >
          ← Back to article
        </button>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {sections.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-200 ${
                i === currentIdx
                  ? 'w-4 h-4 bg-indigo-600 shadow'
                  : 'w-2.5 h-2.5 bg-indigo-200 hover:bg-indigo-400'
              }`}
              aria-label={`Go to section ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Image with Ken Burns — aria-hidden so browser doesn't announce alt text */}
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-gray-200"
        style={{ aspectRatio: '16/9' }}
      >
        {section.image_url ? (
          <img
            key={imgKey}
            src={section.image_url}
            alt=""
            aria-hidden="true"
            className={`w-full h-full object-cover animate-kb-${currentIdx % 4}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-indigo-100 to-purple-100">
            📚
          </div>
        )}
        <div className="absolute top-3 right-3 bg-black/40 text-white text-xs font-semibold px-2 py-1 rounded-full">
          {currentIdx + 1} / {sections.length}
        </div>
      </div>

      {/* Heading */}
      {section.heading && (
        <h3 className="text-xl font-extrabold text-gray-900 leading-tight">
          {section.heading}
        </h3>
      )}

      {/* Body */}
      <div className="max-h-44 overflow-y-auto pr-1">
        <p className="text-base sm:text-lg leading-relaxed text-gray-700 whitespace-pre-line">
          {section.body}
        </p>
      </div>

      {/* Attribution */}
      {section.photographer && (
        <p className="text-xs text-gray-400">
          Photo by {section.photographer} on{' '}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Pexels
          </a>
        </p>
      )}

      {/* TTS mode indicator */}
      {ttsMode === 'browser' && (
        <p className="text-xs text-amber-500 text-center">
          Using browser voice — add OpenAI billing for a more natural narrator
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <button
          onClick={() => goTo(currentIdx - 1)}
          disabled={currentIdx === 0}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700 font-bold text-lg transition-colors"
          aria-label="Previous section"
        >
          ‹
        </button>

        {isPlaying ? (
          <button
            onClick={handlePause}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors shadow min-w-[128px] justify-center"
          >
            {isLoadingAudio ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Loading…
              </>
            ) : (
              <><span>⏸</span> Pause</>
            )}
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-colors shadow min-w-[128px] justify-center"
          >
            <span>▶</span> Play
          </button>
        )}

        <button
          onClick={() => goTo(currentIdx + 1)}
          disabled={currentIdx === sections.length - 1}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700 font-bold text-lg transition-colors"
          aria-label="Next section"
        >
          ›
        </button>
      </div>

    </div>
  )
}
