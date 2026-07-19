# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

datas = [
    ('backend/ingestion', 'ingestion'),
    ('backend/search', 'search'),
    ('backend/chat', 'chat'),
    ('backend/config', 'config'),
    ('backend/db', 'db'),
    ('backend/routers', 'routers'),
    ('backend/prompts', 'prompts'),
    ('backend/locales', 'locales'),
    ('backend/evaluation/fixtures', 'evaluation/fixtures'),
    ('backend/common', 'common'),
    ('backend/graph', 'graph'),
    ('backend/academic', 'academic'),
    ('backend/research', 'research'),
    ('backend/ai', 'ai'),
    ('backend/export.py', 'export.py'),
    ('backend/zotero_import.py', 'zotero_import.py'),
    ('backend/app_state.py', 'app_state.py'),
]

# Include chromadb & onnxruntime data files (e.g. ONNX model)
datas += collect_data_files("chromadb")
datas += collect_data_files("onnxruntime")

binaries = []

hiddenimports = [
    # === Web framework ===
    'uvicorn',
    'starlette',
    'pydantic',
    'pydantic_settings',
    'multipart',
    'dotenv',

    # === Database ===
    'sqlalchemy',

    # === Templates ===
    'jinja2',
    'markupsafe',

    # === HTTP client ===
    'httpx',
    'certifi',

    # === PDF / OCR / Image ===
    'fitz',             # PyMuPDF
    'PIL',
    'numpy',
    'onnxruntime',
    'pyclipper',
    'shapely',

    # === ChromaDB core ===
    'tqdm',
    'bcrypt',
    'hnswlib',
    'grpc',
    'mmh3',
    'orjson',
    'overrides',
    'pypika',
    'tenacity',
    'yaml',
    'typing_extensions',

    # === Tokenizers (chromadb lazy dep for ONNX embeddings) ===
    'tokenizers',

    # === LLM Providers ===
    'anthropic',

    # === Token counting ===
    'tiktoken',

    # === Graph / Community detection ===
    'networkx',
    'community',         # python-louvain

    # === Document export/import ===
    'docx',              # python-docx
    'ebooklib',
    'fpdf',              # fpdf2
    'lxml',

    # === Web search ===
    'duckduckgo_search',

    # === ML / Embedding / Reranking (optional — guarded by try/except) ===
    'sentence_transformers',
    'transformers',
    'sklearn',
    'sklearn.cluster',
    'sklearn.metrics',

    # === System ===
    'psutil',
    'loguru',
    'keyring',
    'keyring.backends',
    'cryptography',
    'cryptography.hazmat.primitives.asymmetric.ed25519',
]

# Thu thập toàn bộ module của ChromaDB
hiddenimports += collect_submodules("chromadb")

# Thu thập toàn bộ module của Tokenizers
hiddenimports += collect_submodules("tokenizers")

# Thu thập toàn bộ module của onnxruntime (hay bị thiếu submodules)
hiddenimports += collect_submodules("onnxruntime")

a = Analysis(
    ['backend/main.py'],
    pathex=['.', 'backend'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch'],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
