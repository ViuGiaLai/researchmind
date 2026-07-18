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
    'uvicorn.loggers',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'app_state',
    'starlette',
    'pydantic',
    'pydantic_settings',
    'multipart',
    'dotenv',

    # === Database ===
    'sqlalchemy',
    'aiosqlite',

    # === Templates ===
    'jinja2',
    'jinja2.ext',
    'markupsafe',

    # === HTTP client ===
    'httpx',
    'anyio',
    'certifi',
    'httpcore',
    'idna',
    'sniffio',

    # === PDF / OCR / Image ===
    'fitz',             # PyMuPDF
    'PIL',
    'PIL._imaging',
    'PIL.ExifTags',
    'PIL.Image',
    'PIL.ImageDraw',
    'PIL.ImageFont',
    'numpy',
    'onnxruntime',
    'cv2',              # opencv-python
    'pyclipper',
    'shapely',
    'six',

    # === ChromaDB core ===
    'tqdm',
    'bcrypt',
    'build',
    'hnswlib',
    'grpc',
    'grpc._channel',
    'grpc.aio',
    'importlib_resources',
    'kubernetes',
    'kubernetes.client',
    'kubernetes.config',
    'kubernetes.watch',
    'mmh3',
    'orjson',
    'overrides',
    'posthog',
    'pypika',
    'tenacity',
    'typer',
    'rich',
    'yaml',
    'typing_extensions',
    'opentelemetry',
    'opentelemetry.sdk',
    'opentelemetry.sdk.trace',
    'opentelemetry.sdk.resources',
    'opentelemetry.exporter.otlp.proto.grpc',
    'opentelemetry.instrumentation.fastapi',

    # === Tokenizers & Huggingface ===
    'tokenizers',
    'huggingface_hub',

    # === LLM Providers ===
    'anthropic',
    'groq',

    # === Token counting ===
    'tiktoken',

    # === Graph / Community detection ===
    'networkx',
    'community',         # python-louvain
    'graspologic',

    # === Document export/import ===
    'docx',              # python-docx
    'ebooklib',
    'fpdf',              # fpdf2
    'lxml',
    'lxml.etree',
    'lxml.html',
    'defusedxml',
    'fontTools',

    # === Web search ===
    'duckduckgo_search',
    'click',
    'primp',

    # === ML / Embedding / Reranking ===
    'sentence_transformers',
    'transformers',
    'torch',
    'torch.nn',
    'torch.nn.modules',
    'torch.jit',
    'torch._C',
    'torch.utils',
    'torch.utils.data',
    'sklearn',
    'sklearn.cluster',
    'sklearn.metrics',
    'scipy',
    'scipy.sparse',
    'scipy.cluster',
    'joblib',
    'narwhals',
    'threadpoolctl',
    'filelock',
    'fsspec',
    'setuptools',
    'sympy',
    'safetensors',
    'regex',
    'packaging',

    # === System ===
    'psutil',
    'distro',
    'colorama',
    'win32_setctime',
    'loguru',
    'loguru._logger',
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
    excludes=[],
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
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
