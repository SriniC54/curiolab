import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import Footer from '../components/Footer'

interface TopicProgress {
  topic: string
  completed: boolean
  quiz_score: number | null
  quiz_total: number | null
}

interface QuizResult {
  topic: string
  score: number
  total: number
  taken_at: string
}

interface StudentProgress {
  progress: TopicProgress[]
  quiz_history: QuizResult[]
  total_assigned: number
  total_completed: number
  total_quizzes: number
}

const topicEmojis: Record<string, string> = {
  dinosaurs: '🦕', space: '🚀', ocean: '🌊', pirates: '🏴',
  robots: '🤖', dragons: '🐉', volcanoes: '🌋', castles: '🏰',
  butterflies: '🦋', music: '🎵', food: '🍎', weather: '⛈️',
}

const topicColors = [
  'from-blue-400 to-indigo-500',
  'from-green-400 to-teal-500',
  'from-purple-400 to-pink-500',
  'from-orange-400 to-red-500',
  'from-yellow-400 to-orange-500',
  'from-teal-400 to-cyan-500',
]

function getEmoji(topic: string) {
  return topicEmojis[topic.toLowerCase()] || '📚'
}

function scoreColor(score: number, total: number) {
  const pct = score / total
  if (pct >= 0.8) return 'bg-green-500'
  if (pct >= 0.6) return 'bg-yellow-500'
  return 'bg-red-400'
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function StudentDashboard() {
  const { user, token, isAuthenticated, isLoading, role } = useAuth()
  const router = useRouter()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const [progress, setProgress] = useState<StudentProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'topics' | 'scores'>('topics')

  // Auth guard
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'student')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  useEffect(() => {
    if (isAuthenticated && role === 'student') fetchProgress()
  }, [isAuthenticated, role])

  const fetchProgress = async () => {
    try {
      const res = await fetch(`${API_URL}/student/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) setProgress(await res.json())
    } finally {
      setLoading(false)
    }
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f7ff]">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const topics = progress?.progress ?? []
  const history = progress?.quiz_history ?? []

  return (
    <>
      <Head><title>My Learning — CurioLab</title></Head>
      <div className="min-h-screen bg-[#f8f7ff]">

        {/* Header */}
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <div className="flex items-center space-x-3">
                <a href="/" className="text-lg font-black text-white">🦉 CurioLab</a>
                <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">Student</span>
              </div>
              <span className="text-sm text-white/80">Hi, {user?.name || user?.email}!</span>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Summary bar */}
          {progress && progress.total_assigned > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-3xl font-black text-indigo-600">{progress.total_assigned}</p>
                <p className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">Assigned</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-3xl font-black text-green-600">{progress.total_completed}</p>
                <p className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">Completed</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-3xl font-black text-purple-600">{progress.total_quizzes}</p>
                <p className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">Quizzes</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
            <button
              onClick={() => setActiveTab('topics')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'topics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              My Topics
            </button>
            <button
              onClick={() => setActiveTab('scores')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'scores' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Quiz Scores {history.length > 0 && <span className="ml-1 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{history.length}</span>}
            </button>
          </div>

          {/* Topics tab */}
          {activeTab === 'topics' && (
            <>
              {topics.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow-sm">
                  <div className="text-6xl mb-4 animate-float inline-block">🦉</div>
                  <h2 className="text-xl font-bold text-gray-700 mb-2">No topics assigned yet</h2>
                  <p className="text-gray-500">Your teacher hasn't assigned any topics yet. Check back soon!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {topics.map((item, index) => (
                    <button
                      key={item.topic}
                      onClick={() => router.push(`/learn/${encodeURIComponent(item.topic)}`)}
                      className={`relative bg-gradient-to-br ${topicColors[index % topicColors.length]} text-white rounded-xl p-5 text-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200`}
                    >
                      {/* Completion badge */}
                      {item.completed && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                          <span className="text-xs font-black">✓</span>
                        </div>
                      )}

                      <div className="text-4xl mb-2">{getEmoji(item.topic)}</div>
                      <div className="font-semibold text-sm capitalize mb-2 leading-tight">{item.topic}</div>

                      {/* Quiz score chip */}
                      {item.quiz_score !== null ? (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white ${scoreColor(item.quiz_score, item.quiz_total!)}`}>
                          {item.quiz_score}/{item.quiz_total}
                        </div>
                      ) : item.completed ? (
                        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20">
                          No quiz yet
                        </div>
                      ) : (
                        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20">
                          Not started
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Quiz scores tab */}
          {activeTab === 'scores' && (
            <>
              {history.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow-sm">
                  <div className="text-5xl mb-4">🎯</div>
                  <h2 className="text-xl font-semibold text-gray-700 mb-2">No quiz scores yet</h2>
                  <p className="text-gray-500">Complete a topic and take the quiz to see your scores here.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Topic</th>
                        <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                        <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r, i) => {
                        const pct = r.score / r.total
                        const emoji = pct >= 0.8 ? '🎉' : pct >= 0.6 ? '👍' : '💪'
                        const label = pct >= 0.8 ? 'Excellent' : pct >= 0.6 ? 'Good' : 'Keep going'
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span>{getEmoji(r.topic)}</span>
                                <span className="font-medium text-gray-800 capitalize">{r.topic}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white ${scoreColor(r.score, r.total)}`}>
                                {r.score}/{r.total}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center text-sm text-gray-500">
                              {emoji} {label}
                            </td>
                            <td className="px-5 py-3 text-right text-sm text-gray-400">
                              {formatDate(r.taken_at)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

        </div>
      </div>
      <Footer />
    </>
  )
}
