# Clear stale CARGO_TARGET_DIR from other projects (e.g. memoryOS) before invoking Tauri.
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
& pnpm exec tauri @args
exit $LASTEXITCODE
