# Clear stale CARGO_TARGET_DIR from other projects (e.g. memoryOS) before invoking Tauri.
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue

# If uvicorn is already running (common dev workflow), don't spawn a second backend.
try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8765/api/ping" -TimeoutSec 2 -UseBasicParsing
  if ($resp.StatusCode -eq 200) {
    $env:RESEARCHMIND_EXTERNAL_BACKEND = "1"
    Write-Host "[tauri] Using external backend at http://127.0.0.1:8765"
  }
} catch {
  # Tauri will spawn backend itself
}

& pnpm exec tauri @args
exit $LASTEXITCODE
