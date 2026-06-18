# CI/CD Flow - ResearchMind

## Khi push code thường (lên nhánh main)

Chỉ chạy test/lint cho phần code thay đổi (~2-3 phút):

| File thay đổi | Job chạy |
|--------------|----------|
| `apps/desktop/src/**` | `lint-frontend` (tsc + vitest) |
| `backend/**` | `test-backend` (pytest) |
| `apps/desktop/src-tauri/**` | `lint-rust` (clippy + fmt) |

## Khi tạo release (tag v*)

```bash
git tag v0.2.0
git push origin v0.2.0
```

CI sẽ:
1. Chạy hết lint + test
2. Build backend bằng PyInstaller
3. Bundle vào Tauri app
4. Build desktop app cho cả 3 nền tảng
5. Tạo GitHub Release + upload file tải

## File tải ra

| Nền tảng | Định dạng |
|----------|-----------|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg` |
| Linux | `.AppImage` + `.deb` |

## Dependabot

Tự động tạo PR cập nhật dependencies vào mỗi tuần:
- `npm` (frontend React)
- `pip` (Python backend)
- `cargo` (Rust Tauri)
- `github-actions`

## GitHub Pages

`docs/index.html` tự động deploy sau mỗi lần push main.
Link: https://viugialai.github.io/researchmind
