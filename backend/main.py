from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import os
from dotenv import load_dotenv
import openai
from google import genai
from google.genai import types
import textstat
import json
import requests
import random
import hashlib
from pathlib import Path
import re
import sqlite3
import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import Optional

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

app = FastAPI(title="CurioLab API", version="0.1.0")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:3001", 
        "http://localhost:3002",
        "http://206.81.1.149:3000"  # Add your server's IP
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client (TTS only)
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Gemini client (text generation)
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Cache directory setup
CACHE_DIR = Path("content_cache")
CACHE_DIR.mkdir(exist_ok=True)

AUDIO_CACHE_DIR = Path("audio_cache")
AUDIO_CACHE_DIR.mkdir(exist_ok=True)

# Database setup
DB_PATH = "curiolab.db"
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Security
security = HTTPBearer()

def init_database():
    """Initialize SQLite database with user and progress tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            name TEXT
        )
    """)
    
    # User progress table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            topic TEXT NOT NULL,
            dimension TEXT NOT NULL,
            skill_level TEXT NOT NULL,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            time_spent INTEGER DEFAULT 0,
            audio_played BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, topic, dimension, skill_level)
        )
    """)
    
    # Safe ALTER TABLE — wrapped so re-runs on existing DB don't crash
    for alter_sql in [
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'",
        "ALTER TABLE users ADD COLUMN institution_id INTEGER REFERENCES institutions(id)"
    ]:
        try:
            cursor.execute(alter_sql)
        except Exception:
            pass  # Column already exists

    # Institutions table (optional — independent teachers have no institution)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS institutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            join_code TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Classes belong to a teacher, optionally to an institution
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL REFERENCES users(id),
            institution_id INTEGER REFERENCES institutions(id),
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Batches belong to a class
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL REFERENCES classes(id),
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Students assigned to batches
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batch_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES batches(id),
            student_id INTEGER NOT NULL REFERENCES users(id),
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(batch_id, student_id)
        )
    """)

    # Topics assigned to a batch
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batch_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES batches(id),
            topic TEXT NOT NULL,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(batch_id, topic)
        )
    """)

    # Quiz results
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            topic TEXT NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL DEFAULT 5,
            taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()

# Initialize database on startup
init_database()

# Authentication helper functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: int, email: str, role: str = "student") -> str:
    """Create a JWT token for user authentication."""
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get current user from JWT token."""
    token = credentials.credentials
    payload = verify_jwt_token(token)

    # Get user from database to ensure they still exist
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, name, created_at, role, institution_id FROM users WHERE id = ?",
        (payload["user_id"],)
    )
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Graceful fallback for old tokens that don't have role in payload
    role = payload.get("role") or user[4] or "student"

    return {
        "id": user[0],
        "email": user[1],
        "name": user[2],
        "created_at": user[3],
        "role": role,
        "institution_id": user[5]
    }

def require_teacher(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the current user to be a teacher."""
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return current_user

def require_student(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the current user to be a student."""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return current_user

async def record_user_progress(user_id: int, topic: str, dimension: str, skill_level: str, time_spent: int = 0, audio_played = False):
    """Record or update user progress for a topic."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if this progress entry already exists
        cursor.execute("""
            SELECT id, time_spent, audio_played FROM user_progress 
            WHERE user_id = ? AND topic = ? AND dimension = ? AND skill_level = ?
        """, (user_id, topic, dimension, skill_level))
        
        existing = cursor.fetchone()
        
        if existing:
            # Update existing entry
            new_time_spent = max(existing[1], time_spent)  # Keep the maximum time spent
            # Handle audio_played logic
            if audio_played is None:
                new_audio_played = existing[2]  # Don't change existing value
            else:
                new_audio_played = existing[2] or audio_played  # True if either is true
            
            cursor.execute("""
                UPDATE user_progress 
                SET time_spent = ?, audio_played = ?, completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (new_time_spent, new_audio_played, existing[0]))
        else:
            # Create new entry
            actual_audio_played = False if audio_played is None else audio_played
            cursor.execute("""
                INSERT INTO user_progress (user_id, topic, dimension, skill_level, time_spent, audio_played)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (user_id, topic, dimension, skill_level, time_spent, actual_audio_played))
        
        conn.commit()
        conn.close()
        print(f"📈 Progress recorded for user {user_id}: {topic}-{dimension}-{skill_level}")
        
    except Exception as e:
        print(f"❌ Error recording progress: {e}")
        # Don't raise exception here to avoid breaking the main functionality

def get_cache_key(topic: str, skill_level: str) -> str:
    """Generate a consistent cache key for content."""
    # Normalize inputs to handle variations in capitalization/spacing
    normalized = f"{topic.lower().strip()}-{skill_level.lower().strip()}"
    # Use hash to handle special characters and ensure valid filename
    cache_hash = hashlib.md5(normalized.encode()).hexdigest()[:8]
    return f"{normalized.replace(' ', '_')}-{cache_hash}"

def get_cached_content(topic: str, skill_level: str) -> dict | None:
    """Retrieve cached content if it exists."""
    cache_key = get_cache_key(topic, skill_level)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    try:
        if cache_file.exists():
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                print(f"✅ Cache HIT for {topic}-{skill_level}")
                return cached_data
    except Exception as e:
        print(f"❌ Cache read error for {cache_key}: {e}")

    print(f"💭 Cache MISS for {topic}-{skill_level}")
    return None

def cache_content(topic: str, skill_level: str, content: str, word_count: int, readability_score: float) -> None:
    """Cache generated content for future use."""
    cache_key = get_cache_key(topic, skill_level)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    cache_data = {
        "topic": topic,
        "skill_level": skill_level,
        "content": content,
        "word_count": word_count,
        "readability_score": readability_score,
    }

    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            import datetime
            cache_data["cached_at"] = datetime.datetime.now().isoformat()
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
        print(f"💾 Cached content for {topic}-{skill_level}")
    except Exception as e:
        print(f"❌ Cache write error for {cache_key}: {e}")

def get_audio_cache_key(topic: str, skill_level: str) -> str:
    """Generate cache key for audio files."""
    return get_cache_key(topic, skill_level)

def get_cached_audio(topic: str, skill_level: str) -> Path | None:
    """Check if audio file exists in cache."""
    cache_key = get_audio_cache_key(topic, skill_level)
    audio_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    if audio_file.exists():
        print(f"🎵 Audio cache HIT for {topic}-{skill_level}")
        return audio_file

    print(f"🎵 Audio cache MISS for {topic}-{skill_level}")
    return None

def clean_text_for_tts(content: str) -> str:
    """Clean text content for better TTS pronunciation."""
    # Remove markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', content)  # Remove **bold**
    text = re.sub(r'^\*\*.*?\*\*', '', text, flags=re.MULTILINE)  # Remove heading asterisks
    
    # Add pauses for better readability
    text = re.sub(r'\n\n', '. ', text)  # Convert paragraph breaks to pauses
    text = re.sub(r'\n', ' ', text)     # Convert line breaks to spaces
    
    # Clean up extra spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

async def generate_audio(topic: str, skill_level: str, content: str) -> Path:
    """Generate audio using OpenAI TTS and cache it."""
    cache_key = get_audio_cache_key(topic, skill_level)
    audio_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    # Check cache first
    if audio_file.exists():
        return audio_file

    try:
        clean_content = clean_text_for_tts(content)
        print(f"🎤 Generating audio for {topic}-{skill_level}")

        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=clean_content
        )

        with open(audio_file, 'wb') as f:
            for chunk in response.iter_bytes():
                f.write(chunk)

        print(f"🎵 Audio cached for {topic}-{skill_level}")
        return audio_file

    except Exception as e:
        print(f"❌ Audio generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {str(e)}")

class AudioRequest(BaseModel):
    topic: str
    dimension: str = ""  # deprecated, ignored
    grade_level: int

class ContentRequest(BaseModel):
    topic: str
    skill_level: str

class ContentResponse(BaseModel):
    topic: str
    skill_level: str
    content: str
    readability_score: float
    word_count: int
    images: list

class QuizRequest(BaseModel):
    topic: str
    content: str

class QuizResultSubmission(BaseModel):
    topic: str
    score: int
    total: int

# Authentication models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    role: str = "student"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    created_at: str

class ProgressEntry(BaseModel):
    topic: str
    dimension: str
    skill_level: str
    completed_at: str
    time_spent: int
    audio_played: bool

class TimeTrackingRequest(BaseModel):
    topic: str
    dimension: str
    skill_level: str
    time_spent: int  # in seconds

@app.get("/")
async def root():
    return {"message": "CurioLab API is running!"}

@app.get("/cache-stats")
async def get_cache_stats():
    """Get cache statistics for monitoring."""
    try:
        cache_files = list(CACHE_DIR.glob("*.json"))
        total_cached = len(cache_files)
        
        # Calculate cache size
        total_size = sum(f.stat().st_size for f in cache_files)
        size_mb = round(total_size / (1024 * 1024), 2)
        
        return {
            "total_cached_content": total_cached,
            "cache_size_mb": size_mb,
            "cache_directory": str(CACHE_DIR.absolute()),
            "status": "healthy"
        }
    except Exception as e:
        return {
            "error": str(e),
            "status": "error"
        }

def is_topic_appropriate(topic: str) -> bool:
    """Basic check for obviously inappropriate topics."""
    topic_lower = topic.lower().strip()
    
    # List of inappropriate keywords to block
    inappropriate_keywords = [
        # Violence & Weapons
        "gun", "guns", "weapon", "weapons", "bomb", "bombs", "war", "wars", "kill", "killing", "murder", "death", "suicide",
        "violence", "violent", "fight", "fighting", "attack", "attacks", "terrorist", "terrorism", "shooting",
        
        # Mature/Sexual Content  
        "sex", "sexual", "porn", "nude", "naked", "adult", "mature", "intimate", "romantic",
        
        # Drugs & Substances
        "drug", "drugs", "alcohol", "beer", "wine", "cocaine", "marijuana", "smoking", "cigarette",
        
        # Disturbing Content
        "scary", "horror", "ghost", "demon", "evil", "blood", "gore", "disturbing"
    ]
    
    # Check if topic contains inappropriate keywords
    for keyword in inappropriate_keywords:
        if keyword in topic_lower:
            return False
    
    return True


@app.post("/generate-content", response_model=ContentResponse)
async def generate_content(request: ContentRequest, authorization: HTTPAuthorizationCredentials = None):
    """Generate educational content for a given topic."""
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    if not request.topic or len(request.topic.strip()) < 2:
        raise HTTPException(status_code=400, detail="Topic must be at least 2 characters long")

    if not is_topic_appropriate(request.topic):
        raise HTTPException(status_code=400, detail="Please choose an educational topic appropriate for young learners")

    if request.skill_level not in ["Beginner", "Explorer", "Expert"]:
        raise HTTPException(status_code=400, detail="Only Beginner, Explorer, and Expert skill levels are supported")

    try:
        cached_content = get_cached_content(request.topic, request.skill_level)

        if cached_content:
            images = await get_unsplash_images(request.topic, 3)
            response = ContentResponse(
                topic=cached_content["topic"],
                skill_level=cached_content["skill_level"],
                content=cached_content["content"],
                readability_score=cached_content["readability_score"],
                word_count=cached_content["word_count"],
                images=images
            )
        else:
            content = await generate_topic_content(request.topic, request.skill_level)
            images = await get_unsplash_images(request.topic, 3)
            fk_score = textstat.flesch_reading_ease(content)
            word_count = len(content.split())
            cache_content(request.topic, request.skill_level, content, word_count, fk_score)
            response = ContentResponse(
                topic=request.topic,
                skill_level=request.skill_level,
                content=content,
                readability_score=fk_score,
                word_count=word_count,
                images=images
            )

        # Record progress if user is logged in
        if authorization:
            try:
                payload = verify_jwt_token(authorization.credentials)
                user_id = payload["user_id"]
                await record_user_progress(
                    user_id,
                    request.topic,
                    "",  # dimension no longer used
                    request.skill_level,
                    time_spent=0,
                    audio_played=False
                )
            except Exception as e:
                print(f"⚠️ Could not track progress: {e}")

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

async def generate_topic_content(topic: str, skill_level: str) -> str:
    """Generate comprehensive educational content for any topic using AI."""

    skill_guidelines = {
        "Beginner": {
            "vocab": "simple, everyday words and short sentences",
            "examples": "basic examples kids can see and touch in their daily lives",
            "sentence_length": "8-12 words per sentence",
            "target_words": "900 words",
            "paragraphs": "6-8 paragraphs",
            "focus": "fundamental concepts from multiple interesting angles — what it is, why it matters, how it works, and fun facts",
            "avoid": "highly technical details or advanced terminology"
        },
        "Explorer": {
            "vocab": "intermediate vocabulary with some subject-specific terms explained",
            "examples": "engaging examples with connections to how things work",
            "sentence_length": "10-15 words per sentence",
            "target_words": "900 words",
            "paragraphs": "6-8 paragraphs",
            "focus": "comprehensive coverage from multiple angles — history, science, culture, real-world applications, and surprising facts",
            "avoid": "overly simple or highly technical extremes"
        },
        "Expert": {
            "vocab": "advanced vocabulary and technical terms with explanations",
            "examples": "complex examples with scientific explanations and deeper connections",
            "sentence_length": "12-20 words per sentence",
            "target_words": "900 words",
            "paragraphs": "6-8 well-developed paragraphs",
            "focus": "in-depth analysis covering mechanisms, implications, history, science, and sophisticated connections",
            "avoid": "basic or superficial explanations"
        }
    }

    guidelines = skill_guidelines[skill_level]

    system_prompt = f"""You are an expert educational content writer who creates engaging, safe, age-appropriate content like National Geographic Kids or Highlights.

CRITICAL SAFETY REQUIREMENTS:
- Content must be 100% safe and appropriate for children ages 8-18
- NO violence, weapons, death, injury, scary or disturbing content
- NO inappropriate, sexual, or mature themes whatsoever
- NO political controversy, divisive topics, or sensitive current events
- Focus only on positive, educational, inspiring, and uplifting content
- Use encouraging, wonder-filled language that builds curiosity safely

SKILL LEVEL: {skill_level}
TOPIC: {topic.title()}

CONTENT REQUIREMENTS:
- Write EXACTLY {guidelines['target_words']} total words (this is crucial!)
- Cover the topic comprehensively from multiple interesting angles
- FOCUS ON: {guidelines['focus']}
- AVOID: {guidelines['avoid']}
- Create {guidelines['paragraphs']} main sections with clear section headings
- Structure like a children's magazine article
- Use {guidelines['vocab']}
- Keep sentences to {guidelines['sentence_length']}
- Use {guidelines['examples']}

CONTENT STRUCTURE:
- Start with an engaging introduction paragraph (no heading needed)
- Create {guidelines['paragraphs']} main sections, each with:
  * **Clear heading with emoji** (like "🔥 How Hot Are They?" or "🌿 Ancient Origins")
  * Immediately follow the heading with 2-3 paragraphs of detailed content
- Include surprising facts and "wow" moments throughout
- End with an inspiring conclusion paragraph
- NO separate headings without content

WRITING STYLE:
- Write like you're talking to curious, intelligent kids
- Use vivid descriptions and imagery
- Include surprising facts and "wow" moments
- Make complex ideas accessible through analogies
- Balance education with entertainment — make learning FUN!"""

    content_prompt = f"""Write a comprehensive, fascinating {skill_level}-level magazine article about {topic}.

Cover {topic} from multiple interesting angles — include its history, how it works scientifically, its cultural significance, surprising facts, real-world applications, and why it matters today.

Make it feel like the most interesting magazine article a curious kid has ever read about {topic}.

Write EXACTLY {guidelines['target_words']} words with {guidelines['paragraphs']} sections."""

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{system_prompt}\n\n{content_prompt}",
        config=types.GenerateContentConfig(max_output_tokens=3000, temperature=0.7)
    )

    return response.text.strip()


async def generate_quiz_questions(topic: str, content: str) -> list:
    """Generate 5 MCQ questions based on article content."""
    prompt = f"""Based on this educational article about {topic}, create exactly 5 multiple choice questions.

ARTICLE:
{content[:4000]}

Return ONLY a valid JSON array with exactly this structure, no markdown, no explanation:
[
  {{
    "question": "Question text here?",
    "options": {{"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}},
    "correct": "A"
  }}
]

Requirements:
- Exactly 5 questions
- Each tests understanding of the article
- 4 options per question (A, B, C, D)
- One correct answer per question
- Questions appropriate for ages 8-18
- Mix factual recall with comprehension"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=1000, temperature=0.3)
        )

        text = response.text.strip()
        # Strip markdown code blocks if present
        if "```" in text:
            text = re.sub(r"```(?:json)?\n?", "", text).strip()

        questions = json.loads(text)

        if not isinstance(questions, list) or len(questions) != 5:
            raise ValueError(f"Expected 5 questions, got {len(questions) if isinstance(questions, list) else 'non-list'}")

        return questions

    except Exception as e:
        print(f"❌ Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")

async def get_unsplash_images(topic: str, count: int = 3) -> list:
    """Get relevant images from Unsplash for the topic and dimension."""
    
    # For now, let's use curated images that match topics
    # This ensures reliable, kid-friendly images while we set up API access
    topic_images = {
        "dragons": [
            {
                "id": "dragon1",
                "url": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
                "alt": "Fantasy dragon artwork",
                "photographer": "Unsplash Community",
                "position": 1
            },
            {
                "id": "dragon2", 
                "url": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400",
                "alt": "Medieval fantasy art",
                "photographer": "Unsplash Community",
                "position": 2
            },
            {
                "id": "dragon3", 
                "url": "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400",
                "alt": "Mystical dragon illustration",
                "photographer": "Unsplash Community",
                "position": 3
            }
        ],
        "pizza": [
            {
                "id": "pizza1",
                "url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400",
                "alt": "Delicious pizza",
                "photographer": "Unsplash Community", 
                "position": 1
            },
            {
                "id": "pizza2",
                "url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400",
                "alt": "Fresh pizza ingredients",
                "photographer": "Unsplash Community", 
                "position": 2
            }
        ],
        "space": [
            {
                "id": "space1",
                "url": "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=400",
                "alt": "Beautiful galaxy and stars",
                "photographer": "Unsplash Community",
                "position": 1
            },
            {
                "id": "space2",
                "url": "https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=400",
                "alt": "Colorful nebula in space",
                "photographer": "Unsplash Community",
                "position": 2
            }
        ],
        "robots": [
            {
                "id": "robot1",
                "url": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400",
                "alt": "Advanced robot technology",
                "photographer": "Unsplash Community",
                "position": 1
            }
        ],
        "dinosaurs": [
            {
                "id": "dino1",
                "url": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
                "alt": "Dinosaur fossils and paleontology",
                "photographer": "Unsplash Community",
                "position": 1
            }
        ],
        "ocean": [
            {
                "id": "ocean1", 
                "url": "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800",
                "thumbnail": "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400",
                "alt": "Deep blue ocean waves",
                "photographer": "Unsplash Community",
                "position": 1
            }
        ],
        "volcanoes": [
            {
                "id": "volcano1",
                "url": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800", 
                "thumbnail": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
                "alt": "Volcanic mountain landscape", 
                "photographer": "Unsplash Community",
                "position": 1
            }
        ]
    }
    
    # Get images for the topic, fallback to general educational images
    topic_key = topic.lower().strip()
    print(f"Looking for images for topic: '{topic_key}'")
    
    if topic_key in topic_images:
        selected_images = topic_images[topic_key][:count]
        print(f"Found {len(selected_images)} images for {topic_key}")
        return selected_images
    
    # Generic educational images for other topics
    generic_images = [
        {
            "id": "education1",
            "url": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800",
            "thumbnail": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400", 
            "alt": f"Learning about {topic}",
            "photographer": "Unsplash Community",
            "position": 1
        },
        {
            "id": "education2",
            "url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
            "thumbnail": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
            "alt": f"Exploring {topic}",
            "photographer": "Unsplash Community", 
            "position": 2
        }
    ]
    print(f"Using generic educational images for {topic_key}")
    return generic_images[:count]

@app.post("/generate-audio")
async def generate_content_audio(request: AudioRequest, authorization: HTTPAuthorizationCredentials = None):
    """Generate or retrieve cached audio for content."""
    try:
        skill_level = "beginner" if request.grade_level == 3 else "explorer" if request.grade_level == 4 else "expert"
        skill_level_caps = skill_level.capitalize()

        cached_content = get_cached_content(request.topic, skill_level_caps)
        if not cached_content:
            cached_content = get_cached_content(request.topic, skill_level)

        if not cached_content:
            raise HTTPException(
                status_code=404,
                detail="Please generate content first."
            )

        cached_audio_file = get_cached_audio(request.topic, skill_level)

        if authorization:
            try:
                payload = verify_jwt_token(authorization.credentials)
                user_id = payload["user_id"]
                await record_user_progress(
                    user_id,
                    request.topic,
                    "",
                    skill_level_caps,
                    time_spent=0,
                    audio_played=True
                )
            except Exception as e:
                print(f"⚠️ Could not track audio progress: {e}")

        if cached_audio_file:
            return FileResponse(
                path=cached_audio_file,
                media_type="audio/mpeg",
                filename=f"{request.topic}-grade{request.grade_level}.mp3"
            )

        audio_file = await generate_audio(request.topic, skill_level, cached_content["content"])

        return FileResponse(
            path=audio_file,
            media_type="audio/mpeg",
            filename=f"{request.topic}-grade{request.grade_level}.mp3"
        )

    except Exception as e:
        print(f"❌ Audio generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/audio/{topic}/{skill_level}")
async def get_audio_file(topic: str, skill_level: str):
    """Direct endpoint to get audio file if it exists."""
    cached_audio_file = get_cached_audio(topic, skill_level)

    if cached_audio_file:
        return FileResponse(
            path=cached_audio_file,
            media_type="audio/mpeg",
            filename=f"{topic}-{skill_level}.mp3"
        )

    raise HTTPException(status_code=404, detail="Audio file not found. Generate content and audio first.")

@app.get("/content-exists/{topic}/{skill_level}")
async def check_content_exists(topic: str, skill_level: str):
    """Check if content exists in cache without generating it."""
    cached_content = get_cached_content(topic, skill_level)

    if cached_content:
        return {"exists": True, "cached": True}
    else:
        return {"exists": False, "cached": False}

# Authentication endpoints
@app.post("/register")
async def register_user(user_data: UserRegister):
    """Register a new user."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if user already exists
        cursor.execute("SELECT id FROM users WHERE email = ?", (user_data.email,))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Validate role
        if user_data.role not in ("teacher", "student"):
            raise HTTPException(status_code=400, detail="role must be 'teacher' or 'student'")

        # Hash password and create user
        password_hash = hash_password(user_data.password)
        cursor.execute(
            "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
            (user_data.email, password_hash, user_data.name, user_data.role)
        )
        user_id = cursor.lastrowid

        conn.commit()
        conn.close()

        # Create JWT token
        token = create_jwt_token(user_id, user_data.email, user_data.role)

        return {
            "message": "User registered successfully",
            "token": token,
            "user": {
                "id": user_id,
                "email": user_data.email,
                "name": user_data.name,
                "role": user_data.role
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/login")
async def login_user(user_data: UserLogin):
    """Login user and return JWT token."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get user from database
        cursor.execute(
            "SELECT id, email, password_hash, name, role FROM users WHERE email = ?",
            (user_data.email,)
        )
        user = cursor.fetchone()

        if not user or not verify_password(user_data.password, user[2]):
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Update last login
        cursor.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
            (user[0],)
        )
        conn.commit()
        conn.close()

        role = user[4] or "student"

        # Create JWT token
        token = create_jwt_token(user[0], user[1], role)

        return {
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user[0],
                "email": user[1],
                "name": user[3],
                "role": role
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.get("/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile and progress."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get user progress
        cursor.execute("""
            SELECT topic, dimension, skill_level, completed_at, time_spent, audio_played
            FROM user_progress 
            WHERE user_id = ?
            ORDER BY completed_at DESC
        """, (current_user["id"],))
        
        progress_data = cursor.fetchall()
        conn.close()
        
        progress = [
            {
                "topic": row[0],
                "dimension": row[1], 
                "skill_level": row[2],
                "completed_at": row[3],
                "time_spent": row[4],
                "audio_played": bool(row[5])
            }
            for row in progress_data
        ]
        
        return {
            "user": current_user,
            "progress": progress,
            "stats": {
                "topics_completed": len(progress),
                "total_time_spent": sum(p["time_spent"] for p in progress),
                "audio_sessions": sum(1 for p in progress if p["audio_played"])
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get profile: {str(e)}")

@app.post("/track-time")
async def track_reading_time(request: TimeTrackingRequest, current_user: dict = Depends(get_current_user)):
    """Track time spent reading content."""
    try:
        await record_user_progress(
            current_user["id"], 
            request.topic, 
            request.dimension, 
            request.skill_level,
            time_spent=request.time_spent,
            audio_played=None  # Don't override existing audio flag
        )
        
        return {
            "message": "Time tracked successfully",
            "time_spent": request.time_spent
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to track time: {str(e)}")

@app.post("/generate-quiz")
async def generate_quiz(request: QuizRequest):
    """Generate 5 MCQ quiz questions based on article content."""
    if not request.topic or len(request.topic.strip()) < 2:
        raise HTTPException(status_code=400, detail="Topic must be at least 2 characters")
    try:
        questions = await generate_quiz_questions(request.topic, request.content)
        return {"questions": questions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")


@app.post("/submit-quiz")
async def submit_quiz(request: QuizResultSubmission, current_user: dict = Depends(get_current_user)):
    """Save quiz result for authenticated user."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO quiz_results (user_id, topic, score, total) VALUES (?, ?, ?, ?)",
            (current_user["id"], request.topic, request.score, request.total)
        )
        conn.commit()
        conn.close()
        return {"message": "Quiz result saved", "score": request.score, "total": request.total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save quiz result: {str(e)}")


# ─── Teacher / Student Models ────────────────────────────────────────────────

class ClassCreate(BaseModel):
    name: str

class BatchCreate(BaseModel):
    name: str

class AssignStudentRequest(BaseModel):
    student_email: str

class AssignTopicRequest(BaseModel):
    topic: str

# ─── Teacher Endpoints ────────────────────────────────────────────────────────

@app.post("/teacher/classes")
async def create_class(body: ClassCreate, current_user: dict = Depends(require_teacher)):
    """Create a new class."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO classes (teacher_id, name) VALUES (?, ?)",
        (current_user["id"], body.name)
    )
    class_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": class_id, "name": body.name, "teacher_id": current_user["id"]}

@app.get("/teacher/classes")
async def list_classes(current_user: dict = Depends(require_teacher)):
    """List all classes owned by the current teacher."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.name, c.created_at, COUNT(b.id) as batch_count
        FROM classes c
        LEFT JOIN batches b ON b.class_id = c.id
        WHERE c.teacher_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC
    """, (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "created_at": r[2], "batch_count": r[3]} for r in rows]

@app.post("/teacher/classes/{class_id}/batches")
async def create_batch(class_id: int, body: BatchCreate, current_user: dict = Depends(require_teacher)):
    """Create a new batch within a class."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM classes WHERE id = ? AND teacher_id = ?", (class_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Class not found")
    cursor.execute("INSERT INTO batches (class_id, name) VALUES (?, ?)", (class_id, body.name))
    batch_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": batch_id, "name": body.name, "class_id": class_id}

@app.get("/teacher/classes/{class_id}/batches")
async def list_batches(class_id: int, current_user: dict = Depends(require_teacher)):
    """List all batches for a class."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM classes WHERE id = ? AND teacher_id = ?", (class_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Class not found")
    cursor.execute("""
        SELECT b.id, b.name, b.created_at,
               COUNT(DISTINCT bs.student_id) as student_count,
               COUNT(DISTINCT bt.id) as topic_count
        FROM batches b
        LEFT JOIN batch_students bs ON bs.batch_id = b.id
        LEFT JOIN batch_topics bt ON bt.batch_id = b.id
        WHERE b.class_id = ?
        GROUP BY b.id
    """, (class_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "created_at": r[2], "student_count": r[3], "topic_count": r[4]} for r in rows]

@app.post("/teacher/batches/{batch_id}/students")
async def assign_student(batch_id: int, body: AssignStudentRequest, current_user: dict = Depends(require_teacher)):
    """Assign a student to a batch by email."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Verify teacher owns this batch
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    # Find student
    cursor.execute("SELECT id, email FROM users WHERE email = ? AND role = 'student'", (body.student_email,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found with that email")
    try:
        cursor.execute("INSERT INTO batch_students (batch_id, student_id) VALUES (?, ?)", (batch_id, student[0]))
        conn.commit()
    except Exception:
        pass  # Already assigned — ignore duplicate
    conn.close()
    return {"message": "Student assigned", "student_id": student[0], "student_email": student[1]}

@app.delete("/teacher/batches/{batch_id}/students/{student_id}")
async def remove_student(batch_id: int, student_id: int, current_user: dict = Depends(require_teacher)):
    """Remove a student from a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    cursor.execute("DELETE FROM batch_students WHERE batch_id = ? AND student_id = ?", (batch_id, student_id))
    conn.commit()
    conn.close()
    return {"message": "Student removed"}

@app.get("/teacher/batches/{batch_id}/students")
async def list_batch_students(batch_id: int, current_user: dict = Depends(require_teacher)):
    """List all students in a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    cursor.execute("""
        SELECT u.id, u.email, u.name
        FROM batch_students bs
        JOIN users u ON u.id = bs.student_id
        WHERE bs.batch_id = ?
        ORDER BY u.name
    """, (batch_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "email": r[1], "name": r[2]} for r in rows]

@app.post("/teacher/batches/{batch_id}/topics")
async def assign_topic(batch_id: int, body: AssignTopicRequest, current_user: dict = Depends(require_teacher)):
    """Assign a topic to a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    try:
        cursor.execute("INSERT INTO batch_topics (batch_id, topic) VALUES (?, ?)", (batch_id, body.topic))
        conn.commit()
    except Exception:
        pass  # Already assigned — ignore duplicate
    conn.close()
    return {"message": "Topic assigned", "batch_id": batch_id, "topic": body.topic}

@app.delete("/teacher/batches/{batch_id}/topics/{topic}")
async def remove_topic(batch_id: int, topic: str, current_user: dict = Depends(require_teacher)):
    """Remove a topic from a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    cursor.execute("DELETE FROM batch_topics WHERE batch_id = ? AND topic = ?", (batch_id, topic))
    conn.commit()
    conn.close()
    return {"message": "Topic removed"}

@app.get("/teacher/batches/{batch_id}/topics")
async def list_batch_topics(batch_id: int, current_user: dict = Depends(require_teacher)):
    """List all topics assigned to a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    cursor.execute("SELECT topic, assigned_at FROM batch_topics WHERE batch_id = ?", (batch_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"topic": r[0], "assigned_at": r[1]} for r in rows]

@app.get("/teacher/batches/{batch_id}/progress")
async def get_batch_progress(batch_id: int, current_user: dict = Depends(require_teacher)):
    """Get student × topic completion grid for a batch."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id FROM batches b
        JOIN classes c ON c.id = b.class_id
        WHERE b.id = ? AND c.teacher_id = ?
    """, (batch_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Batch not found")
    # Get students
    cursor.execute("""
        SELECT u.id, u.email, u.name FROM batch_students bs
        JOIN users u ON u.id = bs.student_id WHERE bs.batch_id = ?
    """, (batch_id,))
    students = cursor.fetchall()
    # Get assigned topics
    cursor.execute("SELECT topic FROM batch_topics WHERE batch_id = ?", (batch_id,))
    topics = [r[0] for r in cursor.fetchall()]
    # Build completion grid with quiz scores
    result = []
    for s in students:
        completed = []
        for topic in topics:
            cursor.execute("""
                SELECT COUNT(*) FROM user_progress
                WHERE user_id = ? AND topic = ?
            """, (s[0], topic))
            count = cursor.fetchone()[0]

            cursor.execute("""
                SELECT score, total FROM quiz_results
                WHERE user_id = ? AND topic = ?
                ORDER BY score DESC
                LIMIT 1
            """, (s[0], topic))
            quiz_row = cursor.fetchone()

            completed.append({
                "topic": topic,
                "completed": count > 0,
                "quiz_score": quiz_row[0] if quiz_row else None,
                "quiz_total": quiz_row[1] if quiz_row else None
            })
        result.append({"student_id": s[0], "email": s[1], "name": s[2], "topics": completed})
    conn.close()
    return {"students": result, "topics": topics}

# ─── Student Endpoints ────────────────────────────────────────────────────────

@app.get("/student/assignments")
async def get_student_assignments(current_user: dict = Depends(require_student)):
    """Get all topics assigned to this student across all their batches."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT bt.topic
        FROM batch_topics bt
        JOIN batch_students bs ON bs.batch_id = bt.batch_id
        WHERE bs.student_id = ?
        ORDER BY bt.topic
    """, (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return {"topics": [r[0] for r in rows]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)