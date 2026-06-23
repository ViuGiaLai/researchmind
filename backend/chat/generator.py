"""Bridge module for chat generator to support legacy imports. Exposes PatchedGenerator as Generator and GenerationResult from types."""

from .patched_generator import PatchedGenerator as Generator
from .types import GenerationResult
