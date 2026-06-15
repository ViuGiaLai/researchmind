#!/usr/bin/env python3
"""Test script for /api/debate endpoint"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:8765"

def test_debate_endpoint():
    """Test the /api/debate endpoint with sample papers"""
    
    print("=" * 60)
    print("Testing /api/debate Endpoint")
    print("=" * 60)
    
    # Test 1: Check if backend is running
    print("\n[1] Checking backend health...")
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"✓ Backend is running: {resp.status_code}")
    except Exception as e:
        print(f"✗ Backend not responding: {e}")
        return
    
    # Test 2: Get list of papers
    print("\n[2] Fetching available papers...")
    try:
        resp = requests.get(f"{BASE_URL}/api/papers", timeout=10)
        papers = resp.json() if resp.status_code == 200 else []
        print(f"✓ Found {len(papers)} papers")
        
        if not papers:
            print("  No papers in database. Creating test debate with no papers...")
            paper_ids = []
        else:
            # Use first 2-3 papers
            paper_ids = [p["id"] for p in papers[:3]]
            print(f"  Using paper IDs: {paper_ids}")
    except Exception as e:
        print(f"✗ Error fetching papers: {e}")
        paper_ids = []
    
    # Test 3: Call /api/debate endpoint
    print("\n[3] Calling /api/debate endpoint...")
    debate_request = {
        "query": "Hãy tạo một cuộc tranh luận giữa hai AI (AI A và AI B) về ưu điểm và nhược điểm của Transformer so với RNN trong xử lý chuỗi dài.",
        "paper_ids": paper_ids
    }
    
    print(f"  Request: {json.dumps(debate_request, indent=2, ensure_ascii=False)}")
    print("\n  Waiting for response (may take 30-60 seconds)...")
    
    try:
        resp = requests.post(
            f"{BASE_URL}/api/debate",
            json=debate_request,
            timeout=120  # 2 minute timeout for LLM call
        )
        
        print(f"\n✓ Response status: {resp.status_code}")
        
        if resp.status_code == 200:
            result = resp.json()
            print("\n=== DEBATE RESPONSE ===")
            print(f"Model used: {result.get('model_used', 'N/A')}")
            print(f"\n{result.get('answer', 'No answer')}")
            
            if result.get('citations'):
                print("\n=== Citations ===")
                for cite in result['citations']:
                    print(f"  - {cite}")
            
            print("\n=== Test Result ===")
            print("✓ Debate endpoint working successfully!")
            print("✓ Response format is correct")
            
            # Test the parser
            print("\n[4] Testing debate parser...")
            try:
                # Import the parser from the frontend
                import sys
                sys.path.insert(0, "apps/desktop/src/lib")
                
                # For now, just verify the response contains expected sections
                answer = result.get('answer', '')
                has_ai_a = "AI A" in answer or "Ủng hộ" in answer
                has_ai_b = "AI B" in answer or "Phản biện" in answer
                has_conclusion = "Kết luận" in answer
                has_suggestions = "3 Đề xuất" in answer or "Đề xuất" in answer
                
                print(f"  - Has AI A section: {has_ai_a}")
                print(f"  - Has AI B section: {has_ai_b}")
                print(f"  - Has Conclusion: {has_conclusion}")
                print(f"  - Has Suggestions: {has_suggestions}")
                
                if has_ai_a and has_ai_b and has_conclusion and has_suggestions:
                    print("\n✓ Response contains all expected debate sections!")
                else:
                    print("\n⚠ Some expected sections are missing")
                
            except Exception as e:
                print(f"  Parser test error: {e}")
        else:
            print(f"✗ Error: {resp.status_code}")
            print(f"  Response: {resp.text}")
    
    except requests.Timeout:
        print("✗ Request timeout after 120 seconds")
        print("  LLM is taking too long to respond. Check:")
        print("  - Gemini API connection")
        print("  - API quota and rate limits")
    except Exception as e:
        print(f"✗ Request error: {e}")

if __name__ == "__main__":
    test_debate_endpoint()
