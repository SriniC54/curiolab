import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from '../components/AuthModal'
import { UserProfile } from '../components/UserProfile'
import analytics from '../lib/analytics'
import Footer from '../components/Footer'

const topicSuggestions = [
  { name: 'Dinosaurs', emoji: '🦕', color: 'from-emerald-500 to-teal-600' },
  { name: 'Space', emoji: '🚀', color: 'from-violet-600 to-purple-700' },
  { name: 'Ocean', emoji: '🌊', color: 'from-sky-500 to-blue-600' },
  { name: 'Pirates', emoji: '🏴‍☠️', color: 'from-rose-500 to-red-700' },
  { name: 'Robots', emoji: '🤖', color: 'from-slate-600 to-gray-700' },
  { name: 'Dragons', emoji: '🐉', color: 'from-fuchsia-500 to-pink-600' },
  { name: 'Volcanoes', emoji: '🌋', color: 'from-orange-500 to-red-600' },
  { name: 'Castles', emoji: '🏰', color: 'from-blue-500 to-indigo-600' },
  { name: 'Butterflies', emoji: '🦋', color: 'from-yellow-400 to-orange-500' },
  { name: 'Music', emoji: '🎵', color: 'from-indigo-500 to-violet-600' },
  { name: 'Food', emoji: '🍎', color: 'from-red-400 to-amber-500' },
  { name: 'Weather', emoji: '⛈️', color: 'from-cyan-500 to-sky-600' },
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
        <title>🦉 CurioLab — Curiosity starts here!</title>
        <meta name="description" content="Interactive learning adventures for kids" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-[#f8f7ff]">

        {/* Hero gradient section */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700">

          {/* Nav */}
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <span className="text-xl font-black text-white">🦉 CurioLab</span>
              <div className="flex items-center space-x-3">
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : isAuthenticated ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-white/80 hidden sm:block">
                      Hi, {user?.name || user?.email}!
                    </span>
                    {role === 'creator' ? (
                      <a
                        href="/teacher-dashboard"
                        className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold"
                      >
                        Teacher Dashboard
                      </a>
                    ) : (
                      <>
                        <a
                          href="/student-dashboard"
                          className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold"
                        >
                          My Assignments
                        </a>
                        <button
                          onClick={() => setShowProfile(true)}
                          className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold"
                        >
                          Profile
                        </button>
                      </>
                    )}
                    <button
                      onClick={logout}
                      className="px-3 py-1 text-sm text-white/60 hover:text-white transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                      className="px-4 py-2 text-sm text-white/80 hover:text-white font-semibold transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                      className="px-4 py-2 text-sm bg-white text-indigo-700 rounded-lg hover:bg-white/90 transition-colors font-bold"
                    >
                      Sign Up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Hero text */}
          <div className="text-center pt-6 pb-28 px-4">
            <div className="text-7xl sm:text-8xl inline-block animate-float">🦉</div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mt-5 leading-tight">
              Curiosity starts here
            </h2>
            <p className="text-indigo-200 text-lg sm:text-xl mt-4 max-w-lg mx-auto">
              Explore any topic. Learn something amazing every day.
            </p>
          </div>

        </div>

        {/* Search card — overlaps hero with negative margin */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 relative z-10 pb-16">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">

            {/* Search */}
            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleCustomTopicSubmit()}
                placeholder="Type any topic — Black Holes, Ancient Egypt, Pizza..."
                className="flex-1 px-4 py-3 text-base sm:text-lg rounded-xl border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-gray-800 bg-gray-50 font-medium"
                autoFocus
              />
              <button
                onClick={handleCustomTopicSubmit}
                disabled={customTopic.trim().length < 2}
                className="px-5 py-3 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Go →
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-sm text-gray-400 font-semibold">or pick a topic</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Topic grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {topicSuggestions.map((topic, index) => (
                <button
                  key={index}
                  onClick={() => handleTopicSelection(topic.name)}
                  className={`p-5 rounded-2xl transition-all duration-150 hover:scale-105 active:scale-95 bg-gradient-to-br ${topic.color} text-white shadow-md hover:shadow-xl touch-manipulation text-left`}
                >
                  <div className="text-4xl mb-2">{topic.emoji}</div>
                  <div className="text-sm font-extrabold leading-tight">{topic.name}</div>
                </button>
              ))}
            </div>

          </div>
        </div>

        <Footer />

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} defaultMode={authMode} />

        {/* Profile modal */}
        {showProfile && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">My Learning Profile</h2>
                  <button
                    onClick={() => setShowProfile(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <UserProfile />
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
