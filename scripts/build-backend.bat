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
if exist "apps\desktop\src-tauri\resources\backend.exe" del "apps\desktop\src-tauri\resources\backend.exe"

echo.
echo Building backend.exe (may take 10-30 minutes)...
echo.

pyinstaller ^
    --onefile ^
    --name backend ^
    --distpath apps\desktop\src-tauri\resources ^
    --workpath build_pyinstaller ^
    --specpath build_pyinstaller ^
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
    echo.
    echo === DONE ===
    echo.
    echo backend.exe is ready at: apps\desktop\src-tauri\resources\backend.exe
    echo Now run: cd apps\desktop ^&^& npx tauri build
) else (
    echo.
    echo backend.exe is at: apps\desktop\src-tauri\resources\backend.exe
)

pause
