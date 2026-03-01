import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface AudioPlayerProps {
  topic: string
  gradeLevel: number
}

export default function AudioPlayer({ topic, gradeLevel }: AudioPlayerProps) {
  const { token } = useAuth()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  const generateAudio = async () => {
    let progressInterval: NodeJS.Timeout | null = null

    try {
      setIsLoading(true)
      setError(null)
      setProgress(0)

      const milestones = [
        { percent: 10, message: '🦉 Understanding the content...' },
        { percent: 25, message: '📖 Researching the topic...' },
        { percent: 40, message: '✍️ Writing the article...' },
        { percent: 55, message: '🎤 Warming up my voice...' },
        { percent: 70, message: '🎵 Adding natural rhythm...' },
        { percent: 85, message: '✨ Adding final touches...' },
        { percent: 100, message: '🎉 Ready to play!' },
      ]

      progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = Math.min(prev + 2, 95)
          const milestone = milestones.find(m => m.percent <= newProgress && m.percent > prev)
          if (milestone) setProgressMessage(milestone.message)
          return newProgress
        })
      }, 400)

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-audio`,
        { method: 'POST', headers, body: JSON.stringify({ topic, grade_level: gradeLevel }) }
      )

      if (!response.ok) throw new Error(`Audio generation failed: ${response.status}`)

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audioElement = new Audio(audioUrl)
      audioElement.addEventListener('ended', () => setIsPlaying(false))

      if (progressInterval) clearInterval(progressInterval)
      setProgress(100)
      setProgressMessage('🎉 Ready to play!')
      setAudio(audioElement)
      return audioElement
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval)
      setProgress(0)
      setProgressMessage('')
      const msg = err instanceof Error ? err.message : 'Failed to generate audio'
      if (msg.includes('500')) {
        setError('Audio generation failed. Please try again.')
      } else {
        setError('Unable to generate audio. Please try again.')
      }
      console.error('Audio generation error:', err)
      return null
    } finally {
      setIsLoading(false)
      if (progressInterval) clearInterval(progressInterval)
    }
  }

  const togglePlayback = async () => {
    if (isPlaying && audio) {
      audio.pause()
      setIsPlaying(false)
    } else {
      let audioToPlay = audio
      if (!audioToPlay) audioToPlay = await generateAudio()
      if (audioToPlay) {
        audioToPlay.play()
        setIsPlaying(true)
      }
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={togglePlayback}
        disabled={isLoading}
        className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-full font-bold text-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 shadow-lg"
      >
        <span className="text-2xl">🦉</span>
        {isLoading ? (
          <>
            <span className="animate-pulse">🦉</span>
            <span>{progress}%</span>
          </>
        ) : isPlaying ? (
          <>
            <span>⏸️</span>
            <span>Pause Narration</span>
          </>
        ) : (
          <>
            <span>▶️</span>
            <span>Play Narration</span>
          </>
        )}
      </button>

      {isLoading && progressMessage && (
        <div className="text-emerald-600 text-sm font-medium">{progressMessage}</div>
      )}

      {error && <div className="text-red-600 text-sm font-medium">{error}</div>}
    </div>
  )
}
