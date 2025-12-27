from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import os
from dotenv import load_dotenv
import openai
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

load_dotenv()

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

# Initialize OpenAI client
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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

def create_jwt_token(user_id: int, email: str) -> str:
    """Create a JWT token for user authentication."""
    payload = {
        "user_id": user_id,
        "email": email,
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
    cursor.execute("SELECT id, email, name, created_at FROM users WHERE id = ?", (payload["user_id"],))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return {
        "id": user[0],
        "email": user[1], 
        "name": user[2],
        "created_at": user[3]
    }

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

def get_cache_key(topic: str, dimension: str, skill_level: str) -> str:
    """Generate a consistent cache key for content."""
    # Normalize inputs to handle variations in capitalization/spacing
    normalized = f"{topic.lower().strip()}-{dimension.lower().strip()}-{skill_level.lower().strip()}"
    # Use hash to handle special characters and ensure valid filename
    cache_hash = hashlib.md5(normalized.encode()).hexdigest()[:8]
    return f"{normalized.replace(' ', '_')}-{cache_hash}"

def get_cached_content(topic: str, dimension: str, skill_level: str) -> dict | None:
    """Retrieve cached content if it exists."""
    cache_key = get_cache_key(topic, dimension, skill_level)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    
    try:
        if cache_file.exists():
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                print(f"✅ Cache HIT for {topic}-{dimension}-{skill_level}")
                return cached_data
    except Exception as e:
        print(f"❌ Cache read error for {cache_key}: {e}")
    
    print(f"💭 Cache MISS for {topic}-{dimension}-{skill_level}")
    return None

def cache_content(topic: str, dimension: str, skill_level: str, content: str, word_count: int, readability_score: float) -> None:
    """Cache generated content for future use."""
    cache_key = get_cache_key(topic, dimension, skill_level)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    
    cache_data = {
        "topic": topic,
        "dimension": dimension,
        "skill_level": skill_level,
        "content": content,
        "word_count": word_count,
        "readability_score": readability_score,
        "cached_at": json.dumps({"timestamp": "now"})  # Will be replaced with actual timestamp
    }
    
    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            # Add actual timestamp
            import datetime
            cache_data["cached_at"] = datetime.datetime.now().isoformat()
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
        print(f"💾 Cached content for {topic}-{dimension}-{skill_level}")
    except Exception as e:
        print(f"❌ Cache write error for {cache_key}: {e}")

def get_audio_cache_key(topic: str, dimension: str, skill_level: str) -> str:
    """Generate cache key for audio files."""
    return get_cache_key(topic, dimension, skill_level)

def get_cached_audio(topic: str, dimension: str, skill_level: str) -> Path | None:
    """Check if audio file exists in cache."""
    cache_key = get_audio_cache_key(topic, dimension, skill_level)
    audio_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
    
    if audio_file.exists():
        print(f"🎵 Audio cache HIT for {topic}-{dimension}-{skill_level}")
        return audio_file
    
    print(f"🎵 Audio cache MISS for {topic}-{dimension}-{skill_level}")
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

async def generate_audio(topic: str, dimension: str, skill_level: str, content: str) -> Path:
    """Generate audio using OpenAI TTS and cache it."""
    cache_key = get_audio_cache_key(topic, dimension, skill_level)
    audio_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
    
    # Check cache first
    if audio_file.exists():
        return audio_file
    
    try:
        # Clean content for TTS
        clean_content = clean_text_for_tts(content)
        
        print(f"🎤 Generating audio for {topic}-{dimension}-{skill_level}")
        
        # Generate audio using OpenAI TTS
        response = client.audio.speech.create(
            model="tts-1",  # Use tts-1 for faster generation, tts-1-hd for higher quality
            voice="nova",   # Kid-friendly voice (options: alloy, echo, fable, onyx, nova, shimmer)
            input=clean_content
        )
        
        # Save to cache
        with open(audio_file, 'wb') as f:
            for chunk in response.iter_bytes():
                f.write(chunk)
        
        print(f"🎵 Audio cached for {topic}-{dimension}-{skill_level}")
        return audio_file
        
    except Exception as e:
        print(f"❌ Audio generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {str(e)}")

class AudioRequest(BaseModel):
    topic: str
    dimension: str
    grade_level: int

class ContentRequest(BaseModel):
    topic: str
    dimension: str
    skill_level: str

class ContentResponse(BaseModel):
    topic: str
    dimension: str
    skill_level: str
    content: str
    readability_score: float
    word_count: int
    images: list

# Authentication models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

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

@app.post("/generate-dimensions")
async def generate_dimensions(topic_data: dict):
    """Generate educational dimensions for any topic."""
    topic = topic_data.get("topic", "").strip()
    
    if not topic or len(topic) < 2:
        raise HTTPException(status_code=400, detail="Topic must be at least 2 characters long")
    
    # Basic topic appropriateness check
    if not is_topic_appropriate(topic):
        raise HTTPException(status_code=400, detail="Please choose an educational topic appropriate for young learners")
    
    try:
        dimensions = await generate_dimensions_for_topic(topic)
        return {"topic": topic, "dimensions": dimensions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dimension generation failed: {str(e)}")

@app.post("/generate-content", response_model=ContentResponse)
async def generate_content(request: ContentRequest, current_user: dict = None):
    """Generate grade-appropriate content for a given topic and dimension."""
    
    if not client.api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    # Basic topic validation (just ensure it's not empty)
    if not request.topic or len(request.topic.strip()) < 2:
        raise HTTPException(status_code=400, detail="Topic must be at least 2 characters long")
    
    # Basic topic appropriateness check
    if not is_topic_appropriate(request.topic):
        raise HTTPException(status_code=400, detail="Please choose an educational topic appropriate for young learners")
    
    # Only allow specific skill levels
    if request.skill_level not in ["Beginner", "Explorer", "Expert"]:
        raise HTTPException(status_code=400, detail="Only Beginner, Explorer, and Expert skill levels are supported")
    
    try:
        # First, check if content is cached
        cached_content = get_cached_content(request.topic, request.dimension, request.skill_level)
        
        if cached_content:
            # Return cached content
            images = await get_unsplash_images(request.topic, request.dimension, 3)
            response = ContentResponse(
                topic=cached_content["topic"],
                dimension=cached_content["dimension"],
                skill_level=cached_content["skill_level"],
                content=cached_content["content"],
                readability_score=cached_content["readability_score"],
                word_count=cached_content["word_count"],
                images=images
            )
        else:
            # If not cached, generate new content using OpenAI
            content = await generate_topic_content(request.topic, request.dimension, request.skill_level)
            
            # Get relevant images from Unsplash
            images = await get_unsplash_images(request.topic, request.dimension, 3)
            
            # Calculate readability score
            fk_score = textstat.flesch_reading_ease(content)
            word_count = len(content.split())
            
            # Cache the newly generated content
            cache_content(request.topic, request.dimension, request.skill_level, content, word_count, fk_score)
            
            response = ContentResponse(
                topic=request.topic,
                dimension=request.dimension,
                skill_level=request.skill_level,
                content=content,
                readability_score=fk_score,
                word_count=word_count,
                images=images
            )
        
        # Record user progress for content viewing (only if user is logged in)
        if current_user:
            await record_user_progress(
                current_user["id"], 
                request.topic, 
                request.dimension, 
                request.skill_level,
                time_spent=0,  # Will be updated when they spend time reading
                audio_played=False
            )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")

async def generate_dimensions_for_topic(topic: str) -> list:
    """Generate 5 relevant dimensions for any topic using AI."""
    
    system_prompt = f"""You are an educational content expert who creates safe, age-appropriate content for children. For the given topic, generate exactly 5 educational dimensions that would be interesting and appropriate for young learners.

SAFETY REQUIREMENTS (CRITICAL):
- Content must be completely safe and appropriate for children ages 8-18
- NO violence, weapons, death, scary content, or disturbing themes
- NO inappropriate, sexual, or mature themes
- NO political controversy or divisive topics
- Focus on educational, positive, and inspiring aspects only
- If topic seems inappropriate, focus on safe educational angles only

CONTENT REQUIREMENTS:
- Return exactly 5 dimensions
- Each dimension should be 1-2 words (like "Science", "History", "Geography")  
- Make them relevant to the topic
- Educational and age-appropriate for young learners
- Diverse perspectives on the topic

TOPIC: {topic}

Return only a simple comma-separated list, nothing else. Example format:
Science, History, Geography, Culture, Environment"""

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate 5 educational dimensions for: {topic}"}
            ],
            max_tokens=100,
            temperature=0.7
        )
        
        dimensions_text = response.choices[0].message.content.strip()
        dimensions = [dim.strip() for dim in dimensions_text.split(',')]
        
        # Ensure we have exactly 5 dimensions
        if len(dimensions) != 5:
            # Fallback to generic dimensions if AI didn't follow format
            dimensions = ["Science", "History", "Geography", "Culture", "Environment"]
            
        return dimensions
        
    except Exception as e:
        # Fallback dimensions if AI generation fails
        return ["Science", "History", "Geography", "Culture", "Environment"]

async def generate_topic_content(topic: str, dimension: str, skill_level: str) -> str:
    """Generate educational content for any topic, dimension, and skill level using AI."""
    
    # Skill-specific vocabulary and complexity guidelines with exclusive content focus
    skill_guidelines = {
        "Beginner": {
            "vocab": "simple, everyday words and short sentences",
            "examples": "basic examples kids can see and touch in their daily lives",
            "sentence_length": "8-12 words per sentence",
            "target_words": "300 words",
            "target_lines": "12-15 lines",
            "paragraphs": "3-4 short paragraphs",
            "focus": "fundamental concepts, 'what is it?' and basic 'why?'",
            "avoid": "complex processes, detailed explanations, or advanced terminology"
        },
        "Explorer": {
            "vocab": "intermediate vocabulary with some subject-specific terms explained", 
            "examples": "engaging examples with connections to how things work",
            "sentence_length": "10-15 words per sentence",
            "target_words": "500 words",
            "target_lines": "20-25 lines", 
            "paragraphs": "4-5 paragraphs",
            "focus": "'how does it work?' and 'what makes it special?' with processes and connections",
            "avoid": "overly simple explanations OR highly technical details covered in Expert level"
        },
        "Expert": {
            "vocab": "advanced vocabulary, technical terms with explanations, varied sentence structures",
            "examples": "complex examples with scientific explanations, real-world applications, and deeper connections",
            "sentence_length": "12-20 words per sentence", 
            "target_words": "1000 words",
            "target_lines": "full page content with multiple comprehensive sections",
            "paragraphs": "6-8 well-developed paragraphs with clear section breaks",
            "focus": "'why does this matter?' with advanced concepts, implications, and sophisticated analysis",
            "avoid": "basic explanations covered in Beginner/Explorer levels"
        }
    }
    
    guidelines = skill_guidelines[skill_level]
    
    system_prompt = f"""You are an expert educational content writer who creates engaging, safe, age-appropriate content like National Geographic Kids or Highlights.

CRITICAL SAFETY REQUIREMENTS:
- Content must be 100% safe and appropriate for children ages 8-18
- NO violence, weapons, death, injury, scary or disturbing content
- NO inappropriate, sexual, or mature themes whatsoever  
- NO political controversy, divisive topics, or sensitive current events
- NO graphic descriptions or frightening scenarios
- Focus only on positive, educational, inspiring, and uplifting content
- Use encouraging, wonder-filled language that builds curiosity safely
- If any aspect of the topic could be inappropriate, focus only on safe educational angles

SKILL LEVEL: {skill_level}
TOPIC: {topic.title()} - {dimension.title()}

EXCLUSIVE CONTENT REQUIREMENTS FOR {skill_level.upper()} LEVEL:
- FOCUS ON: {guidelines['focus']}
- AVOID: {guidelines['avoid']}
- This content should be UNIQUE to the {skill_level} level - do NOT repeat concepts from other skill levels
- Write EXACTLY {guidelines['target_words']} total words (this is crucial!)
- Create {guidelines['paragraphs']} with clear section headings
- Structure like a children's magazine article with multiple sections
- Use {guidelines['vocab']}
- Keep sentences to {guidelines['sentence_length']}
- Use {guidelines['examples']}

CONTENT STRUCTURE:
- Start with an engaging introduction paragraph (no heading needed)
- Create {guidelines['paragraphs']} main sections, each with:
  * **Clear heading with emoji** (like "🔥 How Hot Are They?" or "🌿 What Do They Eat?")
  * Immediately follow the heading with 2-3 paragraphs of detailed explanation
  * Keep heading and content together in the same section
- Include surprising facts and "wow" moments throughout
- End with a concluding paragraph that inspires wonder
- NO separate headings without content - always put content right after each heading

WRITING STYLE:
- Write like you're talking to curious, intelligent kids
- Use vivid descriptions and imagery that paint pictures in their minds
- Include surprising facts, cool examples, and "wow" moments
- Make complex ideas accessible through analogies kids understand
- Create natural breaks between sections (perfect for images later)
- Balance education with entertainment - make learning FUN!

Focus on the {dimension} aspect of {topic} and make it feel like the most interesting magazine article they've ever read about this topic."""

    # AI generates the specific content prompt based on topic, dimension, and skill level
    content_prompt = f"""Write a fascinating {skill_level}-level magazine article about {topic} focusing on the {dimension} aspects.

EXCLUSIVE {skill_level.upper()} LEVEL REQUIREMENTS:
- Make it perfect for {skill_level} learners who are curious about {topic}
- {guidelines['focus']} 
- AVOID: {guidelines['avoid']}
- Focus specifically on {dimension} aspects of {topic} at the {skill_level} level
- Include multiple sections with clear headings appropriate for {skill_level} complexity
- Add surprising facts and insights perfect for {skill_level} understanding
- Use vivid descriptions that help learners visualize at their {skill_level} comprehension
- Include real examples and stories that connect to {skill_level} learners
- Create natural section breaks (these will have images added later)

STRUCTURE YOUR {skill_level.upper()} ARTICLE:
1. **Catchy opening** that hooks {skill_level} readers immediately
2. **3-4 main sections** with subheadings covering {skill_level}-appropriate {dimension} aspects of {topic}
3. **Facts section** with {skill_level}-appropriate amazing details they'll want to share
4. **Real-world connections** showing how this relates to {skill_level} learners' understanding
5. **Inspiring conclusion** that makes them want to explore the next skill level

CRITICAL: This should be EXCLUSIVE {skill_level} content - completely different from what Beginner, Explorer, or Expert levels would cover. Focus only on {guidelines['focus']} and avoid {guidelines['avoid']}."""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content_prompt}
        ],
        max_tokens=1500,
        temperature=0.7
    )
    
    return response.choices[0].message.content.strip()

async def get_unsplash_images(topic: str, dimension: str, count: int = 3) -> list:
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
async def generate_content_audio(request: AudioRequest, current_user: dict = Depends(get_current_user)):
    """Generate or retrieve cached audio for content."""
    try:
        # Convert grade_level to skill_level
        skill_level = "beginner" if request.grade_level == 3 else "explorer" if request.grade_level == 4 else "expert"
        skill_level_caps = skill_level.capitalize()  # "Beginner", "Explorer", "Expert"
        
        # First check if we have the content cached (try both cases AND check if content is displayed)
        cached_content = get_cached_content(request.topic, request.dimension, skill_level_caps)
        if not cached_content:
            cached_content = get_cached_content(request.topic, request.dimension, skill_level)
        
        # Also check for any existing content with this topic/dimension regardless of case/timing
        if not cached_content:
            # Try to find ANY cached content for this topic/dimension combination
            import glob
            cache_pattern = CACHE_DIR / f"{request.topic.lower().strip()}-{request.dimension.lower().strip()}-*.json"
            matching_files = list(glob.glob(str(cache_pattern)))
            if matching_files:
                # Use the most recent existing content file
                latest_file = max(matching_files, key=lambda f: Path(f).stat().st_mtime)
                try:
                    with open(latest_file, 'r', encoding='utf-8') as f:
                        cached_content = json.load(f)
                        print(f"🔄 Using existing content from {Path(latest_file).name}")
                except Exception as e:
                    print(f"❌ Error reading existing content: {e}")
                    cached_content = None
        
        if not cached_content:
            raise HTTPException(
                status_code=404,
                detail="Please generate content first by clicking '🚀 Start Learning!' button."
            )
        
        # Check if audio is already cached
        cached_audio_file = get_cached_audio(request.topic, request.dimension, skill_level)
        
        # Record that user played audio for this topic
        await record_user_progress(
            current_user["id"], 
            request.topic, 
            request.dimension, 
            skill_level_caps,
            time_spent=0,  # Audio duration could be tracked in future
            audio_played=True
        )
        
        if cached_audio_file:
            return FileResponse(
                path=cached_audio_file,
                media_type="audio/mpeg",
                filename=f"{request.topic}-{request.dimension}-grade{request.grade_level}.mp3"
            )
        
        # Generate new audio
        audio_file = await generate_audio(
            request.topic, 
            request.dimension, 
            skill_level, 
            cached_content["content"]
        )
        
        return FileResponse(
            path=audio_file,
            media_type="audio/mpeg", 
            filename=f"{request.topic}-{request.dimension}-grade{request.grade_level}.mp3"
        )
        
    except Exception as e:
        print(f"❌ Audio generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/audio/{topic}/{dimension}/{skill_level}")
async def get_audio_file(topic: str, dimension: str, skill_level: str):
    """Direct endpoint to get audio file if it exists."""
    cached_audio_file = get_cached_audio(topic, dimension, skill_level)
    
    if cached_audio_file:
        return FileResponse(
            path=cached_audio_file,
            media_type="audio/mpeg",
            filename=f"{topic}-{dimension}-{skill_level}.mp3"
        )
    
    raise HTTPException(status_code=404, detail="Audio file not found. Generate content and audio first.")

@app.get("/content-exists/{topic}/{dimension}/{skill_level}")
async def check_content_exists(topic: str, dimension: str, skill_level: str):
    """Check if content exists in cache without generating it."""
    cached_content = get_cached_content(topic, dimension, skill_level)
    
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
        
        # Hash password and create user
        password_hash = hash_password(user_data.password)
        cursor.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
            (user_data.email, password_hash, user_data.name)
        )
        user_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        
        # Create JWT token
        token = create_jwt_token(user_id, user_data.email)
        
        return {
            "message": "User registered successfully",
            "token": token,
            "user": {
                "id": user_id,
                "email": user_data.email,
                "name": user_data.name
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
            "SELECT id, email, password_hash, name FROM users WHERE email = ?", 
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
        
        # Create JWT token
        token = create_jwt_token(user[0], user[1])
        
        return {
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user[0],
                "email": user[1],
                "name": user[3]
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)