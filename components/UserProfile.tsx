import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface ProgressEntry {
  topic: string
  dimension: string
  skill_level: string
  completed_at: string
  time_spent: number
  audio_played: boolean
}

interface UserStats {
  topics_completed: number
  total_time_spent: number
  audio_sessions: number
}

export const UserProfile: React.FC = () => {
  const { user, logout, token } = useAuth()
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [stats, setStats] = useState<UserStats>({ topics_completed: 0, total_time_spent: 0, audio_sessions: 0 })
  const [isLoading, setIsLoading] = useState(true)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (user && token) {
      fetchUserProfile()
    }
  }, [user, token])

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setProgress(data.progress)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
      return `${minutes}m`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (!user) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Learning Profile</h2>
          <p className="text-gray-600">{user.name || user.email}</p>
          <p className="text-sm text-gray-500">Member since {formatDate(user.created_at)}</p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 text-red-600 hover:text-red-700 border border-red-300 hover:border-red-400 rounded-md transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.topics_completed}</div>
          <div className="text-sm text-blue-700">Topics Completed</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{formatTime(stats.total_time_spent)}</div>
          <div className="text-sm text-green-700">Learning Time</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{stats.audio_sessions}</div>
          <div className="text-sm text-purple-700">Audio Sessions</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Learning Activity</h3>
        {isLoading ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : progress.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-2">No learning activity yet</div>
            <div className="text-sm text-gray-400">Start exploring topics to see your progress here!</div>
          </div>
        ) : (
          <div className="space-y-3">
            {progress.map((entry, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-800">
                    {entry.topic} - {entry.dimension}
                  </div>
                  <div className="text-sm text-gray-600">
                    {entry.skill_level} Level
                    {entry.audio_played && <span className="ml-2 text-blue-600">🎵 Audio played</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{formatDate(entry.completed_at)}</div>
                  {entry.time_spent > 0 && (
                    <div className="text-xs text-gray-400">{formatTime(entry.time_spent)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}