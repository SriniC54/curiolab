import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from '../components/AuthModal'
import Footer from '../components/Footer'

/**
 * Homepage — marketing landing + auth funnel.
 *
 * Pre-pivot, this was a student-facing topic playground (12 emoji tiles +
 * a freeform topic search). Post-pivot, students only consume what's
 * assigned to them and only signed-up creators generate content, so the
 * homepage's job changed:
 *
 *  - Not signed in → marketing pitch + Sign Up / Sign In CTAs.
 *  - Signed in as creator → redirect to /create.
 *  - Signed in as student → redirect to /student-dashboard.
 *
 * The old topicSuggestions array and topic-selection handlers are
 * removed entirely. Showing them would imply browsable on-demand content
 * we no longer deliver.
 */
export default function Home() {
  const { user, isAuthenticated, isLoading, logout, role } = useAuth()
  const router = useRouter()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  // Auto-redirect signed-in users to their dashboard. The homepage has no
  // value for someone already in — landing on it would just be a click
  // between them and where they want to be.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    if (role === 'creator') {
      router.replace('/create')
    } else {
      router.replace('/student-dashboard')
    }
  }, [isAuthenticated, isLoading, role, router])

  // While auth state is resolving OR while a redirect is in flight, show a
  // neutral loading state instead of the marketing pitch. Avoids a
  // visible flash of "Sign Up" for users who are already signed in.
  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>🦉 CurioLab — Trustworthy learning content for your kids</title>
        <meta
          name="description"
          content="Generate magazine-quality articles on any topic for your kids — every one reviewed for accuracy, bias, and age-appropriateness before they read it."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-[#f8f7ff]">

        {/* Hero gradient section */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700">

          {/* Nav */}
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <span className="text-xl font-black text-white">🦉 CurioLab</span>
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
            </div>
          </nav>

          {/* Hero text + primary CTA */}
          <div className="text-center pt-6 pb-32 px-4 max-w-3xl mx-auto">
            <div className="text-7xl sm:text-8xl inline-block animate-float">🦉</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mt-5 leading-tight">
              Curiosity starts here
            </h1>
            <p className="text-indigo-100 text-lg sm:text-xl mt-5 max-w-xl mx-auto leading-relaxed">
              Generate magazine-quality articles on any topic for your kids — every one reviewed for accuracy, bias, and age-appropriateness before they read it.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                className="px-8 py-3 bg-white text-indigo-700 rounded-xl font-extrabold text-lg hover:bg-white/90 transition-colors shadow-lg w-full sm:w-auto"
              >
                Sign Up Free
              </button>
              <button
                onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                className="px-6 py-3 text-white/90 hover:text-white font-semibold transition-colors underline-offset-4 hover:underline"
              >
                Already have an account? Sign in →
              </button>
            </div>
          </div>

        </div>

        {/* "How it works" card — overlaps hero with negative margin */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-20 relative z-10 pb-16">
          <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
            <h2 className="text-center text-sm font-bold uppercase tracking-wider text-indigo-600 mb-8">
              How it works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-10">

              {/* Step 1 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center mx-auto mb-4 font-extrabold text-xl">
                  1
                </div>
                <h3 className="font-extrabold text-gray-900 text-lg mb-2">Pick any topic</h3>
                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                  Volcanoes, fractions, ancient Egypt — anything your child is curious about. Choose a skill level and we&apos;ll turn it into a magazine-style article.
                </p>
              </div>

              {/* Step 2 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto mb-4 font-extrabold text-xl">
                  2
                </div>
                <h3 className="font-extrabold text-gray-900 text-lg mb-2">AI reviews every draft</h3>
                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                  Each article is checked for accuracy, balance, age-appropriateness, and safety — then revised. You see the polished result, not the raw output.
                </p>
              </div>

              {/* Step 3 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto mb-4 font-extrabold text-xl">
                  3
                </div>
                <h3 className="font-extrabold text-gray-900 text-lg mb-2">Assign and track</h3>
                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                  Save articles to your library, assign them to your kids or classrooms, and see what they&apos;ve read. Built for parents and teachers.
                </p>
              </div>

            </div>

            {/* Closing CTA inside the card */}
            <div className="mt-10 pt-8 border-t border-gray-100 text-center">
              <button
                onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-extrabold text-lg hover:bg-indigo-700 transition-colors shadow-md"
              >
                Get Started Free
              </button>
              <p className="text-sm text-gray-500 mt-3">
                No credit card required.
              </p>
            </div>

          </div>
        </div>

        <Footer />

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} defaultMode={authMode} />

      </div>
    </>
  )
}
