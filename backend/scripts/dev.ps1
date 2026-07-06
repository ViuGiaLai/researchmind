# Start backend for local dev — frees port 8765 from zombie uvicorn/tauri processes first.
$ErrorActionPreference = "Stop"
$port = 8765

Write-Host "Stopping processes listening on port $port..."
Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    if ($_ -and $_ -ne 0) {
      Write-Host "  taskkill PID $_"
      taskkill /F /PID $_ 2>$null | Out-Null
    }
  }
Start-Sleep -Milliseconds 500

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$venvPython = Join-Path $root "..\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  $venvPython = "python"
}

Write-Host "Starting uvicorn on http://127.0.0.1:$port (no --reload for stable desktop dev)"
& $venvPython -m uvicorn main:app --host 127.0.0.1 --port $port
