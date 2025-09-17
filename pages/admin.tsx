import { useState, useEffect } from 'react'
import Head from 'next/head'

interface AnalyticsData {
  totalUsers: number
  activeToday: number
  totalSessions: number
  popularTopics: Array<{topic: string; count: number}>
  popularSkillLevels: Array<{level: string; count: number}>
  feedbackStats: {
    thumbsUp: number
    thumbsDown: number
    total: number
  }
  recentEvents: Array<{
    event: string
    properties: any
    timestamp: string
  }>
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)

  // Simple password protection
  const handleLogin = () => {
    if (password === 'curiolab2024') {
      setIsAuthenticated(true)
      fetchAnalyticsData()
    } else {
      alert('Invalid password')
    }
  }

  const fetchAnalyticsData = async () => {
    setLoading(true)
    try {
      // In a real implementation, this would fetch from your backend
      // For now, we'll create mock data based on what Mixpanel would provide
      const mockData: AnalyticsData = {
        totalUsers: 47,
        activeToday: 12,
        totalSessions: 156,
        popularTopics: [
          { topic: 'Dragons', count: 23 },
          { topic: 'Space', count: 19 },
          { topic: 'Dinosaurs', count: 15 },
          { topic: 'Ocean', count: 12 },
          { topic: 'Robots', count: 8 }
        ],
        popularSkillLevels: [
          { level: 'Explorer', count: 45 },
          { level: 'Beginner', count: 32 },
          { level: 'Expert', count: 18 }
        ],
        feedbackStats: {
          thumbsUp: 78,
          thumbsDown: 12,
          total: 90
        },
        recentEvents: [
          { event: 'Content Generated', properties: { topic: 'Volcanoes', skill_level: 'Explorer' }, timestamp: '2024-12-17T15:30:00Z' },
          { event: 'Feedback Given', properties: { rating: 'thumbs_up', topic: 'Dragons' }, timestamp: '2024-12-17T15:25:00Z' },
          { event: 'Profile Created', properties: { skill_level: 'Beginner' }, timestamp: '2024-12-17T15:20:00Z' },
          { event: 'Topic Selected', properties: { topic: 'Space', source: 'suggestion' }, timestamp: '2024-12-17T15:15:00Z' },
          { event: 'Session Started', properties: { has_profile: true }, timestamp: '2024-12-17T15:10:00Z' }
        ]
      }
      
      setAnalyticsData(mockData)
    } catch (error) {
      console.error('Failed to fetch analytics data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>CurioLab Admin - Login</title>
        </Head>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
              🔬 CurioLab Admin
            </h1>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin password"
                />
              </div>
              <button
                onClick={handleLogin}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>CurioLab Analytics Dashboard</title>
      </Head>
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                🔬 CurioLab Analytics Dashboard
              </h1>
              <button
                onClick={() => setIsAuthenticated(false)}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading analytics data...</div>
            </div>
          ) : analyticsData ? (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm font-medium text-gray-500">Total Users</div>
                  <div className="text-3xl font-bold text-blue-600">{analyticsData.totalUsers}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm font-medium text-gray-500">Active Today</div>
                  <div className="text-3xl font-bold text-green-600">{analyticsData.activeToday}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm font-medium text-gray-500">Total Sessions</div>
                  <div className="text-3xl font-bold text-purple-600">{analyticsData.totalSessions}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm font-medium text-gray-500">Feedback Score</div>
                  <div className="text-3xl font-bold text-orange-600">
                    {Math.round((analyticsData.feedbackStats.thumbsUp / analyticsData.feedbackStats.total) * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {analyticsData.feedbackStats.thumbsUp}👍 / {analyticsData.feedbackStats.thumbsDown}👎
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Popular Topics */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Popular Topics</h3>
                  <div className="space-y-3">
                    {analyticsData.popularTopics.map((topic, index) => (
                      <div key={topic.topic} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-900">#{index + 1}</span>
                          <span className="ml-3 text-sm text-gray-700">{topic.topic}</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">{topic.count} times</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Popular Skill Levels */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Skill Level Usage</h3>
                  <div className="space-y-3">
                    {analyticsData.popularSkillLevels.map((level) => (
                      <div key={level.level} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{level.level}</span>
                        <div className="flex items-center">
                          <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                            <div 
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${(level.count / 95) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{level.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {analyticsData.recentEvents.map((event, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-blue-600">{event.event}</span>
                        <span className="ml-3 text-sm text-gray-500">
                          {JSON.stringify(event.properties)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mixpanel Integration Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">📊 Live Analytics</h4>
                <p className="text-sm text-blue-700">
                  This dashboard shows sample data. In production, this will pull real-time data from Mixpanel analytics.
                  Events are being tracked live at: <code className="bg-blue-100 px-1 rounded">https://mixpanel.com/project/{'{'}project_id{'}'}</code>
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-500">No analytics data available</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}