import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../../contexts/AuthContext'
import { AuthModal } from '../../components/AuthModal'
import StoryPlayer, { Section } from '../../components/StoryPlayer'

interface ContentResponse {
  topic: string
  skill_level: string
  content: string
  readability_score: number
  word_count: number
  images: Array<{
    id: string
    url: string
    thumbnail: string
    alt: string
    photographer: string
    position: number
  }>
  sections: Section[]
}

interface QuizQuestion {
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct: string
}

const topicBannerColors: Record<string, string> = {
  dinosaurs: 'from-emerald-500 to-teal-600',
  space: 'from-violet-600 to-purple-700',
  ocean: 'from-sky-500 to-blue-600',
  pirates: 'from-rose-500 to-red-700',
  robots: 'from-slate-600 to-gray-700',
  dragons: 'from-fuchsia-500 to-pink-600',
  volcanoes: 'from-orange-500 to-red-600',
  castles: 'from-blue-500 to-indigo-600',
  butterflies: 'from-yellow-400 to-orange-500',
  music: 'from-indigo-500 to-violet-600',
  food: 'from-red-400 to-amber-500',
  weather: 'from-cyan-500 to-sky-600',
}

const topicEmojiMap: Record<string, string> = {
  dinosaurs: '🦕', space: '🚀', ocean: '🌊', pirates: '🏴‍☠️',
  robots: '🤖', dragons: '🐉', volcanoes: '🌋', castles: '🏰',
  butterflies: '🦋', music: '🎵', food: '🍎', weather: '⛈️',
}

export default function LearnPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading, role, logout } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  const [content, setContent] = useState<ContentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  const [storyMode, setStoryMode] = useState(false)
  const [visible, setVisible] = useState(false)

  const topic = router.query.topic as string

  const displayTopic = topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : ''
  const bannerColor = topicBannerColors[topic?.toLowerCase()] || 'from-indigo-500 to-purple-600'
  const topicEmoji = topicEmojiMap[topic?.toLowerCase()] || '📚'

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (topic) generateContent(topic)
  }, [topic])

  const generateContent = async (t: string) => {
    setLoading(true)
    setError('')
    setContent(null)
    setQuiz(null)
    setQuizAnswers({})
    setQuizSubmitted(false)
    setQuizScore(null)
    setStoryMode(false)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-content`,
        { method: 'POST', headers, body: JSON.stringify({ topic: t, skill_level: 'Explorer' }) }
      )

      if (!response.ok) throw new Error('Failed to generate content')
      const data: ContentResponse = await response.json()
      setContent(data)
    } catch (err) {
      setError('Unable to load content. Please try again!')
    } finally {
      setLoading(false)
    }
  }

  const generateQuiz = async () => {
    if (!content) return
    setLoadingQuiz(true)
    setQuiz(null)
    setQuizAnswers({})
    setQuizSubmitted(false)
    setQuizScore(null)

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-quiz`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, content: content.content }),
        }
      )
      if (!response.ok) throw new Error('Failed to generate quiz')
      const data = await response.json()
      setQuiz(data.questions)
    } catch (err) {
      setError('Failed to generate quiz. Please try again.')
    } finally {
      setLoadingQuiz(false)
    }
  }

  const submitQuiz = async () => {
    if (!quiz) return
    let score = 0
    quiz.forEach((q, idx) => { if (quizAnswers[idx] === q.correct) score++ })
    setQuizScore(score)
    setQuizSubmitted(true)

    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/submit-quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ topic, score, total: quiz.length }),
        })
      } catch (err) {
        console.error('Failed to save quiz result:', err)
      }
    }
  }

  return (
    <>
      <Head>
        <title>{displayTopic ? `${displayTopic} — CurioLab` : 'CurioLab'}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div
        className={`min-h-screen bg-[#f8f7ff] transition-opacity duration-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Header */}
        <header className="bg-white/90 backdrop-blur-sm shadow-sm border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="text-lg font-black text-indigo-600 hover:text-indigo-700 transition-colors">
                🦉 CurioLab
              </Link>
              <div className="flex items-center space-x-3">
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                ) : isAuthenticated ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600 hidden sm:block">Hi, {user?.name || user?.email}!</span>
                    {role === 'teacher' ? (
                      <Link href="/teacher-dashboard" className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors font-semibold">
                        Teacher Dashboard
                      </Link>
                    ) : (
                      <Link href="/student-dashboard" className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors font-semibold">
                        My Assignments
                      </Link>
                    )}
                    <button onClick={logout} className="px-3 py-1 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                      className="px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { setAuthMode('register'); setShowAuthModal(true) }}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
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

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Link href="/" className="text-gray-400 hover:text-indigo-600 transition-colors">
              ← All topics
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-700 capitalize">{topic}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Content card */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">

            {/* Topic banner — always shown when topic is known */}
            {topic && (
              <div className={`bg-gradient-to-r ${bannerColor} px-6 lg:px-10 py-5`}>
                <div className="flex items-center gap-4">
                  <span className={`text-5xl flex-shrink-0 ${loading ? 'animate-bounce' : ''}`}>
                    {topicEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl lg:text-3xl font-black text-white capitalize leading-tight">
                      {displayTopic}
                    </h2>
                    <p className="text-white/70 text-sm mt-0.5">
                      {loading
                        ? 'Loading your lesson...'
                        : content
                        ? `${content.word_count} words · Explorer level`
                        : 'Explorer level'}
                    </p>
                  </div>
                  {content && !loading && content.sections?.length > 0 && (
                    <button
                      onClick={() => setStoryMode(true)}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-sm transition-colors"
                    >
                      ▶ Watch Story
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="text-center py-16 px-6">
                <div className="inline-block w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-5" />
                <p className="text-gray-500 font-medium">Generating your lesson...</p>
                <p className="text-sm text-gray-400 mt-1">Usually takes about 10 seconds</p>
              </div>
            )}

            {/* Story Player mode */}
            {content && !loading && storyMode && (
              <StoryPlayer
                sections={content.sections || []}
                topic={topic}
                onClose={() => setStoryMode(false)}
              />
            )}

            {/* Article + quiz */}
            {content && !loading && !storyMode && (
              <div>

                {/* Article */}
                <div className="px-6 lg:px-10 py-8 max-h-[68vh] overflow-y-auto">
                  <div className="space-y-5">
                    {(() => {
                      const sections: string[][] = []
                      const paragraphs = content.content.split('\n\n')
                      let currentSection: string[] = []

                      paragraphs.forEach(paragraph => {
                        const isHeading =
                          /^\*\*(.+?)\*\*/.test(paragraph.trim()) ||
                          /^([🔥🌿🍖💎🏰🐲📖✨🎉🌟⭐🎯🚀🌍🎨🔬📚🎭🎪🌺🦋🌈⚡🎁🏆🎵🎲🔍🏞️☀️🔆🌱]\s+[^?]+\?)/.test(paragraph.trim())

                        if (isHeading && currentSection.length > 0) {
                          sections.push(currentSection)
                          currentSection = [paragraph]
                        } else {
                          currentSection.push(paragraph)
                        }
                      })
                      if (currentSection.length > 0) sections.push(currentSection)

                      return sections.map((section, sectionIndex) => (
                        <div key={sectionIndex}>
                          {section.map((paragraph, paragraphIndex) => {
                            const asteriskMatch = paragraph.trim().match(/^\*\*(.+?)\*\*/)
                            const emojiMatch = paragraph.trim().match(
                              /^([🔥🌿🍖💎🏰🐲📖✨🎉🌟⭐🎯🚀🌍🎨🔬📚🎭🎪🌺🦋🌈⚡🎁🏆🎵🎲🔍🏞️☀️🔆🌱]\s+[^?]+\?)/
                            )
                            const isHeading = asteriskMatch !== null || emojiMatch !== null

                            if (isHeading) {
                              let headingText = ''
                              let remainingContent = ''
                              if (asteriskMatch) {
                                headingText = asteriskMatch[1]
                                remainingContent = paragraph.trim().substring(asteriskMatch[0].length).trim()
                              } else if (emojiMatch) {
                                headingText = emojiMatch[1]
                                remainingContent = paragraph.trim().substring(headingText.length).trim()
                              }
                              return (
                                <div key={paragraphIndex} className="mt-7 mb-2">
                                  <h3 className="text-lg font-extrabold text-gray-900 mb-2">{headingText}</h3>
                                  {remainingContent && (
                                    <p className="text-base sm:text-lg leading-relaxed text-gray-700">{remainingContent}</p>
                                  )}
                                </div>
                              )
                            }

                            return (
                              <p key={paragraphIndex} className="text-base sm:text-lg leading-relaxed text-gray-700">
                                {paragraph}
                              </p>
                            )
                          })}
                        </div>
                      ))
                    })()}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100 mx-6" />

                {/* Quiz section */}
                <div className="px-6 lg:px-10 py-6">

                  {/* Quiz prompt */}
                  {!quiz && !loadingQuiz && (
                    <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-4">
                      <div>
                        <p className="font-bold text-indigo-900">Test your knowledge</p>
                        <p className="text-sm text-indigo-600 mt-0.5">5 questions based on what you just read</p>
                      </div>
                      <button
                        onClick={generateQuiz}
                        className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm flex-shrink-0 ml-4"
                      >
                        Take quiz →
                      </button>
                    </div>
                  )}

                  {/* Quiz loading */}
                  {loadingQuiz && (
                    <div className="text-center py-8">
                      <div className="inline-block w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
                      <p className="text-gray-500 font-medium">Generating questions...</p>
                    </div>
                  )}

                  {/* Quiz questions */}
                  {quiz && !quizSubmitted && (
                    <div>
                      <p className="font-bold text-gray-900 mb-4 text-lg">
                        Quiz — <span className="capitalize">{topic}</span>
                      </p>
                      <div className="space-y-5">
                        {quiz.map((q, qIdx) => (
                          <div key={qIdx} className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <span className="flex-shrink-0 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                {qIdx + 1}
                              </span>
                              <p className="text-sm font-semibold text-gray-800 leading-snug pt-0.5">{q.question}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-10">
                              {(Object.entries(q.options) as [string, string][]).map(([letter, text]) => (
                                <button
                                  key={letter}
                                  onClick={() => setQuizAnswers(prev => ({ ...prev, [qIdx]: letter }))}
                                  className={`px-3 py-2.5 rounded-lg text-left text-sm border-2 transition-all ${
                                    quizAnswers[qIdx] === letter
                                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-semibold shadow-sm'
                                      : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 text-gray-700'
                                  }`}
                                >
                                  <span className="font-bold mr-1.5">{letter}.</span>
                                  {text}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex items-center gap-3">
                        <button
                          onClick={submitQuiz}
                          disabled={Object.keys(quizAnswers).length < quiz.length}
                          className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Submit answers
                        </button>
                        {Object.keys(quizAnswers).length < quiz.length && (
                          <span className="text-xs text-gray-400 font-medium">
                            {Object.keys(quizAnswers).length}/{quiz.length} answered
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quiz results */}
                  {quiz && quizSubmitted && quizScore !== null && (
                    <div>
                      {/* Score reveal */}
                      <div className="animate-score-reveal text-center py-4 mb-6">
                        <div className="text-6xl mb-3">
                          {quizScore >= 4 ? '🎉' : quizScore >= 3 ? '👍' : '💪'}
                        </div>
                        <p className="text-5xl font-black text-gray-900">
                          {quizScore}
                          <span className="text-3xl font-bold text-gray-400">/{quiz.length}</span>
                        </p>
                        <p className="text-lg font-semibold text-gray-600 mt-2">
                          {quizScore >= 4 ? 'Excellent work!' : quizScore >= 3 ? 'Good job!' : 'Keep learning!'}
                        </p>
                        <Link
                          href="/"
                          className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
                        >
                          ← Try another topic
                        </Link>
                      </div>

                      {/* Per-question breakdown */}
                      <div className="space-y-3">
                        {quiz.map((q, qIdx) => {
                          const selected = quizAnswers[qIdx]
                          const isCorrect = selected === q.correct
                          return (
                            <div
                              key={qIdx}
                              className={`p-4 rounded-xl border-2 text-sm ${
                                isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                              }`}
                            >
                              <div className="flex items-start gap-2 mb-2">
                                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                                  isCorrect ? 'bg-green-500 text-white' : 'bg-red-400 text-white'
                                }`}>
                                  {isCorrect ? '✓' : '✗'}
                                </span>
                                <p className="font-semibold text-gray-800 leading-snug">{q.question}</p>
                              </div>
                              <div className="pl-8">
                                {isCorrect ? (
                                  <p className="text-green-700 font-medium">
                                    {q.correct}: {q.options[q.correct as keyof typeof q.options]}
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-red-600">
                                      Your answer — {selected}: {q.options[selected as keyof typeof q.options]}
                                    </p>
                                    <p className="text-green-700 font-medium mt-1">
                                      Correct — {q.correct}: {q.options[q.correct as keyof typeof q.options]}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
