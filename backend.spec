# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules

datas = [
    ('backend/ingestion', 'ingestion'),
    ('backend/search', 'search'),
    ('backend/chat', 'chat'),
    ('backend/config', 'config'),
    ('backend/db', 'db'),
]

binaries = []

hiddenimports = [
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
]

# Thu thập toàn bộ module của ChromaDB
hiddenimports += collect_submodules("chromadb")

# Thu thập toàn bộ module của Tokenizers
hiddenimports += collect_submodules("tokenizers")

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