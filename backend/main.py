from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import openai
import textstat
import json
import requests
import random

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

class ContentRequest(BaseModel):
    topic: str
    dimension: str
    grade_level: int

class ContentResponse(BaseModel):
    topic: str
    dimension: str
    grade_level: int
    content: str
    readability_score: float
    word_count: int
    images: list

@app.get("/")
async def root():
    return {"message": "CurioLab API is running!"}

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
async def generate_content(request: ContentRequest):
    """Generate grade-appropriate content for a given topic and dimension."""
    
    if not client.api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    # Basic topic validation (just ensure it's not empty)
    if not request.topic or len(request.topic.strip()) < 2:
        raise HTTPException(status_code=400, detail="Topic must be at least 2 characters long")
    
    # Basic topic appropriateness check
    if not is_topic_appropriate(request.topic):
        raise HTTPException(status_code=400, detail="Please choose an educational topic appropriate for young learners")
    
    # Only allow grades 3-5
    if request.grade_level not in [3, 4, 5]:
        raise HTTPException(status_code=400, detail="Only grades 3-5 are supported in MVP")
    
    try:
        # Generate content using OpenAI
        content = await generate_topic_content(request.topic, request.dimension, request.grade_level)
        
        # Get relevant images from Unsplash
        images = await get_unsplash_images(request.topic, request.dimension, 3)
        
        # Calculate readability score
        fk_score = textstat.flesch_reading_ease(content)
        word_count = len(content.split())
        
        return ContentResponse(
            topic=request.topic,
            dimension=request.dimension,
            grade_level=request.grade_level,
            content=content,
            readability_score=fk_score,
            word_count=word_count,
            images=images
        )
        
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

async def generate_topic_content(topic: str, dimension: str, grade_level: int) -> str:
    """Generate educational content for any topic, dimension, and grade level using AI."""
    
    # Grade-specific vocabulary and complexity guidelines
    grade_guidelines = {
        3: {
            "vocab": "simple words, short sentences",
            "examples": "everyday examples kids can see and touch",
            "sentence_length": "8-12 words per sentence",
            "target_words": "200-300 words",
            "target_lines": "10-12 lines",
            "paragraphs": "2-3 short paragraphs"
        },
        4: {
            "vocab": "slightly more complex words, medium sentences", 
            "examples": "relatable examples with basic science terms",
            "sentence_length": "10-15 words per sentence",
            "target_words": "400-500 words",
            "target_lines": "18-22 lines", 
            "paragraphs": "3-4 paragraphs"
        },
        5: {
            "vocab": "grade-level vocabulary, varied sentence structures, some advanced terms with explanations",
            "examples": "detailed examples with scientific explanations and real-world connections",
            "sentence_length": "12-20 words per sentence", 
            "target_words": "700-900 words",
            "target_lines": "full page content with multiple sections",
            "paragraphs": "5-7 well-developed paragraphs with clear section breaks"
        }
    }
    
    guidelines = grade_guidelines[grade_level]
    
    system_prompt = f"""You are an expert children's educational writer who creates engaging, safe, age-appropriate magazine-style content like National Geographic Kids or Highlights.

CRITICAL SAFETY REQUIREMENTS:
- Content must be 100% safe and appropriate for children ages 8-18
- NO violence, weapons, death, injury, scary or disturbing content
- NO inappropriate, sexual, or mature themes whatsoever  
- NO political controversy, divisive topics, or sensitive current events
- NO graphic descriptions or frightening scenarios
- Focus only on positive, educational, inspiring, and uplifting content
- Use encouraging, wonder-filled language that builds curiosity safely
- If any aspect of the topic could be inappropriate, focus only on safe educational angles

GRADE LEVEL: {grade_level}
TOPIC: {topic.title()} - {dimension.title()}

CONTENT REQUIREMENTS:
- Write EXACTLY {guidelines['target_words']} total words (this is crucial!)
- Create {guidelines['paragraphs']} with clear section headings
- Structure like a children's magazine article with multiple sections
- Use {guidelines['vocab']}
- Keep sentences to {guidelines['sentence_length']}
- Use {guidelines['examples']}

MAGAZINE-STYLE STRUCTURE:
- **Engaging Title/Hook**: Start with something that grabs attention
- **Introduction Section**: Brief, exciting overview that builds curiosity  
- **Main Sections**: 3-4 distinct sections with subheadings, each covering different aspects
- **Fun Facts Box**: Include surprising, cool facts kids would love
- **Real-World Connections**: How this relates to kids' lives today
- **Conclusion**: End with wonder and questions that inspire further learning

WRITING STYLE:
- Write like you're talking to curious, intelligent kids
- Use vivid descriptions and imagery that paint pictures in their minds
- Include surprising facts, cool examples, and "wow" moments
- Make complex ideas accessible through analogies kids understand
- Create natural breaks between sections (perfect for images later)
- Balance education with entertainment - make learning FUN!

Focus on the {dimension} aspect of {topic} and make it feel like the most interesting magazine article they've ever read about this topic."""

    # AI generates the specific content prompt based on topic and dimension
    content_prompt = f"""Write a fascinating magazine article about {topic} focusing on the {dimension} aspects.

REQUIREMENTS:
- Make it perfect for grade {grade_level} students who are curious about {topic}
- Focus specifically on {dimension} aspects of {topic}
- Include multiple sections with clear headings
- Add surprising facts and "did you know?" moments
- Use vivid descriptions that help kids visualize what you're describing
- Include real examples and stories that connect to their world
- Create natural section breaks (these will have images added later)

STRUCTURE YOUR ARTICLE:
1. **Catchy opening** that hooks the reader immediately
2. **3-4 main sections** with subheadings covering different {dimension} aspects of {topic}
3. **Fun facts section** with amazing details kids will want to share
4. **Real-world connections** showing how this relates to their daily lives
5. **Inspiring conclusion** that makes them want to learn more

Remember: This should feel like the coolest magazine article about {topic} they've ever read, specifically exploring the {dimension} side of this amazing topic!"""

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)