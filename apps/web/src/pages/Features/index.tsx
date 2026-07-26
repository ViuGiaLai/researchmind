import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  FileText,
  Hourglass,
  RefreshCw,
  FolderOpen,
  Link,
  ClipboardList,
  Star,
  Folder,
  Bookmark,
  Tag,
  PenTool,
  BookOpen,
  Search,
  Crosshair,
  Save,
  BarChart3,
  Lightbulb,
  MessageSquare,
  Paperclip,
  HelpCircle,
  Zap,
  Globe,
  FileEdit,
  Pencil,
  CheckCircle,
  Upload,
  TrendingUp,
  Settings,
  Download,
  Palette,
  Trash2,
  Calendar,
  Flame,
  Cloud,
  Key,
  Monitor,
  FlaskConical,
  Lock,
  Scale,
  CreditCard,
  LockKeyhole,
  GraduationCap,
  Keyboard,
  Smartphone,
  Shield,
  Users,
  Plus,
} from "lucide-react";

/* ─── Data ──────────────────────────────────────────────────── */

const SIDEBAR_SECTIONS = [
  { category: "Core" },
  { id: "import", label: "1. Import & Indexing" },
  { id: "library", label: "2. Library & Collections" },
  { id: "search", label: "3. Hybrid Search" },
  { id: "chat", label: "4. AI Chat" },
  { id: "review", label: "5. Review Builder" },
  { id: "evidence", label: "6. Evidence Matrix" },
  { category: "Discover & Analyze" },
  { id: "discovery", label: "7. Discovery" },
  { id: "workspace", label: "8. Project Workspace" },
  { id: "insights", label: "9. Insights" },
  { id: "deep", label: "10. Deep Analysis" },
  { id: "graph", label: "11. Knowledge Graph" },
  { id: "brain", label: "12. Personal Brain" },
  { category: "Configure & Control" },
  { id: "ai-providers", label: "13. AI Providers" },
  { id: "privacy", label: "14. Privacy & Data" },
  { id: "licensing", label: "15. Licensing & Account" },
  { id: "help", label: "16. Help & Experience" },
];

const ICON_COLORS = ["blue", "purple", "teal", "emerald", "amber", "rose", "slate"] as const;
type IconColor = (typeof ICON_COLORS)[number];

type Card = { icon: ReactNode; color: IconColor; title: string; desc: string };

const SECTIONS: Array<{ id: string; badge: string; title: string; cards: Card[]; grid: 2 | 3 | 4 }> = [
  {
    id: "import",
    badge: "Core",
    title: "1. Import & Indexing",
    grid: 3,
    cards: [
      { icon: <FileText size={20} />, color: "blue", title: "Multi-Format", desc: "PDF, DOCX, EPUB, TXT, MD, HTML, BibTeX, RIS, Zotero" },
      { icon: <Hourglass size={20} />, color: "teal", title: "Smart Queue", desc: "queued → parsing → embedding → indexing → OCR → summarizing → ready" },
      { icon: <RefreshCw size={20} />, color: "purple", title: "OCR & Retry", desc: "RapidOCR for scanned PDFs. Manual OCR retry on failure." },
      { icon: <FolderOpen size={20} />, color: "emerald", title: "Scan Folder", desc: "Import all supported files from a directory with one click." },
      { icon: <Link size={20} />, color: "amber", title: "Zotero Sync", desc: "Direct sync with Zotero SQLite — metadata and PDFs." },
      { icon: <ClipboardList size={20} />, color: "rose", title: "BibTeX / RIS", desc: "Import metadata from BibTeX and RIS files." },
    ],
  },
  {
    id: "library",
    badge: "Core",
    title: "2. Library & Collections",
    grid: 3,
    cards: [
      { icon: <Star size={20} />, color: "blue", title: "Paper Management", desc: "Star, read status, edit metadata, delete. Bulk operations." },
      { icon: <Folder size={20} />, color: "purple", title: "Collections", desc: "Create, edit, delete. Add/remove papers. Organise by topic." },
      { icon: <Bookmark size={20} />, color: "teal", title: "Saved Searches", desc: "Save any search with filters. Quick access from sidebar." },
      { icon: <Tag size={20} />, color: "emerald", title: "Tags & Filters", desc: "Custom tags. Filter by collection, tag, year, type, status." },
      { icon: <PenTool size={20} />, color: "amber", title: "Highlights Library", desc: "View all highlights, filter by paper, search, chat from highlight." },
      { icon: <BookOpen size={20} />, color: "rose", title: "PDF Viewer", desc: "Inline viewing, page nav, highlights, notes, reading progress." },
    ],
  },
  {
    id: "search",
    badge: "Core",
    title: "3. Hybrid Search",
    grid: 3,
    cards: [
      { icon: <Search size={20} />, color: "blue", title: "BM25 + Vector + Rerank", desc: "SQLite FTS5 + ChromaDB + optional cross-encoder." },
      { icon: <Crosshair size={20} />, color: "purple", title: "Advanced Filters", desc: "Collection, tag, year, type, read status, starred." },
      { icon: <Save size={20} />, color: "teal", title: "Saved Searches", desc: "Save queries with filters. One-click reuse." },
      { icon: <BarChart3 size={20} />, color: "emerald", title: "Confidence Scoring", desc: "Calibrated scores for each result." },
      { icon: <Lightbulb size={20} />, color: "amber", title: "Search Suggestions", desc: "Real‑time suggestions as you type." },
    ],
  },
  {
    id: "chat",
    badge: "Core",
    title: "4. AI Chat",
    grid: 3,
    cards: [
      { icon: <MessageSquare size={20} />, color: "blue", title: "5 Chat Modes", desc: "Free, Evidence‑Only, Critique, Debate, Verify." },
      { icon: <BookOpen size={20} />, color: "purple", title: "Multi‑Paper", desc: "Select multiple papers for comparison and synthesis." },
      { icon: <Paperclip size={20} />, color: "teal", title: "Citation & Trust", desc: "Source chips, page numbers, trust scores per claim." },
      { icon: <HelpCircle size={20} />, color: "emerald", title: "Suggest Questions", desc: "AI generates recommended questions based on paper." },
      { icon: <Zap size={20} />, color: "amber", title: "Reasoning Modes", desc: "Fast vs Deep (reasoning) mode." },
      { icon: <Globe size={20} />, color: "rose", title: "Multi‑Language", desc: "English, Vietnamese, Japanese. Backend adapts." },
    ],
  },
  {
    id: "review",
    badge: "Core",
    title: "5. Literature Review Builder",
    grid: 3,
    cards: [
      { icon: <FileEdit size={20} />, color: "blue", title: "7‑Section Review", desc: "Background → Methods → Results → Discussion → Gap → Future → Conclusion." },
      { icon: <ClipboardList size={20} />, color: "purple", title: "Outline & Streaming", desc: "Generate outline first, then stream full draft in real‑time." },
      { icon: <Pencil size={20} />, color: "teal", title: "Section Regeneration", desc: "Regenerate any section independently." },
      { icon: <CheckCircle size={20} />, color: "emerald", title: "Quality Check", desc: "AI evaluates coherence, completeness, citation coverage." },
      { icon: <FolderOpen size={20} />, color: "amber", title: "Versions & Restore", desc: "Save drafts, view history, restore previous versions." },
      { icon: <Upload size={20} />, color: "rose", title: "Export", desc: "DOCX, Markdown, LaTeX, HTML." },
    ],
  },
  {
    id: "evidence",
    badge: "Core",
    title: "6. Evidence Matrix",
    grid: 3,
    cards: [
      { icon: <BarChart3 size={20} />, color: "blue", title: "Custom Criteria", desc: "Define your own evaluation criteria." },
      { icon: <Search size={20} />, color: "purple", title: "AI Claim Extraction", desc: "Extract claims with source quotes per paper." },
      { icon: <ClipboardList size={20} />, color: "teal", title: "Comparison Table", desc: "Rows = criteria, columns = papers. Click for quotes." },
      { icon: <Save size={20} />, color: "emerald", title: "Draft Versioning", desc: "Save, rename, delete multiple drafts." },
      { icon: <Upload size={20} />, color: "amber", title: "Export to CSV", desc: "For further analysis in Excel or other tools." },
    ],
  },
  {
    id: "discovery",
    badge: "Discover",
    title: "7. Discovery",
    grid: 3,
    cards: [
      { icon: <Globe size={20} />, color: "blue", title: "External Search", desc: "Search OpenAlex and Semantic Scholar for new papers." },
      { icon: <Search size={20} />, color: "purple", title: "Filters", desc: "Year range, open‑access only." },
      { icon: <Globe size={20} />, color: "teal", title: "Translation", desc: "Translate titles and abstracts (EN → VI)." },
      { icon: <Plus size={20} />, color: "emerald", title: "One‑Click Import", desc: "Add papers directly from discovery results." },
      { icon: <Save size={20} />, color: "amber", title: "Save Search Strategy", desc: "Save queries for later reuse." },
    ],
  },
  {
    id: "workspace",
    badge: "Discover",
    title: "8. Project Workspace",
    grid: 3,
    cards: [
      { icon: <FolderOpen size={20} />, color: "blue", title: "Projects", desc: "CRUD for research projects. Assign research questions." },
      { icon: <Users size={20} />, color: "purple", title: "Collaborators", desc: "Add team members (Pro/Lab). Full audit trail." },
      { icon: <RefreshCw size={20} />, color: "teal", title: "Living Review", desc: "Register queries; system monitors and alerts for new papers." },
      { icon: <ClipboardList size={20} />, color: "emerald", title: "Screening Board", desc: "Include / Exclude / Maybe. Auto‑generate PRISMA diagram." },
      { icon: <PenTool size={20} />, color: "amber", title: "Annotations", desc: "Highlight, notes on PDFs. Track reading progress." },
      { icon: <Paperclip size={20} />, color: "rose", title: "Evidence Collection", desc: "Collect quotes and notes into project artifacts." },
    ],
  },
  {
    id: "insights",
    badge: "Analyze",
    title: "9. Insights",
    grid: 3,
    cards: [
      { icon: <Search size={20} />, color: "blue", title: "Gap Detection", desc: "Identify under‑represented topics in your library." },
      { icon: <Zap size={20} />, color: "purple", title: "Conflict Analysis", desc: "Detect methodology conflicts and contradictions." },
      { icon: <Lightbulb size={20} />, color: "teal", title: "Topic Suggestions", desc: "AI proposes new research topics." },
      { icon: <TrendingUp size={20} />, color: "emerald", title: "Evolution Map", desc: "Timeline of field evolution by publication dates." },
      { icon: <BarChart3 size={20} />, color: "amber", title: "Paper Comparison", desc: "Side‑by‑side comparison of multiple papers." },
    ],
  },
  {
    id: "deep",
    badge: "Analyze",
    title: "10. Deep Analysis",
    grid: 3,
    cards: [
      { icon: <Settings size={20} />, color: "blue", title: "5‑Step Pipeline", desc: "Summary → Critique → Conflict → Gap → Debate. Runs in parallel." },
      { icon: <Download size={20} />, color: "purple", title: "Drag & Drop", desc: "Drop PDFs to auto‑import, index, and run analysis." },
      { icon: <RefreshCw size={20} />, color: "teal", title: "Regenerate", desc: "Regenerate any step or the entire pipeline." },
      { icon: <BarChart3 size={20} />, color: "emerald", title: "Stepper Status", desc: "Visual progress bar with animated loading messages." },
      { icon: <ClipboardList size={20} />, color: "amber", title: "Copy & Export", desc: "Copy any section to clipboard." },
    ],
  },
  {
    id: "graph",
    badge: "Analyze",
    title: "11. Knowledge Graph",
    grid: 3,
    cards: [
      { icon: <Globe size={20} />, color: "blue", title: "Automated Build", desc: "extract → cluster → summarize. Real‑time progress." },
      { icon: <Search size={20} />, color: "purple", title: "Entity Explorer", desc: "Browse entities, communities, and relationships." },
      { icon: <Palette size={20} />, color: "teal", title: "Visualization", desc: "Interactive D3/force‑directed graph. Pan, zoom, click." },
      { icon: <Search size={20} />, color: "emerald", title: "3 Query Strategies", desc: "Local, Global, Drift — search the graph." },
      { icon: <BarChart3 size={20} />, color: "amber", title: "Stats Dashboard", desc: "Entities, relationships, communities, reports." },
      { icon: <Trash2 size={20} />, color: "rose", title: "Cancel / Delete", desc: "Cancel running build, clear or delete graph." },
    ],
  },
  {
    id: "brain",
    badge: "Personal",
    title: "12. Personal Brain",
    grid: 3,
    cards: [
      { icon: <BarChart3 size={20} />, color: "blue", title: "Reading Stats", desc: "Papers read, time spent, pages per day, streaks." },
      { icon: <Lightbulb size={20} />, color: "purple", title: "Recommendations", desc: "Personalised suggestions based on reading history." },
      { icon: <Tag size={20} />, color: "teal", title: "Tag Organization", desc: "Organise knowledge by tags and topic clusters." },
      { icon: <Calendar size={20} />, color: "emerald", title: "Daily Suggestions", desc: "Priority‑based recommendations delivered daily." },
      { icon: <Flame size={20} />, color: "amber", title: "Reading Streaks", desc: "Track daily reading consistency." },
    ],
  },
  {
    id: "ai-providers",
    badge: "Configure",
    title: "13. AI Providers",
    grid: 3,
    cards: [
      { icon: <Cloud size={20} />, color: "blue", title: "Cloud Free", desc: "Ready to use. Limited daily quota." },
      { icon: <Key size={20} />, color: "purple", title: "BYOK", desc: "Gemini, DeepSeek, Claude, Groq. Validate keys." },
      { icon: <Monitor size={20} />, color: "teal", title: "Local AI", desc: "llama‑server, GGUF models. Offline capable." },
      { icon: <Link size={20} />, color: "emerald", title: "Fallback Chain", desc: "Ordered list. Auto‑switch on failure." },
      { icon: <CheckCircle size={20} />, color: "amber", title: "Key Validation", desc: "Test API keys before saving. Cache management." },
      { icon: <FlaskConical size={20} />, color: "rose", title: "Test Embedding", desc: "Verify bge‑m3 connection." },
    ],
  },
  {
    id: "privacy",
    badge: "Configure",
    title: "14. Privacy & Data",
    grid: 3,
    cards: [
      { icon: <Lock size={20} />, color: "blue", title: "Local‑First", desc: "All data stays on your machine." },
      { icon: <Scale size={20} />, color: "purple", title: "Cloud AI Consent", desc: "Toggle on/off. Redact metadata before sending." },
      { icon: <Save size={20} />, color: "teal", title: "Backup & Restore", desc: "ZIP backups of your entire database." },
      { icon: <Upload size={20} />, color: "emerald", title: "Data Export", desc: "JSON export of all personal data." },
      { icon: <ClipboardList size={20} />, color: "amber", title: "Diagnostic Logs", desc: "View and delete logs. Control what's sent." },
    ],
  },
  {
    id: "licensing",
    badge: "Configure",
    title: "15. Licensing & Account",
    grid: 3,
    cards: [
      { icon: <CreditCard size={20} />, color: "blue", title: "Plans", desc: "Free (50 papers, 14‑day trial), Pro (unlimited), Lab (team)." },
      { icon: <Key size={20} />, color: "purple", title: "License Activation", desc: "Enter key to activate." },
      { icon: <LockKeyhole size={20} />, color: "teal", title: "Google Sign‑In", desc: "Optional OAuth login. Sync settings across devices." },
    ],
  },
  {
    id: "help",
    badge: "UX",
    title: "16. Help & Experience",
    grid: 4,
    cards: [
      { icon: <GraduationCap size={20} />, color: "blue", title: "Welcome Tour", desc: "5‑step onboarding tour." },
      { icon: <HelpCircle size={20} />, color: "purple", title: "Help Center", desc: "Read our full documentation." },
      { icon: <Keyboard size={20} />, color: "teal", title: "Command Palette", desc: "Ctrl+K quick navigation." },
      { icon: <Keyboard size={20} />, color: "emerald", title: "Shortcuts", desc: "Full keyboard shortcut guide." },
      { icon: <Globe size={20} />, color: "amber", title: "Multi‑Language", desc: "EN, VI, JP." },
      { icon: <Smartphone size={20} />, color: "rose", title: "Responsive", desc: "4 viewport levels." },
      { icon: <Shield size={20} />, color: "slate", title: "Support", desc: "24/7 contact available." },
      { icon: <Hourglass size={20} />, color: "slate", title: "Skeleton Loading", desc: "Graceful loading states." },
    ],
  },
];

/* ─── Component ─────────────────────────────────────────────── */

export default function FeaturesPage() {
  const [activeId, setActiveId] = useState("import");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    const updateActive = () => {
      let current = "";
      for (const el of sectionEls) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120) current = el.id;
      }
      if (current) setActiveId(current);
    };

    window.addEventListener("scroll", updateActive, { passive: true });
    updateActive();
    return () => window.removeEventListener("scroll", updateActive);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setMobileOpen(false);
  };

  return (
    <div className="features-layout-wrapper">
      {/* Page hero */}
      <div className="features-page-hero">
        <div className="container">
          <h1>Features</h1>
          <p>Everything you need for academic research — from paper management to deep AI analysis.</p>
        </div>
      </div>

      <div className="container features-layout">
        {/* Sidebar */}
        <aside className={`features-sidebar${mobileOpen ? " open" : ""}`}>
          <div className="features-sidebar-title">All Features</div>
          <ul>
            {SIDEBAR_SECTIONS.map((item, i) => {
              if ("category" in item) {
                return (
                  <li key={`cat-${i}`} className="features-sidebar-heading">
                    {item.category}
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <button
                    className={`features-sidebar-link${activeId === item.id ? " active" : ""}`}
                    onClick={() => scrollToSection(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Mobile TOC */}
        <div className="features-toc-mobile">
          <select
            value={`#${activeId}`}
            onChange={(e) => {
              const id = e.target.value.replace("#", "");
              scrollToSection(id);
            }}
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={`#${s.id}`}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <main className="features-content">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="features-section-block">
              <h2>
                {section.title} <span className={`features-badge badge-${section.badge.toLowerCase()}`}>{section.badge}</span>
              </h2>
              <div className={`features-card-grid grid-${section.grid}`}>
                {section.cards.map((card, ci) => (
                  <div key={ci} className="feature-card-compact">
                    <div className={`feature-card-icon ${card.color}`}>{card.icon}</div>
                    <h4>{card.title}</h4>
                    <p>{card.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
