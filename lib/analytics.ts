import mixpanel from 'mixpanel-browser'

// Initialize Mixpanel
const MIXPANEL_TOKEN = '5539ab0ba5c5340891b7b197998ce1c4'

if (typeof window !== 'undefined') {
  mixpanel.init(MIXPANEL_TOKEN, {
    debug: process.env.NODE_ENV === 'development',
    track_pageview: true,
    persistence: 'localStorage',
  })
}

export const analytics = {
  // User Actions
  identify: (userId: string, traits?: Record<string, any>) => {
    if (typeof window !== 'undefined') {
      mixpanel.identify(userId)
      if (traits) {
        mixpanel.people.set(traits)
      }
    }
  },

  // Learning Journey Events
  topicSelected: (topic: string, source: 'suggestion' | 'custom' = 'suggestion') => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Topic Selected', {
        topic,
        source,
        timestamp: new Date().toISOString()
      })
    }
  },

  dimensionChosen: (topic: string, dimension: string) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Dimension Chosen', {
        topic,
        dimension,
        timestamp: new Date().toISOString()
      })
    }
  },

  skillLevelChanged: (fromLevel: string | null, toLevel: string, topic?: string) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Skill Level Changed', {
        from_level: fromLevel,
        to_level: toLevel,
        topic,
        timestamp: new Date().toISOString()
      })
    }
  },

  contentGenerated: (topic: string, dimension: string, skillLevel: string, wordCount: number, timeToGenerate?: number) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Content Generated', {
        topic,
        dimension,
        skill_level: skillLevel,
        word_count: wordCount,
        generation_time_ms: timeToGenerate,
        timestamp: new Date().toISOString()
      })
    }
  },

  contentViewed: (topic: string, dimension: string, skillLevel: string, timeSpent?: number) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Content Viewed', {
        topic,
        dimension,
        skill_level: skillLevel,
        time_spent_seconds: timeSpent,
        timestamp: new Date().toISOString()
      })
    }
  },

  feedbackGiven: (topic: string, dimension: string, skillLevel: string, rating: 'thumbs_up' | 'thumbs_down', hasProfile: boolean) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Feedback Given', {
        topic,
        dimension,
        skill_level: skillLevel,
        rating,
        has_profile: hasProfile,
        timestamp: new Date().toISOString()
      })
    }
  },

  // User Profile Events
  profileCreated: (skillLevel: string, avatar: string) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Profile Created', {
        initial_skill_level: skillLevel,
        avatar,
        timestamp: new Date().toISOString()
      })
    }
  },

  profileUpdated: (changes: Record<string, any>) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Profile Updated', {
        changes,
        timestamp: new Date().toISOString()
      })
    }
  },

  // Engagement Events
  sessionStarted: (hasProfile: boolean, returningUser: boolean) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Session Started', {
        has_profile: hasProfile,
        returning_user: returningUser,
        timestamp: new Date().toISOString()
      })
    }
  },

  learningStreakExtended: (streakDays: number, longestStreak: number) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Learning Streak Extended', {
        current_streak: streakDays,
        longest_streak: longestStreak,
        timestamp: new Date().toISOString()
      })
    }
  },

  dimensionCompleted: (topic: string, dimension: string, skillLevel: string, totalDimensionsForTopic: number) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Dimension Completed', {
        topic,
        dimension,
        skill_level: skillLevel,
        total_dimensions: totalDimensionsForTopic,
        timestamp: new Date().toISOString()
      })
    }
  },

  topicCompleted: (topic: string, totalDimensions: number, timeToComplete?: number) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Topic Completed', {
        topic,
        total_dimensions: totalDimensions,
        completion_time_minutes: timeToComplete,
        timestamp: new Date().toISOString()
      })
    }
  },

  // System Events
  contentGenerationFailed: (topic: string, dimension: string, skillLevel: string, error: string) => {
    if (typeof window !== 'undefined') {
      mixpanel.track('Content Generation Failed', {
        topic,
        dimension,
        skill_level: skillLevel,
        error,
        timestamp: new Date().toISOString()
      })
    }
  },

  // Custom event for any other tracking needs
  track: (eventName: string, properties?: Record<string, any>) => {
    if (typeof window !== 'undefined') {
      mixpanel.track(eventName, {
        ...properties,
        timestamp: new Date().toISOString()
      })
    }
  }
}

export default analytics