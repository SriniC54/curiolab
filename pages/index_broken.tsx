import { useState } from 'react'
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

export default function Home() {
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [availableDimensions, setAvailableDimensions] = useState<any[]>([])
  const [selectedDimension, setSelectedDimension] = useState('')
  const [selectedGrade, setSelectedGrade] = useState(4)
  const [content, setContent] = useState<ContentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDimensions, setLoadingDimensions] = useState(false)
  const [error, setError] = useState('')

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
      const response = await fetch('http://localhost:8000/generate-dimensions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic })
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
      setError('Unable to generate learning dimensions. Please try again!')
    } finally {
      setLoadingDimensions(false)
    }
  }

  const handleTopicSelection = (topic: string) => {
    setSelectedTopic(topic)
    setCustomTopic(topic)
    generateDimensionsForTopic(topic)
  }

  const handleCustomTopicSubmit = () => {
    if (customTopic.trim().length >= 2) {
      setSelectedTopic(customTopic.trim())
      generateDimensionsForTopic(customTopic.trim())
    }
  }

  const renderContentWithImages = (content: string, images: any[]) => {
    // Split content into sections (by ** headings or paragraphs)
    const sections = content.split(/\n\n+/)
    const contentWithImages = []
    let imageIndex = 0

    sections.forEach((section, index) => {
      // Add the content section
      contentWithImages.push(
        <div key={`section-${index}`} className="mb-6">
          <div className="text-lg leading-7 text-gray-800 whitespace-pre-wrap">
            {section}
          </div>
        </div>
      )

      // Add smaller, inline images after certain sections
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
      const response = await fetch('http://localhost:8000/generate-content', {
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
    <div className="min-h-screen bg-gradient-to-br from-purple-200 via-pink-200 to-yellow-200 animate-gradient-x">
      <Head>
        <title>StudyMate - Learning Adventures for Kids!</title>
        <meta name="description" content="Interactive learning adventures for elementary students" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-green-600 to-teal-600 mb-4">
            🚀 StudyMate 🌟
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
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-gradient-to-r from-red-100 to-pink-100 border-4 border-red-300 text-red-800 px-8 py-6 rounded-2xl mb-8 text-xl font-bold text-center animate-shake">
              <span className="text-2xl mr-2">😅</span>
              Oops! {error}
              <span className="text-2xl ml-2">🔧</span>
            </div>
          )}

          {/* Two-Panel Layout: Dimensions Left, Content Right */}
          {selectedTopic && availableDimensions.length > 0 && !content && (
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
                      onClick={() => setSelectedDimension(dimension.name)}
                      disabled={loading}
                      className="w-full text-left p-4 rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50"
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

              {/* Right Panel - Grade Selection */}
              <div className="col-span-9 bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg p-8 border-2 border-green-200">
                    {selectedDimension ? (
                      <div>
                        <h2 className="text-3xl font-bold text-green-700 mb-6">
                          🌟 {selectedTopic} - {selectedDimension}
                        </h2>
                        
                        <div className="mb-8">
                          <p className="text-lg text-gray-600 mb-4">Pick your grade level:</p>
                          <div className="flex gap-4">
                            {[3, 4, 5].map((grade) => (
                              <button
                                key={grade}
                                onClick={() => setSelectedGrade(grade)}
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

                        {selectedGrade && (
                          <button
                            onClick={generateContent}
                            disabled={loading}
                            className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-8 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform disabled:opacity-50 shadow-lg"
                          >
                            {loading ? '🔄 Creating Your Adventure...' : '🚀 Start Learning!'}
                          </button>
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

              {/* Content Display - Full Screen with Better Images */}
              {content && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex">
                    {/* Left Sidebar - Quick Navigation */}
                    <div className="w-64 bg-gradient-to-b from-blue-100 to-blue-200 p-4 flex flex-col border-r-2 border-blue-300">
                      <div className="mb-4">
                        <h3 className="font-bold text-blue-700">{content.topic}</h3>
                        <p className="text-sm text-blue-600">{content.dimension}</p>
                        <p className="text-xs text-gray-500">Grade {content.grade_level} • {content.word_count} words</p>
                      </div>
                      
                      <div className="space-y-2 flex-1">
                        <button
                          onClick={() => setContent(null)}
                          className="w-full text-left p-2 rounded bg-blue-100 hover:bg-blue-200 text-sm font-medium"
                        >
                          📚 Choose New Dimension
                        </button>
                        <button
                          onClick={resetToTopicSelection}
                          className="w-full text-left p-2 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium"
                        >
                          🔄 Pick New Topic
                        </button>
                      </div>

                      <button
                        onClick={() => setContent(null)}
                        className="w-full mt-4 bg-red-500 text-white p-2 rounded font-bold hover:bg-red-600"
                      >
                        ✕ Close
                      </button>
                    </div>
                    
                    {/* Main Content Area */}
                    <div className="flex-1 p-6 overflow-y-auto">
                      <div className="max-w-4xl mx-auto">
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}