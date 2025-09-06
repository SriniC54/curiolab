#!/usr/bin/env python3

import requests
import json

def test_image_integration():
    """Test that the backend returns proper images for various topics"""
    
    # Test data
    test_cases = [
        {"topic": "dragons", "dimension": "mythology", "grade_level": 5},
        {"topic": "pizza", "dimension": "nutrition", "grade_level": 4},
        {"topic": "space", "dimension": "science", "grade_level": 5},
        {"topic": "robots", "dimension": "science", "grade_level": 4},
        {"topic": "unknown_topic", "dimension": "science", "grade_level": 3}
    ]
    
    for case in test_cases:
        print(f"\n🧪 Testing: {case['topic']} - {case['dimension']} (Grade {case['grade_level']})")
        
        try:
            response = requests.post(
                "http://localhost:8000/generate-content",
                headers={"Content-Type": "application/json"},
                json=case,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                images = data.get('images', [])
                
                print(f"✅ Success! Generated {len(images)} images")
                print(f"   Content length: {len(data.get('content', ''))} characters")
                print(f"   Word count: {data.get('word_count', 0)} words")
                print(f"   Readability: {data.get('readability_score', 0):.1f}")
                
                for i, img in enumerate(images):
                    print(f"   📸 Image {i+1}: {img['id']} - {img['alt']}")
                    
            else:
                print(f"❌ Failed with status: {response.status_code}")
                print(f"   Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
    
    print(f"\n🎯 Test completed!")

if __name__ == "__main__":
    test_image_integration()