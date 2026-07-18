import type { HelpSectionContent, HelpSectionId } from "./helpContent";

const VERSION = "0.6.0";
const GITHUB = "https://github.com/researchmind/researchmind";

export const HELP_SECTIONS_EN: Record<HelpSectionId, HelpSectionContent> = {
  home: { id: "home", title: "Help Center", subtitle: "Evidence-first research: documentation, FAQs, and quick guidance", blocks: [
    { type: "p", text: "Welcome to ResearchMind — an evidence-first workspace that helps you build verifiable conclusions from your own papers." },
    { type: "h3", text: "Quick start" }, { type: "ul", items: ["Open Library → select a PDF folder or import documents", "Use AI Chat to ask questions about selected papers", "Open Review or Evidence for structured analysis", "Explore Labs: Deep Analysis, Personal Brain, Daily Reader, and Graph"] },
    { type: "h3", text: "Documentation" }, { type: "ul", items: ["Getting started — introduction and your first library", "User guide — each core module", "AI features — chat, review, debate, and citations", "Import and export — PDF, BibTeX, Zotero, and more", "FAQ and troubleshooting — common questions and fixes"] },
  ] },
  "getting-started": { id: "getting-started", title: "Getting started", subtitle: "Meet ResearchMind and complete the first steps", blocks: [
    { type: "h3", text: "What is ResearchMind?" }, { type: "p", text: "A desktop app that turns papers into verifiable answers, evidence, and reviews while keeping your library data on your device." },
    { type: "h3", text: "Core features" }, { type: "ul", items: ["Library — folder scanning, search, highlights, and PDF viewing", "AI Chat — ask questions about a paper or your whole library", "Review — insights, screening, and review building", "Evidence — criteria-based evidence matrices", "Labs — deep analysis, Personal Brain, Daily Reader, and knowledge graphs"] },
    { type: "h3", text: "Add documents" }, { type: "ol", items: ["Open Library → Import, or select a folder containing PDFs", "Wait for scanning and indexing to finish", "Select a paper to view its details or start a chat"] },
    { type: "h3", text: "Create your first library" }, { type: "ol", items: ["Complete the AI Setup Wizard and choose Cloud Free, a custom API, or a local model", "Select the research folder on your drive", "ResearchMind indexes metadata and embeddings for semantic search"] },
  ] },
  "user-guide": { id: "user-guide", title: "User guide", subtitle: "Learn each area of the application", blocks: [
    { type: "h3", text: "Manage your library" }, { type: "ul", items: ["Browse papers in a list or a split view with the PDF", "Filter by tag, year, and reading status", "Use full-text and semantic search in Search", "Attach quotation notes to PDF pages with Highlights"] },
    { type: "h3", text: "AI Chat" }, { type: "ul", items: ["Select a paper and choose Chat, or open AI Chat directly", "Enable Evidence only to require document citations", "Export conversations, copy citations, or open a cited PDF passage"] },
    { type: "h3", text: "Review papers" }, { type: "ul", items: ["Insights — summarize and compare papers", "Screening — classify papers as include, exclude, or maybe", "Review Builder — assemble a structured review"] },
    { type: "h3", text: "Extract evidence" }, { type: "p", text: "The Evidence Matrix organizes claims by paper and criterion. Select a cell to inspect its quotation and source." },
    { type: "h3", text: "Notes and export" }, { type: "ul", items: ["Highlights are stored in your library and linked to the PDF viewer", "Export BibTeX, copy citations, or export chats and reviews as Markdown"] },
  ] },
  "ai-features": { id: "ai-features", title: "AI features", subtitle: "AI capabilities available in ResearchMind", blocks: [
    { type: "h3", text: "Summaries and AI Chat" }, { type: "p", text: "Summarize papers, hold streaming multi-turn conversations, and verify conclusions through citations and the trust panel." },
    { type: "h3", text: "AI review and critique" }, { type: "p", text: "Analyze methods, strengths, weaknesses, and improvements using evidence from your documents." },
    { type: "h3", text: "AI debate" }, { type: "p", text: "Simulate a debate between different perspectives on a paper or topic." },
    { type: "h3", text: "Research-gap analysis" }, { type: "p", text: "Identify research gaps across selected papers." },
    { type: "h3", text: "Citations and search" }, { type: "ul", items: ["Citation panel — APA, IEEE, BibTeX, and more", "Semantic search — search by meaning, not only keywords", "Reranking improves result relevance"] },
    { type: "h3", text: "Deep Analysis (Wow)" }, { type: "p", text: "A multi-step pipeline for summaries, methods, limitations, contributions, and suggested next steps." },
  ] },
  "import-export": { id: "import-export", title: "Import and export", subtitle: "Bring data in and take it out", blocks: [
    { type: "h3", text: "Import" }, { type: "ul", items: ["PDF — scan a folder or drag and drop individual files", "BibTeX / RIS — import metadata in batches", "Zotero — configure its data-folder path in Settings", "Word — supported through the extraction pipeline when available"] },
    { type: "h3", text: "Export" }, { type: "ul", items: ["BibTeX — export all or selected papers", "Copy citations in multiple academic styles", "Export chats and reviews as Markdown or to the clipboard", "Export EndNote-compatible RIS"] },
  ] },
  "settings-help": { id: "settings-help", title: "Settings", subtitle: "AI providers, appearance, storage, and privacy", blocks: [
    { type: "h3", text: "AI provider" }, { type: "ul", items: ["Cloud Free — start without an API key", "Custom API — configure Gemini, DeepSeek, Claude, and other providers", "Local — use llama-server offline when your RAM or VRAM is sufficient"] },
    { type: "h3", text: "Appearance" }, { type: "ul", items: ["Choose Light, Dark, or System mode", "The AI Workspace theme is optimized for both light and dark mode"] },
    { type: "h3", text: "Language and API keys" }, { type: "p", text: "API keys are stored locally. Local mode does not send papers to an external provider." },
    { type: "h3", text: "Backup and local storage" }, { type: "ul", items: ["Indexes and caches remain on your device", "Clear embedding or LLM caches in Data settings to reclaim space", "Back up the application data folder regularly"] },
  ] },
  faq: { id: "faq", title: "Frequently asked questions", subtitle: "FAQ", blocks: [{ type: "faq", items: [
    { q: "Why is the AI response slow?", a: "Cloud models depend on the network; local models depend on CPU and GPU resources. Try reducing the paper context or selecting a smaller model." },
    { q: "Why can’t ResearchMind read a PDF?", a: "It may contain scanned images that require OCR, be encrypted, or have moved. Open it in another reader and rescan the library." },
    { q: "Why is a citation incorrect?", a: "Metadata may lack an author or year. Edit the paper metadata or select a suitable style in the citation panel." },
    { q: "Which model should I use?", a: "Use Cloud Free to start, a custom API for higher quality, or Local for maximum privacy when you have enough hardware resources." },
    { q: "Is my data uploaded to the cloud?", a: "Not in Local mode. Cloud modes send only the required prompt to your selected provider; the paper index remains on your device." },
  ] }] },
  shortcuts: { id: "shortcuts", title: "Keyboard shortcuts", subtitle: "Navigate ResearchMind faster", blocks: [
    { type: "shortcuts", items: [{ keys: "Ctrl + K", action: "Open quick search or focus search" }, { keys: "Ctrl + F", action: "Find on the page or in the PDF viewer" }, { keys: "Ctrl + Enter", action: "Send a chat message" }, { keys: "Esc", action: "Close a dialog, Help Center, or menu" }, { keys: "/", action: "Focus the chat input when Chat is open" }, { keys: "Ctrl + ,", action: "Open Settings" }] },
    { type: "p", text: "Additional shortcuts may be introduced as modules evolve." },
  ] },
  "release-notes": { id: "release-notes", title: "What’s new", subtitle: "Release notes", blocks: [{ type: "releases", items: [
    { version: "v0.6.0", items: ["AI Workspace interface with light, dark, and system modes", "Updated Help Center, welcome tour, and release notes", "APA and IEEE citation export with quick copy", "Privacy indicator, onboarding, and core shortcuts"] },
    { version: "v0.5.x", items: ["Evidence Matrix and Trust Panel", "Wow Analysis pipeline", "Personal Brain and Daily Reader"] },
  ] }] },
  troubleshooting: { id: "troubleshooting", title: "Troubleshooting", subtitle: "Resolve common problems", blocks: [
    { type: "h3", text: "AI errors" }, { type: "ul", items: ["Check backend health in Settings", "Verify the API key or confirm that llama-server is running for Local mode", "Inspect the terminal log when running pnpm tauri dev"] },
    { type: "h3", text: "Embedding errors" }, { type: "ul", items: ["Clear the embedding cache in Settings → Data", "Reindex the library after changing the embedding model"] },
    { type: "h3", text: "Import errors" }, { type: "ul", items: ["Confirm that the app can read the folder and OneDrive is not locking it", "Try opening a potentially damaged PDF in Acrobat or Edge"] },
    { type: "h3", text: "GPU and local models" }, { type: "ul", items: ["If VRAM is insufficient, select a smaller model or use the CPU", "Install a current GPU driver for CUDA or Metal"] },
  ] },
  about: { id: "about", title: "About ResearchMind", subtitle: "Version, license, and links", blocks: [
    { type: "p", text: `ResearchMind v${VERSION} — an evidence-first workspace built for verifiable research and local data ownership.` },
    { type: "h3", text: "Information" }, { type: "ul", items: [`Version: ${VERSION}`, "License: see the GitHub repository", "Data: stored locally on your device"] },
    { type: "links", items: [{ label: "GitHub", href: GITHUB }, { label: "Report a bug", href: `${GITHUB}/issues/new` }, { label: "Contact support", href: "mailto:support@researchmind.app" }] },
  ] },
};
