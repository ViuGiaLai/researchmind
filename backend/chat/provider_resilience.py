"""Thread-safe provider circuit breaker and rolling health score."""
import threading
import time
from dataclasses import dataclass


@dataclass
class ProviderState:
    successes: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    opened_until: float = 0.0
    latency_ms: int = 0
class ProviderHealth:
    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 30.0):
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._states: dict[str, ProviderState] = {}
        self._lock = threading.Lock()
    def available(self, provider: str) -> bool:
        with self._lock:
            return self._states.setdefault(provider, ProviderState()).opened_until <= time.monotonic()
    def record(self, provider: str, success: bool, latency_ms: int) -> None:
        with self._lock:
            state = self._states.setdefault(provider, ProviderState())
            state.latency_ms = latency_ms
            if success:
                state.successes += 1
                state.consecutive_failures = 0
                state.opened_until = 0.0
            else:
                state.failures += 1
                state.consecutive_failures += 1
                if state.consecutive_failures >= self.failure_threshold:
                    state.opened_until = time.monotonic() + self.cooldown_seconds
    def score(self, provider: str) -> float:
        with self._lock:
            s = self._states.setdefault(provider, ProviderState())
            return round(((s.successes + 1) / (s.successes + s.failures + 2)) / (1 + s.latency_ms / 1000), 4)
    def snapshot(self) -> dict[str, dict]:
        with self._lock:
            return {
                name: {
                    "successes": state.successes,
                    "failures": state.failures,
                    "consecutive_failures": state.consecutive_failures,
                    "circuit_open": state.opened_until > time.monotonic(),
                    "latency_ms": state.latency_ms,
                }
                for name, state in self._states.items()
            }
    def rank(self, providers: list[str]) -> list[str]:
        """Prefer measured quality; preserve configured order for unseen peers."""
        indexed = list(enumerate(providers))
        return [
            provider for _, provider in sorted(
                indexed,
                key=lambda item: (-self.score(item[1]), item[0]),
            )
        ]
provider_health = ProviderHealth()
