import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../../contexts/AuthContext'
import { AuthModal } from '../../components/AuthModal'
import AudioPlayer from '../../components/AudioPlayer'

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
}

interface QuizQuestion {
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct: string
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

  const [visible, setVisible] = useState(false)

  const topic = router.query.topic as string

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

  const displayTopic = topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : ''

  return (
    <>
      <Head>
        <title>{displayTopic ? `${displayTopic} — CurioLab` : 'CurioLab'}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div
        className={`min-h-screen bg-gradient-to-br from-blue-100 via-cyan-100 to-green-100 transition-opacity duration-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                🦉 CurioLab
              </Link>
              <div className="flex items-center space-x-4">
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                ) : isAuthenticated ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700">Hi, {user?.name || user?.email}!</span>
                    {role === 'teacher' ? (
                      <Link
                        href="/teacher-dashboard"
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors"
                      >
                        Teacher Dashboard
                      </Link>
                    ) : (
                      <Link
                        href="/student-dashboard"
                        className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                      >
                        My Assignments
                      </Link>
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

        <main className="container mx-auto px-4 py-8">
          <div className="max-w-3xl mx-auto">

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-4">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"
              >
                ← All topics
              </Link>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-medium text-gray-700 capitalize">{topic}</span>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Content card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">

              {/* Loading */}
              {loading && (
                <div className="text-center py-20">
                  <div className="text-5xl mb-4 animate-bounce">🦉</div>
                  <p className="text-lg font-semibold text-gray-600">
                    Loading <span className="capitalize">{topic}</span>...
                  </p>
                  <p className="text-sm text-gray-400 mt-1">Usually takes about 10 seconds</p>
                </div>
              )}

              {/* Article + quiz */}
              {content && !loading && (
                <div>
                  {/* Article */}
                  <div className="px-6 lg:px-10 py-8 max-h-[72vh] overflow-y-auto">
                    <div className="mb-6 pb-4 border-b border-gray-100">
                      <h2 className="text-2xl lg:text-3xl font-black text-gray-900 capitalize mb-3">
                        {topic}
                      </h2>
                      <AudioPlayer topic={topic} content={content.content} />
                    </div>

                    <div className="space-y-6">
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
                          <div key={sectionIndex} className="mb-2">
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
                                  <div key={paragraphIndex} className="mt-6 mb-2">
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">{headingText}</h3>
                                    {remainingContent && (
                                      <p className="text-base leading-relaxed text-gray-700">{remainingContent}</p>
                                    )}
                                  </div>
                                )
                              }

                              return (
                                <p key={paragraphIndex} className="text-base leading-relaxed text-gray-700">
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

                    {!quiz && !loadingQuiz && (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">Test your knowledge</p>
                          <p className="text-sm text-gray-400">5 questions based on what you just read</p>
                        </div>
                        <button
                          onClick={generateQuiz}
                          className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors text-sm"
                        >
                          Take quiz →
                        </button>
                      </div>
                    )}

                    {loadingQuiz && (
                      <div className="text-center py-6">
                        <p className="text-gray-500 animate-pulse">Generating questions...</p>
                      </div>
                    )}

                    {quiz && (
                      <div>
                        {!quizSubmitted ? (
                          <>
                            <p className="font-semibold text-gray-800 mb-4">
                              Quiz — <span className="capitalize">{topic}</span>
                            </p>
                            <div className="space-y-5">
                              {quiz.map((q, qIdx) => (
                                <div key={qIdx}>
                                  <p className="text-sm font-semibold text-gray-800 mb-2">
                                    {qIdx + 1}. {q.question}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(Object.entries(q.options) as [string, string][]).map(([letter, text]) => (
                                      <button
                                        key={letter}
                                        onClick={() =>
                                          setQuizAnswers(prev => ({ ...prev, [qIdx]: letter }))
                                        }
                                        className={`px-3 py-2 rounded-lg text-left text-sm border transition-colors ${
                                          quizAnswers[qIdx] === letter
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-semibold'
                                            : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700'
                                        }`}
                                      >
                                        <span className="font-bold mr-1">{letter}.</span>
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
                                className="px-5 py-2 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Submit answers
                              </button>
                              {Object.keys(quizAnswers).length < quiz.length && (
                                <span className="text-xs text-gray-400">
                                  {Object.keys(quizAnswers).length}/{quiz.length} answered
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="flex items-center gap-3 mb-5 p-4 bg-gray-50 rounded-xl">
                              <span className="text-3xl">
                                {quizScore !== null && quizScore >= 4
                                  ? '🎉'
                                  : quizScore !== null && quizScore >= 3
                                  ? '👍'
                                  : '💪'}
                              </span>
                              <div>
                                <p className="font-bold text-gray-900 text-lg">
                                  {quizScore}/{quiz.length} correct
                                </p>
                                <p className="text-sm text-gray-500">
                                  {quizScore !== null && quizScore >= 4
                                    ? 'Excellent work!'
                                    : quizScore !== null && quizScore >= 3
                                    ? 'Good job!'
                                    : 'Keep learning!'}
                                </p>
                              </div>
                              <div className="ml-auto">
                                <Link
                                  href="/"
                                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  ← Try another topic
                                </Link>
                              </div>
                            </div>
                            <div className="space-y-3">
                              {quiz.map((q, qIdx) => {
                                const selected = quizAnswers[qIdx]
                                const isCorrect = selected === q.correct
                                return (
                                  <div
                                    key={qIdx}
                                    className={`p-3 rounded-lg border text-sm ${
                                      isCorrect
                                        ? 'border-green-200 bg-green-50'
                                        : 'border-red-200 bg-red-50'
                                    }`}
                                  >
                                    <p className="font-semibold text-gray-800 mb-1">
                                      {qIdx + 1}. {q.question}
                                    </p>
                                    {isCorrect ? (
                                      <p className="text-green-700">
                                        ✓ {q.correct}: {q.options[q.correct as keyof typeof q.options]}
                                      </p>
                                    ) : (
                                      <>
                                        <p className="text-red-600">
                                          ✗ You chose {selected}:{' '}
                                          {q.options[selected as keyof typeof q.options]}
                                        </p>
                                        <p className="text-green-700 mt-0.5">
                                          ✓ {q.correct}: {q.options[q.correct as keyof typeof q.options]}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
