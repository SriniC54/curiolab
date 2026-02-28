import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import analytics from '../lib/analytics'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from '../components/AuthModal'
import { UserProfile } from '../components/UserProfile'

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

interface AudioPlayerProps {
  topic: string
  gradeLevel: number
}

const AudioPlayer = ({ topic, gradeLevel }: AudioPlayerProps) => {
  const { token } = useAuth()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  const generateAudio = async () => {
    // Declare progressInterval outside try block for proper cleanup
    let progressInterval: NodeJS.Timeout | null = null
    
    try {
      setIsLoading(true)
      setError(null)
      setProgress(0)
      
      // Progress milestones with fun messages (for content + audio generation)
      const milestones = [
        { percent: 10, message: "🦉 Understanding the content..." },
        { percent: 25, message: "📖 Researching the topic..." },
        { percent: 40, message: "✍️ Writing the article..." },
        { percent: 55, message: "🎤 Warming up my voice..." },
        { percent: 70, message: "🎵 Adding natural rhythm..." },
        { percent: 85, message: "✨ Adding final touches..." },
        { percent: 100, message: "🎉 Ready to play!" }
      ]
      
      // Simulate progress during the ~20 second generation
      progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = Math.min(prev + 2, 95) // Stop at 95% until actual completion
          const milestone = milestones.find(m => m.percent <= newProgress && m.percent > prev)
          if (milestone) {
            setProgressMessage(milestone.message)
          }
          return newProgress
        })
      }, 400) // Update every 400ms for smooth animation
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-audio`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic,
          grade_level: gradeLevel
        }),
      })

      if (!response.ok) {
        throw new Error(`Audio generation failed: ${response.status}`)
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      const audioElement = new Audio(audioUrl)
      audioElement.addEventListener('ended', () => {
        setIsPlaying(false)
      })
      
      // Complete progress and clean up interval
      if (progressInterval) {
        clearInterval(progressInterval)
      }
      setProgress(100)
      setProgressMessage("🎉 Ready to play!")
      
      setAudio(audioElement)
      return audioElement
    } catch (err) {
      // Clean up progress on error
      if (progressInterval) {
        clearInterval(progressInterval)
      }
      setProgress(0)
      setProgressMessage('')
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate audio'
      
      // Provide more helpful error messages  
      if (errorMessage.includes('404') || errorMessage.includes('Content not found') || errorMessage.includes('Start Learning')) {
        setError('Please generate content first by clicking "🚀 Start Learning!"')
      } else if (errorMessage.includes('500')) {
        setError('Audio generation failed. Please try again.')
      } else {
        setError('Unable to generate audio. Please try again.')
      }
      
      console.error('Audio generation error:', err)
      return null
    } finally {
      setIsLoading(false)
      // Clean up interval if still running
      if (progressInterval) {
        clearInterval(progressInterval)
      }
    }
  }

  const togglePlayback = async () => {
    if (isPlaying && audio) {
      audio.pause()
      setIsPlaying(false)
    } else {
      let audioToPlay = audio
      
      if (!audioToPlay) {
        audioToPlay = await generateAudio()
      }
      
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
        <div className="text-emerald-600 text-sm font-medium animate-fade-in">
          {progressMessage}
        </div>
      )}
      
      {error && (
        <div className="text-red-600 text-sm font-medium">
          {error}
        </div>
      )}
    </div>
  )
}

interface UserProfile {
  name: string
  skill_level: string
  avatar: string
  createdAt: string
}

interface LearningSession {
  id: string
  topic: string
  dimension: string
  skill_level: string
  startedAt: string
  completedAt?: string
  timeSpent?: number
  rating?: 'thumbs_up' | 'thumbs_down'
  wordCount: number
  readabilityScore: number
}

interface TopicCompletion {
  topic: string
  dimensionsCompleted: string[]
  totalDimensions: number
  completedAt: string[]
  isFullyComplete: boolean
}

interface LearningStreak {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string
  streakHistory: string[]
}

interface UserProgress {
  profile: UserProfile
  sessions: LearningSession[]
  totalTimeSpent: number
  topicsExplored: number
  favoriteTopics: string[]
  completedTopics: TopicCompletion[]
  learningStreak: LearningStreak
  createdAt: string
  lastActivity: string
}

export default function Home() {
  // Authentication
  const { user, isAuthenticated, isLoading, logout, token, role } = useAuth()
  const router = useRouter()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [showProfile, setShowProfile] = useState(false)


  // Progress tracking states
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null)
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)

  // Content states
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [content, setContent] = useState<ContentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Quiz states
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  // Track analytics for session start
  useEffect(() => {
    analytics.sessionStarted(!!user, false)
  }, [])

  // Auto-load topic from ?topic= query param (used by student dashboard)
  useEffect(() => {
    const topicParam = router.query.topic as string
    if (topicParam && !selectedTopic) {
      setSelectedTopic(topicParam)
      generateContent(topicParam)
    }
  }, [router.query.topic])


  // Topic completion and streak helper functions
  const updateTopicCompletion = (completedTopics: TopicCompletion[], topic: string, dimension: string): TopicCompletion[] => {
    const today = new Date().toISOString().split('T')[0]
    
    // Find existing topic completion or create new one
    const existingIndex = completedTopics.findIndex(t => t.topic === topic)
    
    if (existingIndex >= 0) {
      const existing = completedTopics[existingIndex]
      
      // Don't add duplicate dimensions
      if (existing.dimensionsCompleted.includes(dimension)) {
        return completedTopics
      }
      
      const updatedCompletion: TopicCompletion = {
        ...existing,
        dimensionsCompleted: [...existing.dimensionsCompleted, dimension],
        completedAt: [...existing.completedAt, today],
        isFullyComplete: existing.dimensionsCompleted.length + 1 >= existing.totalDimensions
      }
      
      const newCompletedTopics = [...completedTopics]
      newCompletedTopics[existingIndex] = updatedCompletion
      return newCompletedTopics
    } else {
      // New topic completion
      const newCompletion: TopicCompletion = {
        topic,
        dimensionsCompleted: [dimension],
        totalDimensions: 5, // Default: Science, History, Geography, Culture, Environment
        completedAt: [today],
        isFullyComplete: false
      }
      
      return [...completedTopics, newCompletion]
    }
  }

  const updateLearningStreak = (currentStreak: LearningStreak): LearningStreak => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    // If already learned today, don't change streak
    if (currentStreak.lastActiveDate === today) {
      return currentStreak
    }
    
    let newCurrentStreak = 1
    let newStreakHistory = [...currentStreak.streakHistory]
    
    // Check if this continues yesterday's streak
    if (currentStreak.lastActiveDate === yesterday) {
      newCurrentStreak = currentStreak.currentStreak + 1
    } else if (currentStreak.lastActiveDate !== '') {
      // Streak was broken, start fresh
      newCurrentStreak = 1
    }
    
    // Add today to history if not already there
    if (!newStreakHistory.includes(today)) {
      newStreakHistory.push(today)
      // Keep only last 30 days
      if (newStreakHistory.length > 30) {
        newStreakHistory = newStreakHistory.slice(-30)
      }
    }
    
    return {
      currentStreak: newCurrentStreak,
      longestStreak: Math.max(currentStreak.longestStreak, newCurrentStreak),
      lastActiveDate: today,
      streakHistory: newStreakHistory
    }
  }

  const getTopicCompletion = (topic: string): TopicCompletion | null => {
    if (!userProgress?.completedTopics) return null
    return userProgress.completedTopics.find(t => t.topic === topic) || null
  }

  const isDimensionCompleted = (topic: string, dimension: string): boolean => {
    const completion = getTopicCompletion(topic)
    return completion ? completion.dimensionsCompleted.includes(dimension) : false
  }

  // Progress tracking functions
  const startLearningSession = (topic: string) => {
    const session: LearningSession = {
      id: Date.now().toString(),
      topic,
      dimension: '',
      skill_level: 'Explorer',
      startedAt: new Date().toISOString(),
      wordCount: 0,
      readabilityScore: 0
    }
    setCurrentSession(session)
  }

  const completeLearningSession = (contentData: ContentResponse) => {
    if (!currentSession) return

    const completedSession: LearningSession = {
      ...currentSession,
      completedAt: new Date().toISOString(),
      timeSpent: Math.floor((Date.now() - new Date(currentSession.startedAt).getTime()) / 1000),
      wordCount: contentData.word_count,
      readabilityScore: contentData.readability_score
    }

    // Update progress (only if user is authenticated)
    if (!user) {
      // If not authenticated, just clear session - don't track progress
      setCurrentSession(null)
      return
    }

    const currentProgress = userProgress || {
      profile: {
        name: user.name || user.email,
        skill_level: 'Explorer',
        avatar: '🧪',
        createdAt: user.created_at || new Date().toISOString()
      },
      sessions: [],
      totalTimeSpent: 0,
      topicsExplored: 0,
      favoriteTopics: [],
      completedTopics: [],
      learningStreak: {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: '',
        streakHistory: []
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }

    const updatedProgress: UserProgress = {
      ...currentProgress,
      sessions: [...currentProgress.sessions, completedSession],
      totalTimeSpent: currentProgress.totalTimeSpent + (completedSession.timeSpent || 0),
      topicsExplored: new Set([...currentProgress.sessions.map(s => s.topic), completedSession.topic]).size,
      completedTopics: updateTopicCompletion(currentProgress.completedTopics, completedSession.topic, completedSession.dimension),
      learningStreak: updateLearningStreak(currentProgress.learningStreak),
      lastActivity: new Date().toISOString()
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('curiolab-progress', JSON.stringify(updatedProgress))
    setCurrentSession(null)
    setShowFeedback(true)
  }


  // Avatar options
  const avatarOptions = ['🎓', '📚', '🧠', '⭐', '🚀', '🎯', '🌟', '🎪', '🎨', '🔬', '🌍', '🎵']

  // Topic suggestions carousel - mix of educational and fun topics
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
    { name: 'Weather', emoji: '⛈️', color: 'from-gray-400 to-blue-500' }
  ]

  const handleTopicSelection = (topic: string) => {
    setSelectedTopic(topic)
    setCustomTopic('')
    generateContent(topic)
    analytics.topicSelected(topic, 'suggestion')
  }

  const handleCustomTopicSubmit = () => {
    const topic = customTopic.trim()
    if (topic.length >= 2) {
      setSelectedTopic(topic)
      generateContent(topic)
      analytics.topicSelected(topic, 'custom')
    }
  }

  const renderContentWithImages = (content: string, images: any[]) => {
    const sections = content.split(/\n\n+/)
    const contentWithImages: JSX.Element[] = []
    let imageIndex = 0

    sections.forEach((section, index) => {
      contentWithImages.push(
        <div key={`section-${index}`} className="mb-6">
          <div className="text-lg leading-7 text-gray-800 whitespace-pre-wrap">
            {section}
          </div>
        </div>
      )

      if (imageIndex < images.length && (index === 1 || index === 3 || index === 5)) {
        const image = images[imageIndex]
        contentWithImages.push(
          <div key={`image-${imageIndex}`} className="my-6 flex justify-center">
            <div className="relative rounded-xl overflow-hidden shadow-md max-w-sm">
              <img 
                src={image.url} 
                alt={image.alt}
                className="w-full h-40 object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-white text-xs font-medium">
                  {image.photographer}
                </p>
              </div>
            </div>
          </div>
        )
        imageIndex++
      }
    })

    return contentWithImages
  }

  const generateContent = async (topicOverride?: string) => {
    const topic = topicOverride || selectedTopic
    if (!topic) return

    setLoading(true)
    setError('')
    setContent(null)
    setQuiz(null)
    setQuizAnswers({})
    setQuizSubmitted(false)
    setQuizScore(null)
    setShowFeedback(false)

    const startTime = Date.now()
    startLearningSession(topic)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-content`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ topic, skill_level: 'Explorer' })
      })

      if (!response.ok) throw new Error('Failed to generate content')

      const data: ContentResponse = await response.json()
      const generationTime = Date.now() - startTime

      setContent(data)
      analytics.contentGenerated(topic, '', 'Explorer', data.word_count, generationTime)

      if (user) {
        completeLearningSession(data)
      }
    } catch (err) {
      setError('Unable to load content. Please try again!')
      setCurrentSession(null)
      analytics.contentGenerationFailed(topic, '', 'Explorer', err instanceof Error ? err.message : 'Unknown error')
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedTopic, content: content.content })
      })

      if (!response.ok) throw new Error('Failed to generate quiz')

      const data = await response.json()
      setQuiz(data.questions)
    } catch (err) {
      console.error('Quiz generation error:', err)
      setError('Failed to generate quiz. Please try again.')
    } finally {
      setLoadingQuiz(false)
    }
  }

  const submitQuiz = async () => {
    if (!quiz) return

    let score = 0
    quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct) score++
    })

    setQuizScore(score)
    setQuizSubmitted(true)

    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/submit-quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ topic: selectedTopic, score, total: quiz.length })
        })
      } catch (err) {
        console.error('Failed to save quiz result:', err)
      }
    }
  }

  const resetToTopicSelection = () => {
    setSelectedTopic('')
    setCustomTopic('')
    setContent(null)
    setError('')
    setShowFeedback(false)
    setQuiz(null)
    setQuizAnswers({})
    setQuizSubmitted(false)
    setQuizScore(null)
  }

  return (
    <>
      <Head>
        <title>🦉 CurioLab - Laboratory of Curiosity for Kids!</title>
        <meta name="description" content="Interactive learning adventures for elementary students" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-cyan-100 to-green-100">

        {/* Header with Authentication */}
        <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">🦉 CurioLab</h1>
              </div>
              <div className="flex items-center space-x-4">
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
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
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setAuthMode('login')
                        setShowAuthModal(true)
                      }}
                      className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setAuthMode('register')
                        setShowAuthModal(true)
                      }}
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

        {/* Authentication Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          defaultMode={authMode}
        />

        {/* User Profile Modal */}
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

        <main className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-10">
            {/* Mobile-First Header Layout */}
            <div className="space-y-6 mb-8">
              {/* CurioLab Title - Top on Mobile, Right on Desktop */}
              <div className="flex justify-center lg:justify-end">
                <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-green-600 to-teal-600 text-center lg:text-right">
                  🔬 CurioLab 🦉
                </h1>
              </div>

            </div>

            {/* Topic Status and Navigation - Moved Lower */}
            <div className="text-center">
              {selectedTopic ? (
                <div className="mb-8">
                  <p className="text-3xl font-bold text-blue-700 mb-6">
                    Let's explore {selectedTopic}! ✨
                  </p>
                  <button
                    onClick={resetToTopicSelection}
                    className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-8 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-lg"
                  >
                    🔄 Pick a Different Topic
                  </button>
                </div>
              ) : (
                <p className="text-3xl font-bold text-blue-700 mb-8">
                  What would you like to learn about? 📚✨
                </p>
              )}
            </div>
          </div>

          <div className="max-w-4xl mx-auto">
            {!selectedTopic ? (
              <div>
                {/* Custom Topic Input */}
                <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-3xl shadow-2xl p-8 mb-8 border-4 border-blue-200">
                  <h2 className="text-4xl font-black mb-6 text-center text-blue-800">
                    🦉 What Do You Want to Learn About? ✨
                  </h2>
                  <div className="flex flex-col items-center gap-4 max-w-2xl mx-auto">
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleCustomTopicSubmit()}
                      placeholder="Type anything: Dragons, Pizza, Robots, Space..."
                      className="w-full px-6 py-4 text-2xl font-bold rounded-full border-4 border-blue-300 focus:border-green-400 focus:outline-none text-center text-blue-800 bg-white shadow-inner"
                    />
                    <button
                      onClick={handleCustomTopicSubmit}
                      disabled={customTopic.trim().length < 2}
                      className="px-8 py-4 bg-gradient-to-r from-green-400 to-blue-500 text-white font-black text-xl rounded-full hover:scale-105 transition-transform shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      🚀 Let's Explore!
                    </button>
                  </div>
                </div>

                {/* Topic Suggestions Carousel */}
                <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8 border-4 border-blue-300">
                  <h2 className="text-3xl font-black mb-6 text-center text-blue-800">
                    💡 Or Pick From These Fun Ideas! 
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                    {topicSuggestions.map((topic, index) => (
                      <button
                        key={index}
                        onClick={() => handleTopicSelection(topic.name)}
                        className={`p-3 lg:p-4 rounded-2xl border-4 transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 bg-gradient-to-br ${topic.color} border-white text-white hover:border-yellow-300 shadow-lg touch-manipulation min-h-[100px] lg:min-h-[120px]`}
                      >
                        <div className="text-3xl lg:text-4xl mb-2">{topic.emoji}</div>
                        <div className="text-base lg:text-lg font-black">{topic.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Error Display */}
            {error && (
              <div className="bg-gradient-to-r from-red-100 to-pink-100 border-4 border-red-300 text-red-800 px-8 py-6 rounded-2xl mb-8 text-xl font-bold text-center animate-shake">
                <span className="text-2xl mr-2">😅</span>
                Oops! {error}
                <span className="text-2xl ml-2">🔧</span>
              </div>
            )}

            {/* Content Panel - shown when a topic is selected */}
            {selectedTopic && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg p-4 lg:p-8 border-2 border-green-200">

                {/* Loading state */}
                {loading && (
                  <div className="text-center py-16">
                    <div className="text-6xl mb-4 animate-bounce">🦉</div>
                    <p className="text-xl font-bold text-blue-600 animate-pulse">
                      Crafting your {selectedTopic} adventure...
                    </p>
                    <p className="text-gray-400 mt-2">This takes about 10 seconds ✨</p>
                  </div>
                )}

                {/* Content display */}
                {content && !loading && (
                  <div>
                    {/* Enhanced Content Display - Scrollable Reading Pane */}
                    <div className="bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-50 rounded-3xl p-8 lg:p-10 shadow-xl border-2 border-emerald-100 max-h-[75vh] overflow-y-auto relative">
                      <div className="mb-6">
                        <h3 className="text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-blue-600 to-purple-600 mb-4 tracking-tight" style={{lineHeight: '1.1'}}>
                          🦉 {selectedTopic}
                        </h3>

                        {/* Audio Player Controls */}
                        <div className="flex items-center justify-center mb-4 p-4 bg-gradient-to-r from-purple-100 via-blue-100 to-emerald-100 rounded-2xl border border-purple-200">
                          <AudioPlayer
                            topic={selectedTopic}
                            gradeLevel={4}
                          />
                        </div>
                      </div>

                      <div className="prose prose-lg max-w-none">
                        <style jsx>{`
                          .prose h1, .prose h2, .prose h3 {
                            color: #1e40af;
                            font-weight: 800;
                            margin-top: 2rem;
                            margin-bottom: 1rem;
                            text-shadow: 0 1px 3px rgba(0,0,0,0.1);
                            font-size: 1.5rem;
                          }
                          .prose p {
                            margin-bottom: 1.5rem;
                            line-height: 1.8;
                            font-size: 1.125rem;
                            color: #374151;
                          }
                          .prose strong {
                            color: #059669;
                            font-weight: 700;
                            background: linear-gradient(120deg, #ecfdf5 0%, #d1fae5 100%);
                            padding: 0.2rem 0.4rem;
                            border-radius: 0.375rem;
                            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                          }
                          .prose {
                            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                          }
                        `}</style>
                        <div className="space-y-8">
                          {(() => {
                            const sections: string[][] = [];
                            const paragraphs = content.content.split('\n\n');
                            let currentSection: string[] = [];

                            paragraphs.forEach((paragraph) => {
                              const isHeading = /^\*\*(.+?)\*\*/.test(paragraph.trim()) || /^([🔥🌿🍖💎🏰🐲📖✨🎉🌟⭐🎯🚀🌍🎨🔬📚🎭🎪🌺🦋🌈⚡🎁🏆🎵🎲🔍🏞️☀️🔆🌱]\s+[^?]+\?)/.test(paragraph.trim());

                              if (isHeading && currentSection.length > 0) {
                                sections.push(currentSection);
                                currentSection = [paragraph];
                              } else {
                                currentSection.push(paragraph);
                              }
                            });

                            if (currentSection.length > 0) sections.push(currentSection);

                            return sections.map((section, sectionIndex) => (
                              <div key={sectionIndex} className="relative p-8 bg-gradient-to-br from-white via-emerald-50/40 to-blue-50/40 rounded-3xl hover:from-emerald-50/60 hover:to-blue-50/60 transition-all duration-500 shadow-lg hover:shadow-xl border-2 border-emerald-100/60 hover:border-emerald-200 group transform hover:-translate-y-1">
                                <div className="absolute top-0 left-0 w-2 h-20 bg-gradient-to-b from-emerald-400 via-blue-400 to-purple-400 rounded-l-3xl group-hover:w-3 transition-all duration-300"></div>
                                <div className="absolute top-4 right-4 text-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-300">🦉</div>

                                <div className="text-gray-800 leading-relaxed relative z-10">
                                  {section.map((paragraph, paragraphIndex) => {
                                    const asteriskHeadingMatch = paragraph.trim().match(/^\*\*(.+?)\*\*/);
                                    const emojiHeadingMatch = paragraph.trim().match(/^([🔥🌿🍖💎🏰🐲📖✨🎉🌟⭐🎯🚀🌍🎨🔬📚🎭🎪🌺🦋🌈⚡🎁🏆🎵🎲🔍🏞️☀️🔆🌱]\s+[^?]+\?)/);
                                    const isHeading = asteriskHeadingMatch !== null || emojiHeadingMatch !== null;

                                    if (isHeading) {
                                      let headingText = '';
                                      let remainingContent = '';

                                      if (asteriskHeadingMatch) {
                                        headingText = asteriskHeadingMatch[1];
                                        remainingContent = paragraph.trim().substring(asteriskHeadingMatch[0].length).trim();
                                      } else if (emojiHeadingMatch) {
                                        headingText = emojiHeadingMatch[1];
                                        remainingContent = paragraph.trim().substring(headingText.length).trim();
                                      }

                                      return (
                                        <div key={paragraphIndex} className="mb-8 mt-2">
                                          <h3 className="text-2xl lg:text-3xl font-black text-emerald-700 tracking-tight pb-2 mb-4 border-b-2 border-emerald-300" style={{fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: '1.3', display: 'block'}}>
                                            {headingText}
                                          </h3>
                                          {remainingContent && (
                                            <p className="text-lg lg:text-xl leading-loose font-normal text-gray-700 mb-4" style={{fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', lineHeight: '1.9'}}>
                                              {remainingContent}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    }

                                    return (
                                      <p key={paragraphIndex} className="text-lg lg:text-xl leading-loose font-normal text-gray-700 mb-6 last:mb-0" style={{fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', lineHeight: '1.9'}}>
                                        {paragraph}
                                      </p>
                                    );
                                  })}
                                </div>

                                <div className="absolute bottom-0 right-0 w-16 h-2 bg-gradient-to-r from-emerald-300 via-blue-300 to-purple-300 rounded-br-3xl opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Quiz Section */}
                    {!quiz && !loadingQuiz && (
                      <div className="mt-8 text-center">
                        <button
                          onClick={generateQuiz}
                          className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-8 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-lg"
                        >
                          🧪 Test Your Knowledge!
                        </button>
                        <p className="text-gray-400 text-sm mt-2">5 quick questions about what you just read</p>
                      </div>
                    )}

                    {loadingQuiz && (
                      <div className="mt-8 text-center py-8">
                        <div className="text-4xl mb-3 animate-bounce">🤔</div>
                        <p className="text-purple-600 font-bold animate-pulse">Generating quiz questions...</p>
                      </div>
                    )}

                    {quiz && (
                      <div className="mt-8">
                        <h3 className="text-2xl font-bold text-purple-700 mb-6 text-center">
                          🧪 Quiz: {selectedTopic}
                        </h3>

                        {!quizSubmitted ? (
                          <>
                            <div className="space-y-6">
                              {quiz.map((q, qIdx) => (
                                <div key={qIdx} className="bg-white rounded-xl p-6 shadow-sm border-2 border-purple-100">
                                  <p className="font-bold text-gray-800 mb-4 text-lg">
                                    {qIdx + 1}. {q.question}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {(Object.entries(q.options) as [string, string][]).map(([letter, text]) => (
                                      <button
                                        key={letter}
                                        onClick={() => setQuizAnswers(prev => ({ ...prev, [qIdx]: letter }))}
                                        className={`p-3 rounded-lg text-left border-2 transition-all ${
                                          quizAnswers[qIdx] === letter
                                            ? 'border-purple-500 bg-purple-50 font-bold text-purple-800'
                                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                                        }`}
                                      >
                                        <span className="font-bold mr-2">{letter}.</span>{text}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-6 text-center">
                              <button
                                onClick={submitQuiz}
                                disabled={Object.keys(quizAnswers).length < quiz.length}
                                className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                              >
                                Submit Answers ✓
                              </button>
                              {Object.keys(quizAnswers).length < quiz.length && (
                                <p className="mt-2 text-sm text-gray-500">
                                  Answer all {quiz.length} questions to submit ({Object.keys(quizAnswers).length}/{quiz.length} answered)
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="text-center mb-8 p-6 bg-white rounded-xl shadow-sm border-2 border-purple-100">
                              <div className="text-5xl mb-3">
                                {quizScore !== null && quizScore >= 4 ? '🎉' : quizScore !== null && quizScore >= 3 ? '👍' : '💪'}
                              </div>
                              <h4 className="text-3xl font-black text-gray-800 mb-2">
                                You got {quizScore}/{quiz.length} right!
                              </h4>
                              <p className="text-gray-600 text-lg">
                                {quizScore !== null && quizScore >= 4
                                  ? 'Amazing! You really know your stuff!'
                                  : quizScore !== null && quizScore >= 3
                                  ? 'Great work! Keep exploring!'
                                  : 'Keep learning! You\'ll do better next time!'}
                              </p>
                            </div>

                            <div className="space-y-4">
                              {quiz.map((q, qIdx) => {
                                const selected = quizAnswers[qIdx]
                                const isCorrect = selected === q.correct
                                return (
                                  <div key={qIdx} className={`p-4 rounded-xl border-2 ${isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                                    <p className="font-bold mb-2">{qIdx + 1}. {q.question}</p>
                                    {isCorrect ? (
                                      <p className="text-sm text-green-700">✓ Correct! {q.correct}: {q.options[q.correct as keyof typeof q.options]}</p>
                                    ) : (
                                      <>
                                        <p className="text-sm text-red-700">✗ You chose {selected}: {q.options[selected as keyof typeof q.options]}</p>
                                        <p className="text-sm text-green-700 mt-1">✓ Correct: {q.correct}: {q.options[q.correct as keyof typeof q.options]}</p>
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
                )}
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  )
}
