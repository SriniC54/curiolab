import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

export default function StudentDashboard() {
  const { user, token, isAuthenticated, isLoading, role } = useAuth()
  const router = useRouter()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const [topics, setTopics] = useState<string[]>([])
  const [loadingTopics, setLoadingTopics] = useState(true)

  // Auth guard
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'student')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  useEffect(() => {
    if (isAuthenticated && role === 'student') {
      fetchAssignments()
    }
  }, [isAuthenticated, role])

  const fetchAssignments = async () => {
    try {
      const res = await fetch(`${API_URL}/student/assignments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setTopics(data.topics)
      }
    } finally {
      setLoadingTopics(false)
    }
  }

  const topicEmojis: Record<string, string> = {
    dinosaurs: '🦕', space: '🚀', ocean: '🌊', pirates: '🏴', robots: '🤖',
    dragons: '🐉', volcanoes: '🌋', castles: '🏰', butterflies: '🦋',
    music: '🎵', food: '🍎', weather: '⛈️'
  }

  const getEmoji = (topic: string) => topicEmojis[topic.toLowerCase()] || '📚'

  const topicColors = [
    'from-blue-400 to-indigo-500',
    'from-green-400 to-teal-500',
    'from-purple-400 to-pink-500',
    'from-orange-400 to-red-500',
    'from-yellow-400 to-orange-500',
    'from-teal-400 to-cyan-500',
  ]

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
  }

  return (
    <>
      <Head><title>My Assignments - CurioLab</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <a href="/" className="text-xl font-bold text-gray-900">🦉 CurioLab</a>
                <span className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Student</span>
              </div>
              <span className="text-sm text-gray-600">Hi, {user?.name || user?.email}!</span>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">My Assigned Topics</h1>
          <p className="text-gray-500 mb-8">Click a topic to start learning!</p>

          {loadingTopics ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
          ) : topics.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm">
              <div className="text-5xl mb-4">📭</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No topics assigned yet</h2>
              <p className="text-gray-500">Your teacher hasn't assigned any topics yet. Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {topics.map((topic, index) => (
                <button
                  key={topic}
                  onClick={() => router.push(`/learn/${encodeURIComponent(topic)}`)}
                  className={`bg-gradient-to-br ${topicColors[index % topicColors.length]} text-white rounded-xl p-6 text-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200`}
                >
                  <div className="text-4xl mb-2">{getEmoji(topic)}</div>
                  <div className="font-semibold text-lg capitalize">{topic}</div>
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
