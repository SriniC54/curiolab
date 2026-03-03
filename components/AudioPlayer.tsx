import React, { useState, useEffect, useRef } from 'react'

interface AudioPlayerProps {
  topic: string
  content: string
}

export default function AudioPlayer({ topic, content }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [voicesReady, setVoicesReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true)
      // Voices load asynchronously in some browsers
      const loadVoices = () => {
        if (window.speechSynthesis.getVoices().length > 0) setVoicesReady(true)
      }
      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Stop when topic/content changes
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
    }
  }, [content])

  const getBestVoice = () => {
    const voices = window.speechSynthesis.getVoices()
    // Prefer natural-sounding English voices
    const preferred = [
      'Samantha', 'Alex', 'Karen', 'Daniel', 'Moira', 'Tessa', 'Fiona'
    ]
    for (const name of preferred) {
      const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
      if (v) return v
    }
    return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en')) || null
  }

  const handlePlay = () => {
    if (!isSupported) return

    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      return
    }

    window.speechSynthesis.cancel()

    // Strip markdown formatting before speaking
    const cleanText = content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n\n/g, '. ')
      .replace(/\n/g, ' ')

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.rate = 0.92
    utterance.pitch = 1.05
    utterance.volume = 1.0

    const voice = getBestVoice()
    if (voice) utterance.voice = voice

    utterance.onend = () => setIsPlaying(false)
    utterance.onerror = () => setIsPlaying(false)

    window.speechSynthesis.speak(utterance)
    setIsPlaying(true)
  }

  if (!isSupported) return null

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handlePlay}
        className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 shadow-sm ${
          isPlaying
            ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
            : 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:scale-105'
        }`}
      >
        <span>{isPlaying ? '⏹' : '▶️'}</span>
        <span>{isPlaying ? 'Stop narration' : 'Listen to article'}</span>
      </button>
      {isPlaying && (
        <span className="text-xs text-emerald-600 animate-pulse font-medium">🔊 Reading aloud...</span>
      )}
    </div>
  )
}
