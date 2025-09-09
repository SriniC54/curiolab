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

export default function Home() {
  // Profile states
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [showProfileSetup, setShowProfileSetup] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    grade: 4,
    avatar: '🎓'
  })

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

  // Load profile from localStorage on mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('curiolab-profile')
    if (savedProfile) {
      const profile = JSON.parse(savedProfile)
      setUserProfile(profile)
      setSelectedGrade(profile.grade) // Use profile grade as default
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
    setUserProfile(null)
    setShowProfileSetup(true)
    // Reset all states
    setSelectedTopic('')
    setCustomTopic('')
    setAvailableDimensions([])
    setSelectedDimension('')
    setContent(null)
    setError('')
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
      setError(`Unable to generate learning dimensions. Please try again! (${err.message || 'Unknown error'})`)
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
    const contentWithImages = []
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
    } catch (err) {
      setError('Unable to load content. Please try again!')
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
  }

  return (
    <>
      <Head>
        <title>CurioLab - Laboratory of Curiosity for Kids!</title>
        <meta name="description" content="Interactive learning adventures for elementary students" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-cyan-100 to-green-100">
        {/* Profile Setup Modal */}
        {showProfileSetup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
              <div className="text-center mb-6">
                <h2 className="text-4xl font-black text-blue-700 mb-2">
                  Welcome to CurioLab! 🔬
                </h2>
                <p className="text-gray-600">Let's create your learning profile</p>
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
                  <div className="flex gap-3">
                    {[3, 4, 5].map((grade) => (
                      <button
                        key={grade}
                        onClick={() => setProfileForm({...profileForm, grade})}
                        className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${
                          profileForm.grade === grade
                            ? 'bg-green-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                        className={`w-12 h-12 rounded-xl text-2xl transition-all ${
                          profileForm.avatar === avatar
                            ? 'bg-blue-200 scale-110 shadow-lg'
                            : 'bg-gray-100 hover:bg-gray-200'
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
                  className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  🚀 Start Learning Adventure!
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="text-center mb-10">
            {/* Profile Section - Always Visible */}
            <div className="flex justify-center mb-6">
              {userProfile ? (
                <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center gap-4">
                  <div className="text-3xl">{userProfile.avatar}</div>
                  <div className="text-left">
                    <h3 className="font-bold text-blue-700 text-lg">
                      Hi {userProfile.name}! 👋
                    </h3>
                    <p className="text-gray-600 text-sm">Grade {userProfile.grade} Explorer</p>
                  </div>
                  <button
                    onClick={() => setShowProfileSetup(true)}
                    className="ml-4 text-gray-400 hover:text-gray-600 text-sm"
                    title="Edit Profile"
                  >
                    ⚙️
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-blue-100 to-green-100 rounded-2xl shadow-lg p-4 border-2 border-blue-200">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">👤</div>
                    <div className="text-left">
                      <h3 className="font-bold text-blue-700 text-lg">
                        Welcome to CurioLab! 
                      </h3>
                      <p className="text-gray-600 text-sm">Create a profile to track your learning progress</p>
                    </div>
                    <button
                      onClick={() => setShowProfileSetup(true)}
                      className="ml-4 bg-gradient-to-r from-blue-500 to-green-500 text-white px-6 py-2 rounded-full font-bold text-sm hover:scale-105 transition-transform shadow-md"
                    >
                      🚀 Create Profile
                    </button>
                  </div>
                </div>
              )}
            </div>

            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-green-600 to-teal-600 mb-4">
              🔬 CurioLab 🌟
            </h1>
            {selectedTopic ? (
              <div>
                <p className="text-2xl font-bold text-blue-700 mb-6">
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
              <p className="text-2xl font-bold text-blue-700">
                What would you like to learn about? 📚✨
              </p>
            )}
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
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {topicSuggestions.map((topic, index) => (
                      <button
                        key={index}
                        onClick={() => handleTopicSelection(topic.name)}
                        className={`p-4 rounded-2xl border-4 transition-all duration-200 hover:scale-105 hover:shadow-xl bg-gradient-to-br ${topic.color} border-white text-white hover:border-yellow-300 shadow-lg`}
                      >
                        <div className="text-4xl mb-2">{topic.emoji}</div>
                        <div className="text-lg font-black">{topic.name}</div>
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

            {/* Two-Panel Layout: Dimensions Left, Content Right */}
            {selectedTopic && availableDimensions.length > 0 && (
              <div className="grid grid-cols-12 gap-6 min-h-screen">
                {/* Left Panel - Dimensions */}
                <div className="col-span-3 bg-gradient-to-br from-blue-50 to-cyan-100 rounded-2xl shadow-lg p-6 h-fit sticky top-6 border-2 border-blue-200">
                  <h3 className="text-2xl font-bold text-blue-700 mb-4">
                    📚 {selectedTopic}
                  </h3>
                  <p className="text-gray-600 mb-6">Choose how you want to explore:</p>
                  
                  <div className="space-y-3">
                    {availableDimensions.map((dimension, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedDimension(dimension.name)
                          setContent(null) // Clear current content when selecting new dimension
                        }}
                        disabled={loading}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 disabled:opacity-50 ${
                          selectedDimension === dimension.name
                            ? 'border-blue-600 bg-gradient-to-r from-blue-100 to-blue-200 shadow-lg transform scale-105 ring-2 ring-blue-300'
                            : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        <div className="font-bold text-blue-700">
                          {dimension.emoji} {dimension.name}
                        </div>
                        <div className="text-sm text-gray-500">{dimension.description}</div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={resetToTopicSelection}
                    className="w-full mt-6 p-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                  >
                    ← Back to Topics
                  </button>
                </div>

                {/* Right Panel - Grade Selection and Content */}
                <div className="col-span-9 bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg p-8 border-2 border-green-200 flex flex-col">
                  {selectedDimension ? (
                    <div className="flex flex-col h-full">
                      <h2 className="text-3xl font-bold text-green-700 mb-6">
                        🌟 {selectedTopic} - {selectedDimension}
                      </h2>
                      
                      {/* Grade Selection - Always Visible */}
                      <div className="mb-8">
                        <p className="text-lg text-gray-600 mb-4">Pick your grade level:</p>
                        <div className="flex gap-4">
                          {[3, 4, 5].map((grade) => (
                            <button
                              key={grade}
                              onClick={() => {
                                setSelectedGrade(grade)
                                if (content) {
                                  setContent(null) // Clear content to allow re-generation with new grade
                                }
                              }}
                              className={`px-6 py-4 rounded-xl font-bold text-lg transition-all ${
                                selectedGrade === grade
                                  ? 'bg-green-500 text-white shadow-lg scale-105'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                              <p className="text-sm text-gray-600">{content.word_count} words • Readability: {content.readability_score.toFixed(1)}</p>
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
                          <div className="bg-white rounded-xl p-6 shadow-sm flex-1 overflow-y-auto">
                            {content.images && content.images.length > 0 ? (
                              <div className="content-with-images">
                                {renderContentWithImages(content.content, content.images)}
                              </div>
                            ) : (
                              <div className="text-lg leading-7 text-gray-800 whitespace-pre-wrap">
                                {content.content}
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