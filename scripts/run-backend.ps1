$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"
$backend = Join-Path $repoRoot "backend"

if (-not (Test-Path $python)) {
    Write-Error "Virtual environment not found at $python. Create it first, then install backend\requirements.txt."
}

Set-Location $backend
& $python -m uvicorn main:app --reload --port 8765
