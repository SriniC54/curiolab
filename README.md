# StudyMate MVP

AI-driven study guide for kids - Water topic (Grades 3-5)

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

## Features (MVP)

- ✅ AI content generation for Water topic
- ✅ Grade-level appropriate content (3-5)
- ✅ 5 dimensions: Science, Geography, History, Environment, Politics
- ✅ Readability scoring
- ✅ Kid-friendly interface

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python
- **AI**: OpenAI GPT-4
- **Readability**: textstat library

## Future Features (Roadmap)

- RAG integration with external sources
- Image generation 
- More topics (Solar System, Animals)
- User authentication
- Content approval workflow
- Mobile app (React Native)

## MVP Limitations

- Single topic: Water only
- Grades 3-5 only
- No image generation yet
- No user accounts
- No content persistence
- No RAG (coming in Phase 2)