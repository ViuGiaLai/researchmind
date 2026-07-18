"""Split an answer into atomic, citation-aware claims."""
import re
def decompose_claims(answer: str) -> list[dict]:
    claims = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", answer or ""):
        sentence = sentence.strip()
        if not sentence: continue
        citations = re.findall(r"\[[^\]]+\]", sentence)
        text = re.sub(r"\s*\[[^\]]+\]", "", sentence).strip()
        if len(text.split()) >= 3: claims.append({"claim": text, "citations": citations})
    return claims
