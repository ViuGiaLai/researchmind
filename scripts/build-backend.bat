@echo off
REM Build backend.exe using PyInstaller
REM Usage:
REM   scripts\build-backend.bat            # build + copy for Tauri
REM   scripts\build-backend.bat --no-copy  # build only

cd /d "%~dp0.."

echo === Building backend.exe with PyInstaller ===
echo.

REM Install PyInstaller if needed
pip show pyinstaller >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

REM Clean previous build artifacts
if exist "build_pyinstaller" rmdir /s /q "build_pyinstaller"
if exist "backend.spec" del "backend.spec"

echo.
echo Building backend.exe (may take 10-30 minutes)...
echo.

pyinstaller ^
    --onedir ^
    --name backend ^
    --distpath . ^
    --workpath build_pyinstaller ^
    --specpath . ^
    --add-data "backend/ingestion;ingestion" ^
    --add-data "backend/search;search" ^
    --add-data "backend/chat;chat" ^
    --add-data "backend/config;config" ^
    --add-data "backend/db;db" ^
    --hidden-import uvicorn ^
    --hidden-import chromadb ^
    --collect-all sentence_transformers ^
    backend/main.py

if %errorlevel% neq 0 (
    echo.
    echo === FAILED ===
    pause
    exit /b 1
)

echo.
echo === PyInstaller build complete ===
echo.

REM Copy to Tauri resource folder for bundling
if /i not "%1"=="--no-copy" (
    echo Copying to apps\desktop\src-tauri\...
    if exist "apps\desktop\src-tauri\backend" rmdir /s /q "apps\desktop\src-tauri\backend"
    if exist "apps\desktop\src-tauri\backend.exe" del "apps\desktop\src-tauri\backend.exe"
    robocopy "backend" "apps\desktop\src-tauri\backend" /E /NJH /NJS /NP >nul
    echo.
    echo === DONE ===
    echo.
    echo Now run: cd apps\desktop ^&^& npx tauri build
) else (
    echo.
    echo backend.exe is at: backend\backend.exe
    echo Copy it to apps\desktop\src-tauri\backend\ before building Tauri.
)

pause
