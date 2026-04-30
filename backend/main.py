import asyncio
from fastapi import FastAPI, HTTPException, Depends, Header
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
import httpx
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

    # Pivot migration: rename role 'teacher' -> 'creator'.
    # Idempotent — second run is a no-op since no rows match the old value.
    cursor.execute("UPDATE users SET role = 'creator' WHERE role = 'teacher'")

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

    # Feedback submissions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            role TEXT,
            message TEXT NOT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ---------------------------------------------------------------
    # Pivot schema: creator-authored content with validator feedback.
    # See PIVOT_PLAN.md for design context.
    # ---------------------------------------------------------------

    # content_items: a single piece of generated content owned by a creator.
    #
    # status values:    'draft' | 'validated' | 'published'
    # visibility values: 'private' | 'assigned' | 'public'
    #
    # draft_content / final_content store the generator output as a JSON blob
    # (TEXT column). final_content is set after the validator/revision loop.
    # validator_feedback holds the single synthesized narrative summary shown
    # to the creator (per-dimension breakdown is V2).
    #
    # deleted_at is a soft-delete tombstone — non-NULL means hidden from the
    # creator's library and from assignment/publish flows.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS content_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_id INTEGER NOT NULL REFERENCES users(id),
            topic TEXT NOT NULL,
            skill_level TEXT NOT NULL,
            draft_content TEXT,
            final_content TEXT,
            validator_feedback TEXT,
            iteration_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            visibility TEXT NOT NULL DEFAULT 'private',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP
        )
    """)

    # Indexes for common access patterns:
    #  - creator's library view (filter by creator_id, exclude soft-deleted)
    #  - status / visibility filters (admin moderation, future public browse)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_content_items_creator
        ON content_items(creator_id, deleted_at)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_content_items_status
        ON content_items(status)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_content_items_visibility
        ON content_items(visibility)
    """)

    # Link batch_topics to a specific content_item.
    #
    # Pre-pivot, batch_topics held only a topic string and content was generated
    # on-demand each time a student opened it. Post-pivot, every assignment
    # references a specific reviewed-and-validated content_item.
    #
    # The column is nullable so legacy rows from the on-demand era don't
    # explode the migration. New assignments (rewrite lands in task #15) will
    # always populate it. The 'topic' column stays as a denormalized display
    # label and is what the existing UNIQUE(batch_id, topic) constraint uses.
    #
    # Tightening to NOT NULL or UNIQUE(batch_id, content_item_id) requires a
    # SQLite table rebuild and is deferred to followup task #21.
    try:
        cursor.execute(
            "ALTER TABLE batch_topics ADD COLUMN content_item_id INTEGER REFERENCES content_items(id)"
        )
    except Exception:
        pass  # Column already exists

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_batch_topics_content_item
        ON batch_topics(content_item_id)
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

def require_creator(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the current user to be a creator."""
    if current_user["role"] != "creator":
        raise HTTPException(status_code=403, detail="Creator access required")
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

def cache_content(topic: str, skill_level: str, content: str, word_count: int, readability_score: float, sections: list = None) -> None:
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
    if sections is not None:
        cache_data["sections"] = sections

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
    sections: list  # [{heading, body, image_url, image_alt, photographer}]

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
async def generate_content(request: ContentRequest, authorization: Optional[str] = Header(None)):
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
            # If sections missing from old cache, generate them now
            sections = cached_content.get("sections")
            if not sections:
                print(f"🔄 Generating missing sections for cached '{request.topic}'")
                sections = await parse_and_enrich_sections(request.topic, cached_content["content"])
                # Update cache file with sections
                cache_content(
                    cached_content["topic"], cached_content["skill_level"],
                    cached_content["content"], cached_content["word_count"],
                    cached_content["readability_score"], sections
                )
            response = ContentResponse(
                topic=cached_content["topic"],
                skill_level=cached_content["skill_level"],
                content=cached_content["content"],
                readability_score=cached_content["readability_score"],
                word_count=cached_content["word_count"],
                images=images,
                sections=sections
            )
        else:
            content = await generate_topic_content(request.topic, request.skill_level)
            images = await get_unsplash_images(request.topic, 3)
            fk_score = textstat.flesch_reading_ease(content)
            word_count = len(content.split())
            sections = await parse_and_enrich_sections(request.topic, content)
            cache_content(request.topic, request.skill_level, content, word_count, fk_score, sections)
            response = ContentResponse(
                topic=request.topic,
                skill_level=request.skill_level,
                content=content,
                readability_score=fk_score,
                word_count=word_count,
                images=images,
                sections=sections
            )

        # Record progress if user is logged in
        if authorization and authorization.startswith("Bearer "):
            try:
                token = authorization[len("Bearer "):]
                payload = verify_jwt_token(token)
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
        config=types.GenerateContentConfig(
            max_output_tokens=8000,
            temperature=0.7,
            thinking_config=types.ThinkingConfig(thinking_budget=0)
        )
    )

    return response.text.strip()


# Validator dimensions are an INTERNAL rubric. The creator never sees these
# names — only the synthesized `summary` field. Keeping the rubric internal
# is intentional: creators get conversational editorial notes, not a
# checklist UI. The structured form is what the revision step (task #8)
# consumes and what we persist for debugging / prompt tuning.
VALIDATOR_DIMENSIONS = [
    "accuracy",
    "grade_level",
    "bias",
    "completeness",
    "age_appropriate",
    "safety",
]


async def validate_content_draft(
    draft: str,
    topic: str,
    skill_level: str,
) -> dict:
    """Run the AI validator over a generated draft.

    Critiques the draft across six internal dimensions — accuracy, grade-level,
    bias, completeness, age-appropriate, and safety — in a single Gemini call.
    The dimension framework stays internal; the creator-facing `summary` only
    surfaces dimensions that have issues, written as a conversational note.

    Args:
        draft: The full markdown content the generator produced.
        topic: The topic the creator entered.
        skill_level: One of "Beginner", "Explorer", "Expert".

    Returns:
        dict with keys:
          - summary (str): Conversational note for the creator. Mentions only
            dimensions where issues were found (issues are described in plain
            language; dimension names are never surfaced). If the draft is
            clean, the summary is a brief positive confirmation.
          - dimensions (dict): Per-dimension verdict + notes for internal use
            by the revision step (task #8) and for debugging. Persisted
            alongside `summary` in content_items.validator_feedback.
          - needs_revision (bool): True if any dimension verdict is "concern".
            Orchestrator stop signal — the loop short-circuits on a clean
            draft instead of churning through revisions.

    Never raises. On JSON parse failure, empty Gemini response, or any other
    upstream error, returns a permissive default that lets the orchestrator
    continue without a revise pass. The caller is responsible for logging.
    """

    # Skill-level criteria mirror the generator's own guidelines so the
    # validator judges drafts against the same yardstick the writer was given.
    grade_level_criteria = {
        "Beginner": "8-12 word sentences, simple everyday vocabulary, basic concepts only",
        "Explorer": "10-15 word sentences, intermediate vocabulary with subject-specific terms explained, comprehensive coverage",
        "Expert":   "12-20 word sentences, advanced vocabulary with technical terms explained, in-depth analysis and sophisticated connections",
    }
    grade_target = grade_level_criteria.get(skill_level, grade_level_criteria["Explorer"])

    system_prompt = f"""You are a careful editorial reviewer for an educational content platform aimed at curious kids ages 8-18. You are reviewing a draft article a creator (a parent or teacher) plans to assign to students.

Evaluate the draft against six INTERNAL dimensions. The creator does NOT see these dimension names — they are your private rubric. The creator only sees a single short conversational note from you.

THE SIX DIMENSIONS:

1. accuracy — Are the facts, dates, statistics, and scientific mechanisms correct? Flag hallucinations, common myths presented as fact, wrong numbers, and incorrect causal explanations.

2. grade_level — Is the writing pitched at the requested skill level? The current draft is for skill_level "{skill_level}", which means: {grade_target}. Flag drafts that are too advanced or too simple for this level.

3. bias — Does the draft present a one-sided view of something with a fuller picture? Flag accidentally narrow framing (e.g., only Western examples on a global topic, only one of multiple legitimate scientific theories presented as the only one). This is about completeness of perspective, not political alignment.

4. completeness — Does the draft cover the topic from multiple interesting angles (history, mechanism, cultural significance, real-world applications, surprising facts), or does it tunnel into one aspect? Flag drafts that are technically fine but weirdly narrow.

5. age_appropriate — Is the subject matter and emotional weight suitable for ages 8-18? Flag graphic violence, sexual content, disturbing imagery, traumatic detail, or anything a parent would not want a 10-year-old reading independently.

6. safety — Could a kid be harmed by acting on this content? Flag instructions involving fire, chemicals, climbing, dangerous tools, dieting, self-harm, or anything that glorifies risky behavior.

FOR EACH DIMENSION return:
  - verdict: "pass" or "concern"
  - notes: empty string if pass; a specific, actionable observation if concern. Reference exact phrases or sections from the draft when possible.

THRESHOLD FOR "concern" — read this carefully:
A dimension earns "concern" ONLY when there is a REAL PROBLEM that meaningfully degrades the draft for the target audience. Concrete examples of real problems:
  - A wrong fact, date, or statistic stated as truth
  - A dangerous or harmful instruction
  - Content clearly off the grade level (e.g. an Explorer draft written entirely at a 1st-grade level, or stuffed with PhD vocabulary)
  - A narrowly framed perspective that genuinely OMITS a meaningful piece of the picture (not "could mention more")
  - Content unfit for ages 8-18 (graphic, traumatic, sexual, etc.)
  - Bias that misrepresents a topic
NOT concerns — these should result in a "pass" verdict:
  - "Could be even better if you added X" suggestions
  - One or two longer sentences in an otherwise grade-appropriate draft (some variation is normal good writing)
  - Stretch coverage ideas like additional sections on related sub-topics
  - Minor polish or stylistic preferences
Default to "pass" unless there is a clear, real problem. The validator's job is to catch things that need fixing, not to find ways every draft could be marginally improved.

THEN write a single `summary` field for the creator:
  - Conversational tone, like a thoughtful editor giving notes to a colleague.
  - Only mention dimensions that earned a "concern" verdict. Do not list dimensions that passed.
  - Do not name the dimensions explicitly ("accuracy", "bias", "grade level", etc.). Describe the issue in plain language.
  - When you mention an issue, reference at least one specific phrase, claim, or section from the draft so the creator can act on the summary alone — do not say things like "factual details need checking" without naming which fact, or "the content is dangerous" without naming what's dangerous. Quote or paraphrase the offending part directly.
  - If ALL dimensions pass, the summary is a brief 1-sentence positive confirmation, e.g. "This draft looks solid — accurate, well-pitched for the level, and covers the topic from multiple angles."
  - Keep it under 120 words.

Set `needs_revision` to true if any dimension has a "concern" verdict, otherwise false.

TOPIC: {topic}
SKILL_LEVEL: {skill_level}

Respond with VALID JSON ONLY, matching this shape exactly:
{{
  "dimensions": {{
    "accuracy":         {{"verdict": "pass" | "concern", "notes": "..."}},
    "grade_level":      {{"verdict": "pass" | "concern", "notes": "..."}},
    "bias":             {{"verdict": "pass" | "concern", "notes": "..."}},
    "completeness":     {{"verdict": "pass" | "concern", "notes": "..."}},
    "age_appropriate":  {{"verdict": "pass" | "concern", "notes": "..."}},
    "safety":           {{"verdict": "pass" | "concern", "notes": "..."}}
  }},
  "summary": "...",
  "needs_revision": true | false
}}

No markdown, no commentary outside the JSON."""

    user_prompt = f"DRAFT TO REVIEW:\n\n{draft}"

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{system_prompt}\n\n{user_prompt}",
            config=types.GenerateContentConfig(
                # Low temp — we want consistent critique, not creative writing.
                temperature=0.2,
                max_output_tokens=4000,
                response_mime_type="application/json",
                # Thinking ENABLED here (unlike the generator). Accuracy and
                # grade-level judgement benefit from reasoning, and the
                # validator runs once per draft, not on every page load.
                thinking_config=types.ThinkingConfig(thinking_budget=2048),
            ),
        )

        text = (response.text or "").strip()
        if not text:
            raise ValueError("Empty response from validator")

        # Defensive parse — even with response_mime_type="application/json"
        # we strip stray code fences just in case the model misbehaves.
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n?|\n?```$", "", text).strip()

        result = json.loads(text)

        # Shape check — the orchestrator depends on these keys existing.
        if not isinstance(result, dict):
            raise ValueError("Validator response is not an object")
        for key in ("dimensions", "summary", "needs_revision"):
            if key not in result:
                raise ValueError(f"Validator response missing '{key}'")
        if not isinstance(result["dimensions"], dict):
            raise ValueError("Validator 'dimensions' is not an object")
        for dim in VALIDATOR_DIMENSIONS:
            if dim not in result["dimensions"]:
                raise ValueError(f"Validator missing dimension '{dim}'")
            entry = result["dimensions"][dim]
            if not isinstance(entry, dict) or "verdict" not in entry or "notes" not in entry:
                raise ValueError(f"Dimension '{dim}' malformed")
            if entry["verdict"] not in ("pass", "concern"):
                raise ValueError(f"Dimension '{dim}' has invalid verdict")

        return result

    except Exception as e:
        # Permissive default: if the validator itself fails, treat the draft
        # as acceptable. Better to ship a slightly imperfect draft than to
        # block a creator behind a flaky reviewer. Logged so we can investigate.
        print(f"⚠️ Validator failed ({type(e).__name__}: {e}); treating draft as acceptable")
        return {
            "dimensions": {
                dim: {"verdict": "pass", "notes": ""}
                for dim in VALIDATOR_DIMENSIONS
            },
            "summary": "Validator review unavailable for this draft.",
            "needs_revision": False,
        }


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
            config=types.GenerateContentConfig(
                max_output_tokens=2000,
                temperature=0.3,
                thinking_config=types.ThinkingConfig(thinking_budget=0)
            )
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


async def search_pexels_image(query: str) -> dict | None:
    """Search Pexels for a landscape photo matching query. Returns image dict or None."""
    api_key = os.getenv("PEXELS_API_KEY", "")
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://api.pexels.com/v1/search",
                headers={"Authorization": api_key},
                params={"query": query, "per_page": 3, "orientation": "landscape"}
            )
            data = r.json()
        if data.get("photos"):
            photo = data["photos"][0]
            return {
                "url": photo["src"]["large2x"],
                "alt": photo.get("alt") or query,
                "photographer": photo["photographer"]
            }
    except Exception as e:
        print(f"⚠️ Pexels search error for '{query}': {e}")
    return None


async def parse_and_enrich_sections(topic: str, content: str) -> list:
    """Parse content into sections and fetch a Pexels image for each."""
    paragraphs = content.split('\n\n')
    raw_sections = []
    current_heading = ""
    current_body_parts: list[str] = []

    for para in paragraphs:
        stripped = para.strip()
        asterisk_match = re.match(r'^\*\*(.+?)\*\*', stripped)
        emoji_match = re.match(
            r'^([🔥🌿🍖💎🏰🐲📖✨🎉🌟⭐🎯🚀🌍🎨🔬📚🎭🎪🌺🦋🌈⚡🎁🏆🎵🎲🔍🏞️☀️🔆🌱]\s+[^\n]+)',
            stripped
        )
        is_heading = asterisk_match or emoji_match

        if is_heading:
            if current_heading or current_body_parts:
                raw_sections.append({
                    "heading": current_heading,
                    "body": '\n\n'.join(current_body_parts).strip()
                })
            if asterisk_match:
                current_heading = asterisk_match.group(1)
                remainder = stripped[len(asterisk_match.group(0)):].strip()
                current_body_parts = [remainder] if remainder else []
            else:
                current_heading = emoji_match.group(1)
                remainder = stripped[len(current_heading):].strip()
                current_body_parts = [remainder] if remainder else []
        else:
            if stripped:
                current_body_parts.append(stripped)

    if current_heading or current_body_parts:
        raw_sections.append({
            "heading": current_heading,
            "body": '\n\n'.join(current_body_parts).strip()
        })

    # Build Pexels queries and fetch images concurrently
    def make_query(heading: str) -> str:
        # Strip emojis and punctuation, keep meaningful words
        clean = re.sub(r'[^\w\s]', ' ', heading)
        clean = re.sub(r'\s+', ' ', clean).strip().lower()
        words = [w for w in clean.split() if len(w) > 2][:4]
        if words:
            return ' '.join(words) + ' ' + topic.lower()
        return topic.lower() + ' nature'

    queries = [make_query(s["heading"]) for s in raw_sections]
    # Limit to 7 API calls max
    queries = queries[:7]
    raw_sections = raw_sections[:7]

    image_results = await asyncio.gather(
        *[search_pexels_image(q) for q in queries],
        return_exceptions=True
    )

    # Fallback image query
    async def get_fallback():
        return await search_pexels_image(f"{topic} nature landscape")

    fallback = None

    enriched = []
    for i, section in enumerate(raw_sections):
        img = image_results[i] if i < len(image_results) and isinstance(image_results[i], dict) else None
        if img is None:
            if fallback is None:
                fallback = await get_fallback()
            img = fallback or {"url": "", "alt": topic, "photographer": ""}
        enriched.append({
            "heading": section["heading"],
            "body": section["body"],
            "image_url": img["url"],
            "image_alt": img["alt"],
            "photographer": img["photographer"]
        })

    print(f"📸 Enriched {len(enriched)} sections with Pexels images for '{topic}'")
    return enriched


@app.post("/generate-audio")
async def generate_content_audio(request: AudioRequest, authorization: Optional[str] = Header(None)):
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

        if authorization and authorization.startswith("Bearer "):
            try:
                token = authorization[len("Bearer "):]
                payload = verify_jwt_token(token)
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
        if user_data.role not in ("creator", "student"):
            raise HTTPException(status_code=400, detail="role must be 'creator' or 'student'")

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

class TTSSectionRequest(BaseModel):
    text: str

@app.post("/tts-section")
async def tts_section(request: TTSSectionRequest):
    """Generate TTS for a single story section using OpenAI. Cached by content hash."""
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    text = request.text.strip()[:4096]
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()[:16]
    audio_file = AUDIO_CACHE_DIR / f"section_{text_hash}.mp3"

    if not audio_file.exists():
        try:
            response = client.audio.speech.create(
                model="tts-1",
                voice="nova",
                input=text,
                speed=0.92
            )
            with open(audio_file, 'wb') as f:
                for chunk in response.iter_bytes():
                    f.write(chunk)
            print(f"🎤 TTS section cached: section_{text_hash}.mp3")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

    return FileResponse(path=audio_file, media_type="audio/mpeg")


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
async def create_class(body: ClassCreate, current_user: dict = Depends(require_creator)):
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
async def list_classes(current_user: dict = Depends(require_creator)):
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
async def create_batch(class_id: int, body: BatchCreate, current_user: dict = Depends(require_creator)):
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
async def list_batches(class_id: int, current_user: dict = Depends(require_creator)):
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
async def assign_student(batch_id: int, body: AssignStudentRequest, current_user: dict = Depends(require_creator)):
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
async def remove_student(batch_id: int, student_id: int, current_user: dict = Depends(require_creator)):
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
async def list_batch_students(batch_id: int, current_user: dict = Depends(require_creator)):
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

async def prefetch_content(topic: str):
    """Background task: pre-generate and cache content + sections for a topic if not already cached."""
    try:
        cached = get_cached_content(topic, "Explorer")
        if cached:
            # If sections already present, nothing to do
            if cached.get("sections"):
                print(f"✅ Content + sections already cached for '{topic}' — skipping pre-generation")
                return
            # Content cached but sections missing — enrich now
            print(f"🔄 Fetching missing sections for cached '{topic}'...")
            sections = await parse_and_enrich_sections(topic, cached["content"])
            cache_content(cached["topic"], cached["skill_level"], cached["content"],
                          cached["word_count"], cached["readability_score"], sections)
            print(f"✅ Sections cached for '{topic}'")
            return
        print(f"🔄 Pre-generating content for '{topic}'...")
        content = await generate_topic_content(topic, "Explorer")
        fk_score = textstat.flesch_reading_ease(content)
        word_count = len(content.split())
        sections = await parse_and_enrich_sections(topic, content)
        cache_content(topic, "Explorer", content, word_count, fk_score, sections)
        print(f"✅ Pre-generation complete for '{topic}' ({word_count} words, {len(sections)} sections)")
    except Exception as e:
        print(f"⚠️ Pre-generation failed for '{topic}': {e}")


@app.post("/teacher/batches/{batch_id}/topics")
async def assign_topic(batch_id: int, body: AssignTopicRequest, current_user: dict = Depends(require_creator)):
    """Assign a topic to a batch and pre-generate its content in the background."""
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

    # Fire-and-forget: pre-generate content so students get instant load
    asyncio.create_task(prefetch_content(body.topic))

    return {"message": "Topic assigned", "batch_id": batch_id, "topic": body.topic}

@app.delete("/teacher/batches/{batch_id}/topics/{topic}")
async def remove_topic(batch_id: int, topic: str, current_user: dict = Depends(require_creator)):
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
async def list_batch_topics(batch_id: int, current_user: dict = Depends(require_creator)):
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
async def get_batch_progress(batch_id: int, current_user: dict = Depends(require_creator)):
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


@app.get("/student/progress")
async def get_student_progress(current_user: dict = Depends(require_student)):
    """Get the student's progress: completion status and quiz scores for all assigned topics,
    plus full chronological quiz history."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Assigned topics
    cursor.execute("""
        SELECT DISTINCT bt.topic
        FROM batch_topics bt
        JOIN batch_students bs ON bs.batch_id = bt.batch_id
        WHERE bs.student_id = ?
        ORDER BY bt.topic
    """, (current_user["id"],))
    assigned_topics = [row[0] for row in cursor.fetchall()]

    # Completed topics (any content viewed = completed)
    cursor.execute("""
        SELECT DISTINCT LOWER(topic) FROM user_progress WHERE user_id = ?
    """, (current_user["id"],))
    completed_set = {row[0] for row in cursor.fetchall()}

    # Best quiz score per topic
    cursor.execute("""
        SELECT LOWER(topic), MAX(score), total
        FROM quiz_results
        WHERE user_id = ?
        GROUP BY LOWER(topic)
    """, (current_user["id"],))
    quiz_best = {row[0]: {"score": row[1], "total": row[2]} for row in cursor.fetchall()}

    # Full quiz history (newest first)
    cursor.execute("""
        SELECT topic, score, total, taken_at
        FROM quiz_results
        WHERE user_id = ?
        ORDER BY taken_at DESC
    """, (current_user["id"],))
    quiz_history = [
        {"topic": row[0], "score": row[1], "total": row[2], "taken_at": row[3]}
        for row in cursor.fetchall()
    ]

    conn.close()

    # Build per-topic progress
    progress = []
    for topic in assigned_topics:
        q = quiz_best.get(topic.lower())
        progress.append({
            "topic": topic,
            "completed": topic.lower() in completed_set,
            "quiz_score": q["score"] if q else None,
            "quiz_total": q["total"] if q else None,
        })

    total_completed = sum(1 for p in progress if p["completed"])
    total_quizzes = len(quiz_history)

    return {
        "progress": progress,
        "quiz_history": quiz_history,
        "total_assigned": len(assigned_topics),
        "total_completed": total_completed,
        "total_quizzes": total_quizzes,
    }


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class FeedbackSubmit(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    message: str

@app.post("/feedback")
async def submit_feedback(data: FeedbackSubmit):
    """Save a feedback submission."""
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO feedback (name, email, role, message) VALUES (?, ?, ?, ?)",
        (data.name, data.email, data.role, data.message.strip())
    )
    conn.commit()
    conn.close()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)