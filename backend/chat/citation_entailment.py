"""Deterministic claim-to-passage support scoring with no extra model call."""
import re

_WORD = re.compile(r"\b[\w-]{3,}\b", re.UNICODE)
_STOP = {"the", "and", "that", "this", "with", "from", "were", "have", "page", "paper"}
def entailment_score(claim: str, passage: str) -> float:
    claim_terms = {w.lower() for w in _WORD.findall(claim or "")} - _STOP
    passage_terms = {w.lower() for w in _WORD.findall(passage or "")} - _STOP
    return 0.0 if not claim_terms or not passage_terms else round(len(claim_terms & passage_terms) / len(claim_terms), 3)
def support_label(score: float) -> str:
    return "entailed" if score >= 0.6 else ("partial" if score >= 0.3 else "unsupported")


class MultilingualEntailmentVerifier:
    """Optional XNLI verifier with deterministic offline fallback."""
    def __init__(self, model: str = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"):
        self.model = model
        self._pipeline = None
        self._load_attempted = False
    def _load(self):
        if self._load_attempted:
            return self._pipeline
        self._load_attempted = True
        try:
            from transformers import pipeline
            self._pipeline = pipeline("text-classification", model=self.model, tokenizer=self.model)
        except Exception:
            self._pipeline = None
        return self._pipeline
    def verify(self, claim: str, passage: str) -> dict:
        nli = self._load()
        if nli is None:
            score = entailment_score(claim, passage)
            return {"label": support_label(score), "score": score, "method": "lexical_fallback"}
        output = nli({"text": passage, "text_pair": claim}, truncation=True)[0]
        label = str(output.get("label", "")).lower()
        mapped = "entailed" if "entail" in label else ("contradicted" if "contrad" in label else "insufficient")
        return {"label": mapped, "score": round(float(output.get("score", 0)), 3), "method": "multilingual_nli"}
