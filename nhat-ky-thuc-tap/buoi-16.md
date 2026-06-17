# Buổi 16 — Thứ 2, 20/07/2026

## Nội dung
- Xây dựng Onboarding Wizard (AISetupWizard)

## Đã làm
1. Code `AISetupWizard.tsx` — 5-step onboarding wizard (1054 dòng)
2. Step 1 — Welcome: hardware scan animation (CPU, RAM, storage), auto suggest model tier
3. Step 2 — Choose AI Mode: 3 cards (Cloud Free, Custom Key, Local) với so sánh
4. Step 3 — Configure: API key input với provider tabs (DeepSeek/Gemini/Claude), validation, links
5. Step 4 — Storage: directory picker, disk space gauge, warning <10GB
6. Step 5 — Done: "cyber activation" animation, quick start dashboard
7. Local mode: Ollama connectivity check, model pull progress bar, install guide
8. Step tracker indicator ở bottom

## Học được
- UX onboarding "zero-friction" design
- Animated UI với CSS transitions

## Kết quả đạt được
- Onboarding wizard hoàn chỉnh, auto-detect specs, zero-friction setup

## Kế hoạch buổi sau
- Testing + Fix bug toàn bộ luồng

---
**Ký tên:** Rmah Viu
