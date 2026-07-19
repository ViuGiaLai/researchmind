"""Daily quota accounting.

Production uses Firestore for atomic, multi-instance counters. Development uses
an in-memory counter so the gateway remains easy to run locally.
"""

from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock
from fastapi import HTTPException

from .config import get_settings


class QuotaManager:
    def __init__(self) -> None:
        self._memory: dict[str, dict[str, int]] = defaultdict(lambda: {"requests": 0, "input_chars": 0})
        self._lock = Lock()

    @staticmethod
    def _day() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def reserve(self, user: dict, input_chars: int) -> dict[str, int]:
        settings = get_settings()
        uid = str(user["uid"])
        if user.get("auth") == "firebase" and settings.production:
            return self._reserve_firestore(uid, input_chars)
        key = f"{uid}:{self._day()}"
        with self._lock:
            usage = self._memory[key]
            self._check(usage, input_chars)
            usage["requests"] += 1
            usage["input_chars"] += input_chars
            return dict(usage)

    def current(self, user: dict) -> dict[str, int]:
        settings = get_settings()
        uid = str(user["uid"])
        if user.get("auth") == "firebase" and settings.production:
            from firebase_admin import firestore
            snapshot = firestore.client().collection("gateway_usage").document(f"{uid}_{self._day()}").get()
            return snapshot.to_dict() or {"requests": 0, "input_chars": 0}
        return dict(self._memory[f"{uid}:{self._day()}"])

    def _check(self, usage: dict, input_chars: int) -> None:
        settings = get_settings()
        if usage.get("requests", 0) >= settings.free_requests_per_day:
            raise HTTPException(status_code=429, detail="Free daily request limit reached")
        if usage.get("input_chars", 0) + input_chars > settings.free_input_chars_per_day:
            raise HTTPException(status_code=429, detail="Free daily context limit reached")

    def _reserve_firestore(self, uid: str, input_chars: int) -> dict[str, int]:
        from firebase_admin import firestore
        db = firestore.client()
        ref = db.collection("gateway_usage").document(f"{uid}_{self._day()}")
        transaction = db.transaction()

        @firestore.transactional
        def update(txn):
            snapshot = ref.get(transaction=txn)
            usage = snapshot.to_dict() or {"requests": 0, "input_chars": 0}
            self._check(usage, input_chars)
            usage["requests"] = usage.get("requests", 0) + 1
            usage["input_chars"] = usage.get("input_chars", 0) + input_chars
            txn.set(ref, {**usage, "day": self._day(), "uid": uid}, merge=True)
            return usage

        return update(transaction)


quota = QuotaManager()

