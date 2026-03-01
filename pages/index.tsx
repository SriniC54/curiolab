import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from '../components/AuthModal'
import { UserProfile } from '../components/UserProfile'
import analytics from '../lib/analytics'

const topicSuggestions = [
  { name: 'Dinosaurs', emoji: '🦕', color: 'from-green-400 to-emerald-500' },
  { name: 'Space', emoji: '🚀', color: 'from-purple-400 to-indigo-500' },
  { name: 'Ocean', emoji: '🌊', color: 'from-blue-400 to-cyan-500' },
  { name: 'Pirates', emoji: '🏴‍☠️', color: 'from-red-400 to-orange-500' },
  { name: 'Robots', emoji: '🤖', color: 'from-gray-400 to-slate-500' },
  { name: 'Dragons', emoji: '🐉', color: 'from-pink-400 to-purple-500' },
  { name: 'Volcanoes', emoji: '🌋', color: 'from-orange-400 to-red-500' },
  { name: 'Castles', emoji: '🏰', color: 'from-blue-400 to-purple-500' },
  { name: 'Butterflies', emoji: '🦋', color: 'from-yellow-400 to-pink-500' },
  { name: 'Music', emoji: '🎵', color: 'from-indigo-400 to-blue-500' },
  { name: 'Food', emoji: '🍎', color: 'from-red-400 to-yellow-500' },
  { name: 'Weather', emoji: '⛈️', color: 'from-gray-400 to-blue-500' },
]

export default function Home() {
  const { user, isAuthenticated, isLoading, logout, role } = useAuth()
  const router = useRouter()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [showProfile, setShowProfile] = useState(false)
  const [customTopic, setCustomTopic] = useState('')

  const navigate = (topic: string) => {
    router.push(`/learn/${encodeURIComponent(topic)}`)
  }

  const handleTopicSelection = (topic: string) => {
    analytics.topicSelected(topic, 'suggestion')
    navigate(topic)
  }

  const handleCustomTopicSubmit = () => {
    const topic = customTopic.trim()
    if (topic.length >= 2) {
      analytics.topicSelected(topic, 'custom')
      navigate(topic)
    }
  }

  return (
    <>
      <Head>
        <title>🦉 CurioLab — Laboratory of Curiosity for Kids!</title>
        <meta name="description" content="Interactive learning adventures for elementary students" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-cyan-100 to-green-100">

        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-bold text-gray-900">🦉 CurioLab</h1>
              <div className="flex items-center space-x-4">
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                ) : isAuthenticated ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700">Hi, {user?.name || user?.email}!</span>
                    {role === 'teacher' ? (
                      <a
                        href="/teacher-dashboard"
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors"
                      >
                        Teacher Dashboard
                      </a>
                    ) : (
                      <>
                        <a
                          href="/student-dashboard"
                          className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                        >
                          My Assignments
                        </a>
                        <button
                          onClick={() => setShowProfile(true)}
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                        >
                          Profile
                        </button>
                      </>
                    )}
                    <button
                      onClick={logout}
                      className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                      className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sign Up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} defaultMode={authMode} />

        {/* Profile modal */}
        {showProfile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">My Learning Profile</h2>
                  <button
                    onClick={() => setShowProfile(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <UserProfile />
              </div>
            </div>
          </div>
        )}

        <main className="container mx-auto px-4 py-8">
          <div className="max-w-3xl mx-auto">

            <div className="text-center mb-8">
              <p className="text-2xl font-bold text-gray-700">What do you want to learn about today?</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              {/* Search */}
              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleCustomTopicSubmit()}
                  placeholder="Type any topic — Dinosaurs, Black Holes, Pizza..."
                  className="flex-1 px-4 py-3 text-lg rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-gray-800 bg-gray-50"
                  autoFocus
                />
                <button
                  onClick={handleCustomTopicSubmit}
                  disabled={customTopic.trim().length < 2}
                  className="px-5 py-3 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Go →
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-sm text-gray-400">or pick one</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Topic grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 lg:gap-3">
                {topicSuggestions.map((topic, index) => (
                  <button
                    key={index}
                    onClick={() => handleTopicSelection(topic.name)}
                    className={`p-3 rounded-xl transition-all duration-150 hover:scale-105 active:scale-95 bg-gradient-to-br ${topic.color} text-white shadow-sm hover:shadow-md touch-manipulation`}
                  >
                    <div className="text-2xl mb-1">{topic.emoji}</div>
                    <div className="text-sm font-bold leading-tight">{topic.name}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </main>
      </div>
    </>
  )
}
