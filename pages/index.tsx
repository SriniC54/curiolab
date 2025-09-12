import { useState, useEffect } from 'react'
import Head from 'next/head'

interface ContentResponse {
  topic: string
  dimension: string
  grade_level: number
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

interface UserProfile {
  name: string
  grade: number
  avatar: string
  createdAt: string
}

interface LearningSession {
  id: string
  topic: string
  dimension: string
  grade: number
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
  // Profile states
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [showProfileSetup, setShowProfileSetup] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    grade: 4,
    avatar: '🎓'
  })

  // Progress tracking states
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null)
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)

  // Existing states
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [availableDimensions, setAvailableDimensions] = useState<any[]>([])
  const [selectedDimension, setSelectedDimension] = useState('')
  const [selectedGrade, setSelectedGrade] = useState(4)
  const [content, setContent] = useState<ContentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDimensions, setLoadingDimensions] = useState(false)
  const [error, setError] = useState('')

  // Load profile and progress from localStorage on mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('curiolab-profile')
    if (savedProfile) {
      const profile = JSON.parse(savedProfile)
      setUserProfile(profile)
      setSelectedGrade(profile.grade) // Use profile grade as default
    }

    const savedProgress = localStorage.getItem('curiolab-progress')
    if (savedProgress) {
      const progress = JSON.parse(savedProgress)
      setUserProgress(progress)
    }
    // No longer auto-show profile setup - let users explore first
  }, [])

  // Profile functions
  const createProfile = () => {
    if (profileForm.name.trim().length < 2) {
      setError('Name must be at least 2 characters long')
      return
    }

    const newProfile: UserProfile = {
      name: profileForm.name.trim(),
      grade: profileForm.grade,
      avatar: profileForm.avatar,
      createdAt: new Date().toISOString()
    }

    localStorage.setItem('curiolab-profile', JSON.stringify(newProfile))
    setUserProfile(newProfile)
    setSelectedGrade(newProfile.grade)
    setShowProfileSetup(false)
    setError('')
  }

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!userProfile) return
    
    const updatedProfile = { ...userProfile, ...updates }
    localStorage.setItem('curiolab-profile', JSON.stringify(updatedProfile))
    setUserProfile(updatedProfile)
    if (updates.grade) {
      setSelectedGrade(updates.grade)
    }
  }

  const resetProfile = () => {
    localStorage.removeItem('curiolab-profile')
    localStorage.removeItem('curiolab-progress')
    setUserProfile(null)
    setUserProgress(null)
    setShowProfileSetup(true)
    // Reset all states
    setSelectedTopic('')
    setCustomTopic('')
    setAvailableDimensions([])
    setSelectedDimension('')
    setContent(null)
    setError('')
  }

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
  const startLearningSession = (topic: string, dimension: string, grade: number) => {
    const session: LearningSession = {
      id: Date.now().toString(),
      topic,
      dimension,
      grade,
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

    // Update progress (only if user has a profile)
    if (!userProfile) {
      // If no profile, just clear session - don't track progress
      setCurrentSession(null)
      return
    }

    const currentProgress = userProgress || {
      profile: userProfile,
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

  const submitFeedback = (rating: 'thumbs_up' | 'thumbs_down') => {
    // If user has no profile, show login prompt instead
    if (!userProfile) {
      setShowFeedback(false)
      setShowProfileSetup(true)
      return
    }

    // If user has profile, save feedback normally
    if (!userProgress || userProgress.sessions.length === 0) return

    const updatedSessions = [...userProgress.sessions]
    const lastSessionIndex = updatedSessions.length - 1
    updatedSessions[lastSessionIndex] = {
      ...updatedSessions[lastSessionIndex],
      rating
    }

    const updatedProgress = {
      ...userProgress,
      sessions: updatedSessions
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('curiolab-progress', JSON.stringify(updatedProgress))
    setShowFeedback(false)
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

  const generateDimensionsForTopic = async (topic: string) => {
    setLoadingDimensions(true)
    setError('')
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-dimensions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic: topic })
      })

      if (!response.ok) {
        throw new Error('Failed to generate dimensions')
      }

      const data = await response.json()
      const dimensionObjects = data.dimensions.map((dim: string, index: number) => ({
        id: dim.toLowerCase(),
        name: dim,
        emoji: ['🔬', '🌍', '📜', '🎨', '🌱'][index] || '📚',
        description: `Explore ${topic} from the ${dim.toLowerCase()} perspective`
      }))
      
      setAvailableDimensions(dimensionObjects)
      setSelectedDimension(dimensionObjects[0]?.name || '')
    } catch (err) {
      console.error('Dimension generation error:', err)
      setError(`Unable to generate learning dimensions. Please try again! (${err instanceof Error ? err.message : 'Unknown error'})`)
    } finally {
      setLoadingDimensions(false)
    }
  }

  const handleTopicSelection = (topic: string) => {
    setSelectedTopic(topic)
    setCustomTopic('')
    generateDimensionsForTopic(topic)
  }

  const handleCustomTopicSubmit = () => {
    if (customTopic.trim().length >= 2) {
      setSelectedTopic(customTopic.trim())
      generateDimensionsForTopic(customTopic.trim())
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

  const generateContent = async () => {
    setLoading(true)
    setError('')
    setShowFeedback(false) // Reset feedback state for new content generation
    
    // Start tracking learning session
    startLearningSession(selectedTopic, selectedDimension, selectedGrade)
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generate-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: selectedTopic,
          dimension: selectedDimension,
          grade_level: selectedGrade
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate content')
      }

      const data: ContentResponse = await response.json()
      setContent(data)
      
      // Complete learning session and show feedback for all users
      if (userProfile) {
        completeLearningSession(data)
      } else {
        // Show feedback for anonymous users too
        setShowFeedback(true)
      }
    } catch (err) {
      setError('Unable to load content. Please try again!')
      setCurrentSession(null) // Clear session on error
    } finally {
      setLoading(false)
    }
  }

  const resetToTopicSelection = () => {
    setSelectedTopic('')
    setCustomTopic('')
    setAvailableDimensions([])
    setSelectedDimension('')
    setContent(null)
    setError('')
    setShowFeedback(false) // Reset feedback when going back to topic selection
  }

  return (
    <>
      <Head>
        <title>CurioLab - Laboratory of Curiosity for Kids!</title>
        <meta name="description" content="Interactive learning adventures for elementary students" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-cyan-100 to-green-100">

        {/* Profile Setup/Settings Modal */}
        {showProfileSetup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-4 lg:p-8 max-h-[95vh] overflow-y-auto">
              {userProfile ? (
                // Settings for existing users
                <div>
                  <div className="text-center mb-6">
                    <h2 className="text-4xl font-black text-blue-700 mb-2">
                      Your Learning Dashboard 📊
                    </h2>
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <div className="text-4xl">{userProfile.avatar}</div>
                      <div className="text-left">
                        <h3 className="font-bold text-blue-700 text-xl">{userProfile.name}</h3>
                        <p className="text-gray-600">Grade {userProfile.grade} Explorer</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Stats */}
                  {userProgress && userProgress.sessions.length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-6 mb-6">
                      <h3 className="font-bold text-blue-700 mb-4 text-center">Your Achievements</h3>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-2xl font-bold text-blue-600">{userProgress.topicsExplored}</div>
                          <div className="text-sm text-gray-600">Topics Explored</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-2xl font-bold text-green-600">{Math.floor(userProgress.totalTimeSpent / 60)}</div>
                          <div className="text-sm text-gray-600">Minutes Learning</div>
                        </div>
                        {userProgress.learningStreak.currentStreak > 0 && (
                          <>
                            <div className="bg-white rounded-lg p-3">
                              <div className="text-2xl font-bold text-orange-600">{userProgress.learningStreak.currentStreak}</div>
                              <div className="text-sm text-gray-600">Current Streak</div>
                            </div>
                            <div className="bg-white rounded-lg p-3">
                              <div className="text-2xl font-bold text-purple-600">{userProgress.learningStreak.longestStreak}</div>
                              <div className="text-sm text-gray-600">Best Streak</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-4">
                    <button
                      onClick={resetProfile}
                      className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-lg"
                    >
                      🚪 Logout & Reset Progress
                    </button>
                    
                    <button
                      onClick={() => setShowProfileSetup(false)}
                      className="w-full bg-gray-100 text-gray-700 py-3 rounded-full font-medium hover:bg-gray-200 transition-colors"
                    >
                      Continue Learning
                    </button>
                  </div>
                </div>
              ) : (
                // Create profile for new users
                <div>
                  <div className="text-center mb-6">
                    <h2 className="text-4xl font-black text-blue-700 mb-2">
                      Unlock Your Learning Journey! 🚀
                    </h2>
                    <p className="text-gray-600 mb-4">Create a profile to supercharge your experience</p>
                    
                    {/* Benefits */}
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 mb-4 text-left">
                      <h3 className="font-bold text-blue-700 mb-2">Why create a profile?</h3>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="text-green-500">📊</span>
                          <span>Track your learning progress and time spent</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500">⭐</span>
                          <span>Save your favorite topics and come back anytime</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-purple-500">🔥</span>
                          <span>Build learning streaks and earn achievements</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-500">🎯</span>
                          <span>Get personalized content recommendations</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Name Input */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        What's your name?
                      </label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({...profileForm, name: e.target.value})}
                        placeholder="Enter your name..."
                        className="w-full px-4 py-3 border-2 border-blue-300 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                      />
                    </div>

                    {/* Grade Selection */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        What grade are you in?
                      </label>
                      <div className="flex gap-2 lg:gap-3">
                        {[3, 4, 5].map((grade) => (
                          <button
                            key={grade}
                            onClick={() => setProfileForm({...profileForm, grade})}
                            className={`flex-1 py-3 rounded-xl font-bold text-base lg:text-lg transition-all touch-manipulation min-h-[48px] ${
                              profileForm.grade === grade
                                ? 'bg-green-500 text-white shadow-lg scale-105'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                            }`}
                          >
                            Grade {grade}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Avatar Selection */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Choose your avatar
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {avatarOptions.map((avatar) => (
                          <button
                            key={avatar}
                            onClick={() => setProfileForm({...profileForm, avatar})}
                            className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl text-2xl lg:text-3xl transition-all touch-manipulation ${
                              profileForm.avatar === avatar
                                ? 'bg-blue-200 scale-110 shadow-lg'
                                : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                            }`}
                          >
                            {avatar}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Create Profile Button */}
                    <button
                      onClick={createProfile}
                      disabled={profileForm.name.trim().length < 2}
                      className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg mb-3"
                    >
                      🚀 Start Learning Adventure!
                    </button>

                    {/* Dismiss Option */}
                    <button
                      onClick={() => setShowProfileSetup(false)}
                      className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm font-medium transition-colors"
                    >
                      Continue exploring without profile
                    </button>
                  </div>
                </div>
              )}
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
                  🔬 CurioLab 🌟
                </h1>
              </div>

              {/* Profile Section - Full Width on Mobile */}
              <div className="w-full">
                {userProfile ? (
                  <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6 w-full">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="text-3xl md:text-4xl flex-shrink-0">{userProfile.avatar}</div>
                      <div className="text-left flex-1 min-w-0">
                        <h3 className="font-bold text-blue-700 text-xl md:text-2xl truncate">
                          Hi {userProfile.name}! 👋
                        </h3>
                        <p className="text-gray-600 text-base md:text-lg">Grade {userProfile.grade} Explorer</p>
                        {userProgress && userProgress.sessions.length > 0 && (
                          <div className="text-xs md:text-sm text-green-600 mt-2 space-y-1">
                            <div>📚 {userProgress.topicsExplored} topics • ⏱️ {Math.floor(userProgress.totalTimeSpent / 60)}min</div>
                            {userProgress.learningStreak.currentStreak > 0 && (
                              <div className="font-bold">🔥 {userProgress.learningStreak.currentStreak} day streak!</div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setShowProfileSetup(true)}
                        className="text-gray-400 hover:text-gray-600 text-lg md:text-xl p-2 flex-shrink-0"
                        title="Settings"
                      >
                        ⚙️
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-blue-100 to-green-100 rounded-2xl shadow-lg p-4 md:p-6 border-2 border-blue-200 w-full">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="text-3xl md:text-4xl flex-shrink-0">👤</div>
                      <div className="text-left flex-1 min-w-0">
                        <h3 className="font-bold text-blue-700 text-xl md:text-2xl">
                          Welcome to CurioLab! 
                        </h3>
                        <p className="text-gray-600 text-sm md:text-lg">Create a profile to track your progress and build streaks</p>
                      </div>
                      <button
                        onClick={() => setShowProfileSetup(true)}
                        className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 md:px-8 md:py-3 rounded-full font-bold text-sm md:text-lg hover:scale-105 transition-transform shadow-md flex-shrink-0"
                      >
                        🚀 Create
                      </button>
                    </div>
                  </div>
                )}
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
                    ✨ What Do You Want to Learn About? ✨
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

            {/* Mobile-Responsive Layout: Stack on Mobile, Side-by-Side on Desktop */}
            {selectedTopic && availableDimensions.length > 0 && (
              <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-6 min-h-screen">
                {/* Dimensions Panel - Top on Mobile, Left on Desktop */}
                <div className="lg:col-span-4 xl:col-span-3 bg-gradient-to-br from-blue-50 to-cyan-100 rounded-2xl shadow-lg p-4 lg:p-6 lg:h-fit lg:sticky lg:top-6 border-2 border-blue-200">
                  <h3 className="text-2xl font-bold text-blue-700 mb-4">
                    📚 {selectedTopic}
                  </h3>
                  
                  {/* Topic Progress for Logged-in Users */}
                  {userProfile && (() => {
                    const completion = getTopicCompletion(selectedTopic)
                    const completedCount = completion ? completion.dimensionsCompleted.length : 0
                    const totalCount = availableDimensions.length || 5
                    const progressPercent = (completedCount / totalCount) * 100
                    
                    if (completedCount > 0) {
                      return (
                        <div className="mb-4 p-3 bg-white rounded-xl shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-600">Topic Progress</span>
                            <span className="text-sm font-bold text-blue-600">
                              {completedCount}/{totalCount} dimensions
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>
                          {completion?.isFullyComplete && (
                            <div className="mt-2 text-center">
                              <span className="text-sm font-bold text-green-600">
                                🎉 Topic Complete! Great job exploring {selectedTopic}!
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    }
                    return null
                  })()}
                  
                  <p className="text-gray-600 mb-6">Choose how you want to explore:</p>
                  
                  <div className="space-y-2 lg:space-y-3">
                    {availableDimensions.map((dimension, index) => {
                      const isCompleted = userProfile ? isDimensionCompleted(selectedTopic, dimension.name) : false
                      const isSelected = selectedDimension === dimension.name
                      
                      return (
                        <button
                          key={index}
                          onClick={() => {
                            setSelectedDimension(dimension.name)
                            setContent(null) // Clear current content when selecting new dimension
                            setShowFeedback(false) // Reset feedback when switching dimensions
                          }}
                          disabled={loading}
                          className={`w-full text-left p-3 lg:p-4 rounded-xl border-2 transition-all duration-200 disabled:opacity-50 relative touch-manipulation min-h-[60px] lg:min-h-[auto] ${
                            isSelected
                              ? (isCompleted 
                                  ? 'border-green-600 bg-gradient-to-r from-green-100 to-green-200 shadow-lg transform scale-105 ring-2 ring-green-300' 
                                  : 'border-blue-600 bg-gradient-to-r from-blue-100 to-blue-200 shadow-lg transform scale-105 ring-2 ring-blue-300')
                              : (isCompleted 
                                  ? 'border-green-300 bg-gradient-to-r from-green-50 to-green-100 hover:border-green-400 active:bg-green-200' 
                                  : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100')
                          }`}
                        >
                          <div className={`font-bold text-base lg:text-lg flex items-center justify-between ${
                            isCompleted ? 'text-green-700' : 'text-blue-700'
                          }`}>
                            <span>{dimension.emoji} {dimension.name}</span>
                            {isCompleted && (
                              <span className="text-green-600 text-lg">✅</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">{dimension.description}</div>
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={resetToTopicSelection}
                    className="w-full mt-6 p-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                  >
                    ← Back to Topics
                  </button>
                </div>

                {/* Content Panel - Bottom on Mobile, Right on Desktop */}
                <div className="lg:col-span-8 xl:col-span-9 bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg p-4 lg:p-8 border-2 border-green-200 flex flex-col">
                  {selectedDimension ? (
                    <div className="flex flex-col h-full">
                      <h2 className="text-3xl font-bold text-green-700 mb-6">
                        🌟 {selectedTopic} - {selectedDimension}
                      </h2>
                      
                      {/* Grade Selection - Always Visible */}
                      <div className="mb-6 lg:mb-8">
                        <p className="text-base lg:text-lg text-gray-600 mb-3 lg:mb-4">Pick your grade level:</p>
                        <div className="flex gap-2 lg:gap-4">
                          {[3, 4, 5].map((grade) => (
                            <button
                              key={grade}
                              onClick={() => {
                                setSelectedGrade(grade)
                                if (content) {
                                  setContent(null) // Clear content to allow re-generation with new grade
                                  setShowFeedback(false) // Reset feedback when changing grade
                                }
                              }}
                              className={`flex-1 px-4 py-3 lg:px-6 lg:py-4 rounded-xl font-bold text-base lg:text-lg transition-all touch-manipulation min-h-[48px] ${
                                selectedGrade === grade
                                  ? 'bg-green-500 text-white shadow-lg scale-105'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                              }`}
                            >
                              Grade {grade}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action Button */}
                      {selectedGrade && !content && (
                        <button
                          onClick={generateContent}
                          disabled={loading}
                          className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-8 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform disabled:opacity-50 shadow-lg mb-8"
                        >
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="animate-spin">🎡</span>
                              Crafting your {selectedTopic} adventure...
                              <span className="animate-bounce">✨</span>
                            </span>
                          ) : (
                            '🚀 Start Learning!'
                          )}
                        </button>
                      )}
                      
                      {/* Content Status */}
                      {content && (
                        <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border-l-4 border-green-500">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-green-700 text-lg">
                                📖 {selectedTopic} - {selectedDimension} (Grade {content.grade_level})
                              </h4>
                            </div>
                            <button
                              onClick={() => setContent(null)}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                            >
                              🔄 Generate New
                            </button>
                          </div>
                        </div>
                      )}

                      {content && (
                        <div>
                          {/* Content Display */}
                          <div className="bg-white rounded-xl p-4 lg:p-8 shadow-sm flex-1 overflow-y-auto">
                            <div className="prose prose-base lg:prose-lg max-w-none text-gray-900 leading-relaxed whitespace-pre-wrap">
                              <style jsx>{`
                                .prose h1, .prose h2, .prose h3 {
                                  color: #1e40af;
                                  font-weight: bold;
                                  margin-top: 1.5rem;
                                  margin-bottom: 1rem;
                                }
                                .prose p {
                                  margin-bottom: 1.25rem;
                                  line-height: 1.75;
                                }
                                .prose strong {
                                  color: #065f46;
                                  font-weight: 700;
                                }
                              `}</style>
                              {content.content}
                            </div>

                            {/* Feedback Buttons - Bottom of Content */}
                            {showFeedback && (
                              <div className="mt-6 lg:mt-8 pt-4 lg:pt-6 border-t-2 border-gray-100">
                                <div className="text-center">
                                  <h3 className="text-lg lg:text-xl font-bold text-blue-700 mb-4">
                                    🎉 How was learning about {selectedTopic}?
                                  </h3>
                                  
                                  <div className="flex justify-center gap-3 lg:gap-4">
                                    <button
                                      onClick={() => submitFeedback('thumbs_up')}
                                      className="flex flex-col items-center p-3 lg:p-4 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300 active:bg-green-200 transition-all duration-200 hover:scale-105 min-w-[100px] lg:min-w-[120px] touch-manipulation"
                                    >
                                      <div className="text-3xl lg:text-4xl mb-2">👍</div>
                                      <div className="text-xs lg:text-sm font-bold text-green-700">Loved it!</div>
                                    </button>

                                    <button
                                      onClick={() => submitFeedback('thumbs_down')}
                                      className="flex flex-col items-center p-3 lg:p-4 rounded-2xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 active:bg-orange-200 transition-all duration-200 hover:scale-105 min-w-[100px] lg:min-w-[120px] touch-manipulation"
                                    >
                                      <div className="text-3xl lg:text-4xl mb-2">👎</div>
                                      <div className="text-xs lg:text-sm font-bold text-orange-700">Not for me</div>
                                    </button>
                                  </div>

                                  <button
                                    onClick={() => setShowFeedback(false)}
                                    className="mt-3 text-gray-400 hover:text-gray-600 text-sm p-2 touch-manipulation"
                                  >
                                    Skip feedback
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📖</div>
                      <h3 className="text-2xl font-bold text-gray-500 mb-2">Choose a Learning Path</h3>
                      <p className="text-gray-400">Select a dimension from the left to get started</p>
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