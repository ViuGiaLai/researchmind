#!/usr/bin/env python3
"""Test Gemini API connectivity"""

import httpx
import json

def test_gemini_api():
    """Test basic Gemini API connectivity"""
    
    api_key = ""
    model = "gemini-1.5-flash"
    
    print(f"Testing Gemini API...")
    print(f"  Model: {model}")
    print(f"  API Key: {api_key[:20]}...")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Xin chào! Bạn là AI gì?"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 100,
        }
    }
    
    print(f"\nMaking request to: {url[:80]}...")
    
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, headers=headers, json=payload)
            
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            candidates = data.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                print(f"\n✓ Gemini API is working!")
                print(f"\nResponse:\n{content}")
            else:
                print(f"\n✗ No candidates in response")
                print(f"Full response: {json.dumps(data, ensure_ascii=False, indent=2)}")
        else:
            print(f"\n✗ Error: {response.status_code}")
            print(f"Response: {response.text}")
    
    except Exception as e:
        print(f"\n✗ Connection error: {e}")
        print(f"  Make sure you have internet connectivity")

if __name__ == "__main__":
    test_gemini_api()
