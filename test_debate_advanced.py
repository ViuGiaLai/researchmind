#!/usr/bin/env python3
"""Create test papers and run debate test"""

import requests
import json
import time
from pathlib import Path

BASE_URL = "http://127.0.0.1:8765"

def create_test_papers():
    """Create test papers via the API"""
    
    print("Creating test papers...")
    
    test_papers = [
        {
            "title": "Attention Is All You Need",
            "authors": ["Vaswani", "Shazeer", "Parmar"],
            "year": 2017,
            "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. In this work, we propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
            "content": "This paper introduces the Transformer architecture. The key innovation is the self-attention mechanism which allows the model to attend to different positions of the input sequence. Unlike RNNs which process sequences sequentially, Transformers can process entire sequences in parallel. This leads to faster training and the ability to capture long-range dependencies more effectively.",
            "url": "https://arxiv.org/abs/1706.03762"
        },
        {
            "title": "Long Short-Term Memory Networks",
            "authors": ["Hochreiter", "Schmidhuber"],
            "year": 1997,
            "abstract": "Learning to store information over extended time intervals by recurrent backpropagation takes a very long time, mostly because of insufficient, decaying error backflow. We briefly review Hochreiter's analysis of this problem, then address it by introducing a novel, efficient, gradient based method.",
            "content": "LSTMs solve the vanishing gradient problem in RNNs through gated memory cells. Each LSTM cell contains a forget gate, input gate, and output gate which control the flow of information. This allows LSTMs to learn dependencies over long sequences without the gradient decay issues that plague vanilla RNNs. LSTMs became the dominant architecture before Transformers were introduced.",
            "url": "https://arxiv.org/abs/physics/9703028"
        },
        {
            "title": "BERT: Pre-training of Deep Bidirectional Transformers",
            "authors": ["Devlin", "Chang", "Lee", "Toutanova"],
            "year": 2018,
            "abstract": "We introduce BERT, a new pre-training method for natural language understanding. BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.",
            "content": "BERT demonstrates how to effectively pre-train Transformers on large amounts of unlabeled text. It uses masked language modeling and next sentence prediction as pre-training objectives. BERT achieves state-of-the-art results on many NLP benchmarks. This paper shows the power of Transformer-based models for understanding language.",
            "url": "https://arxiv.org/abs/1810.04805"
        }
    ]
    
    paper_ids = []
    
    for i, paper in enumerate(test_papers, 1):
        print(f"  [{i}] {paper['title']}...", end=" ")
        try:
            # Create a simple text file to upload
            temp_file_path = Path(f"/tmp/test_paper_{i}.txt")
            temp_file_path.write_text(f"{paper['title']}\n\n{paper['abstract']}\n\n{paper['content']}")
            
            # Upload via API - but we need a PDF endpoint
            # For now, let's just create a mock request
            print("Skipped (no upload endpoint)")
            
        except Exception as e:
            print(f"Error: {e}")
    
    print("\nNote: Test papers need to be added via PDF import or database seeding.")
    return paper_ids

def test_debate_without_papers():
    """Test debate endpoint with a question that doesn't require papers"""
    
    print("\n" + "=" * 60)
    print("Testing /api/debate with General Question")
    print("=" * 60)
    
    # Try a debate that doesn't require papers
    debate_request = {
        "query": "Hãy tạo một cuộc tranh luận giữa hai AI về câu hỏi: Transformer hay RNN tốt hơn cho xử lý chuỗi dài?",
        "paper_ids": []  # Empty paper IDs - should still work for general knowledge
    }
    
    print(f"\nRequest: {json.dumps(debate_request, indent=2, ensure_ascii=False)}")
    print("\nCalling /api/debate... (may take 30-60 seconds)")
    
    try:
        resp = requests.post(
            f"{BASE_URL}/api/debate",
            json=debate_request,
            timeout=120
        )
        
        print(f"Response status: {resp.status_code}\n")
        
        if resp.status_code == 200:
            result = resp.json()
            print("=== DEBATE RESPONSE ===\n")
            print(result.get('answer', 'No answer'))
            
            # Check for debate structure
            answer = result.get('answer', '')
            has_ai_a = "AI A" in answer
            has_ai_b = "AI B" in answer
            has_conclusion = "Kết luận" in answer
            has_suggestions = "Đề xuất" in answer
            
            print("\n=== STRUCTURE CHECK ===")
            print(f"AI A section: {'✓' if has_ai_a else '✗'}")
            print(f"AI B section: {'✓' if has_ai_b else '✗'}")
            print(f"Conclusion: {'✓' if has_conclusion else '✗'}")
            print(f"Suggestions: {'✓' if has_suggestions else '✗'}")
            
            if has_ai_a and has_ai_b and has_conclusion and has_suggestions:
                print("\n✓ DEBATE FEATURE WORKING - Parser should handle this output correctly!")
            else:
                print("\n⚠ Response missing some expected sections")
        else:
            print(f"Error: {resp.text}")
    
    except requests.Timeout:
        print("✗ Timeout - LLM not responding in time")
    except Exception as e:
        print(f"✗ Error: {e}")

if __name__ == "__main__":
    print("=== Debate Feature Test Suite ===\n")
    create_test_papers()
    test_debate_without_papers()
