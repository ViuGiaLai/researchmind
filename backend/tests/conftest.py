"""Pytest configuration for graphRAG tests."""

import sys
from pathlib import Path

# Ensure backend/ is importable
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
