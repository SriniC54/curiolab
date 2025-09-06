# 🔬 CurioLab - Laboratory of Curiosity

**Interactive learning adventures for elementary students (Grades 3-5)**

CurioLab is an AI-powered educational platform that generates personalized, grade-appropriate content across multiple learning dimensions. Students can explore any topic through science, history, geography, culture, and environmental perspectives.

## ✨ Features

- **Profile System**: Personalized learning with name, grade, and avatar selection
- **Dynamic Content Generation**: AI-powered educational content tailored to specific grades
- **Multiple Learning Dimensions**: Explore topics from different perspectives  
- **Any Topic Support**: Students can learn about anything that interests them
- **Interactive UI**: Kid-friendly design with animations and engaging visuals
- **Image Integration**: Contextual images enhance learning experiences
- **Readability Optimization**: Content complexity matches grade levels

## 🚀 Tech Stack

- **Frontend**: Next.js, TypeScript, TailwindCSS
- **Backend**: FastAPI, Python
- **AI**: OpenAI GPT-4
- **Images**: Unsplash integration
- **Storage**: LocalStorage for profiles

## Quick Start

### 1. Set up the backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your OpenAI API key to .env file
python main.py
```

### 2. Set up the frontend
```bash
npm install
npm run dev
```

### 3. Open the app
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Current Features

- ✅ Profile system with name, grade, avatar
- ✅ AI content generation for any topic
- ✅ Grade-level appropriate content (3-5)
- ✅ Dynamic learning dimensions
- ✅ Readability scoring
- ✅ Kid-friendly interface
- ✅ Image integration
- ✅ LocalStorage persistence

## Future Features (Roadmap)

- Progress tracking and learning analytics
- Audio narration for content
- Feedback collection system
- Cloud storage and sync
- Mobile app (React Native)
- Parental dashboard
- Content approval workflow

## Deployment

Ready for deployment to DigitalOcean with Docker configuration.