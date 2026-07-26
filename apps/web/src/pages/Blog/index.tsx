import { useState } from "react";

/* ─── Data ──────────────────────────────────────────────────── */

type Article = {
  id: string;
  title: string;
  desc: string;
  tag: string;
  date: string;
  readTime: string;
  author?: string;
  featured?: boolean;
  category: string;
};

const ARTICLES: Article[] = [
  {
    id: "v0-6-release",
    title: "ResearchMind v0.6: Evidence Matrix, Literature Review Builder & Local AI Engine",
    desc: "Multi-paper evidence extraction, PRISMA-compliant review builder, and offline GGUF local model execution via llama-server.",
    tag: "Featured Release",
    date: "July 15, 2026",
    readTime: "6 min read",
    author: "ResearchMind Team",
    featured: true,
    category: "release",
  },
  {
    id: "signed-in-account",
    title: "5 Superpowers You Only Get with a Signed-In Account",
    desc: "Unlock unlimited Turbo AI queue, personalized settings sync across devices, encrypted cloud backup, seamless continuity, and collaboration features.",
    tag: "Account",
    date: "July 24, 2026",
    readTime: "7 min read",
    category: "release",
  },
  {
    id: "hybrid-search",
    title: "Hybrid Search: Three-Stage Retrieval (BM25 + Vector + Rerank)",
    desc: "A deep dive into how ResearchMind combines SQLite FTS5, ChromaDB dense embeddings, and cross-encoder reranking for precision recall.",
    tag: "Architecture",
    date: "July 8, 2026",
    readTime: "8 min read",
    category: "architecture",
  },
  {
    id: "rag-chat-writing",
    title: "Mastering RAG Chat for Academic Writing & Citation Grounding",
    desc: "Learn how to query your library with strict evidence verification to eliminate LLM hallucinations in academic manuscripts.",
    tag: "Guide",
    date: "June 28, 2026",
    readTime: "5 min read",
    category: "guide",
  },
  {
    id: "systematic-reviews",
    title: "Conducting Systematic Literature Reviews with ResearchMind",
    desc: "Step-by-step workflow for screening hundreds of papers, extracting methodologies, and generating BibTeX evidence tables.",
    tag: "Guide",
    date: "June 20, 2026",
    readTime: "7 min read",
    category: "guide",
  },
  {
    id: "v0-5-release",
    title: "v0.5 Deep Dive: RapidOCR Engine & Direct Zotero Sync",
    desc: "Exploring OCR support for scanned PDFs, zero-copy Zotero database sync, and multi-core indexing optimizations.",
    tag: "Release",
    date: "June 5, 2026",
    readTime: "6 min read",
    category: "release",
  },
  {
    id: "local-first-ai",
    title: "Why Local-First AI Matters for Academic Data Sovereignty",
    desc: "Intellectual property protection, institutional IRB compliance, and why researchers need offline AI independence.",
    tag: "Local AI",
    date: "May 22, 2026",
    readTime: "5 min read",
    category: "philosophy",
  },
  {
    id: "v0-4-release",
    title: "v0.4: Evidence Mode & AI Critique Tools",
    desc: "Introducing evidence-only mode, AI peer review critique assistant, and foundational citation graph visualizations.",
    tag: "Release",
    date: "May 10, 2026",
    readTime: "4 min read",
    category: "release",
  },
];

const CATEGORIES = [
  { value: "all", label: "All Articles" },
  { value: "release", label: "Releases" },
  { value: "guide", label: "Guides & RAG" },
  { value: "architecture", label: "Architecture" },
  { value: "philosophy", label: "Local AI & Privacy" },
];

const ARTICLE_CONTENT: Record<string, { title: string; tag: string; date: string; author: string; body: string }> = {
  "v0-6-release": {
    title: "ResearchMind v0.6: Evidence Matrix, Literature Review Builder & Local AI Engine",
    tag: "Featured Release",
    date: "July 15, 2026",
    author: "ResearchMind Team",
    body: `<p>We're thrilled to announce ResearchMind v0.6, our biggest milestone yet. This major release introduces multi-paper evidence extraction matrix, PRISMA-compliant literature review builder, and offline GGUF local model execution via <code>llama-server</code>.</p>
<h2>What's New</h2>
<ul>
<li><strong>Evidence Matrix</strong> — Define custom criteria and extract claims with source quotes across multiple papers.</li>
<li><strong>Literature Review Builder</strong> — Generate 7-section reviews with streaming, versioning, and export to DOCX/LaTeX.</li>
<li><strong>Local AI Engine</strong> — Run GGUF models offline via llama-server integration.</li>
<li><strong>Multi-Paper Chat</strong> — Compare and synthesize across selected papers simultaneously.</li>
</ul>
<div class="callout">Available now for all Pro users. Free tier gets a 14-day trial.</div>`,
  },
  "signed-in-account": {
    title: "5 Superpowers You Only Get with a Signed-In Account",
    tag: "Account",
    date: "July 24, 2026",
    author: "ResearchMind Team",
    body: `<p>Creating a free ResearchMind account unlocks capabilities that the offline-only experience simply can't match. Here are five superpowers you gain the moment you sign in.</p>
<h2>1. Unlimited Turbo AI Queue</h2>
<p>Signed-in users get priority access to the Cloud Free AI tier with a higher daily quota and faster response times.</p>
<h2>2. Personalized Settings Sync</h2>
<p>Your preferences, provider configurations, and saved searches sync across all your devices automatically.</p>
<h2>3. Encrypted Cloud Backup</h2>
<p>Your library metadata and reports are encrypted and backed up to the cloud. Never lose your work.</p>
<h2>4. Seamless Continuity</h2>
<p>Start reading on desktop, continue on another machine. Your reading progress and highlights follow you.</p>
<h2>5. Publish & Collaborate</h2>
<p>Generate shareable report URLs, invite collaborators, and publish verified research summaries.</p>`,
  },
  "hybrid-search": {
    title: "Hybrid Search: Three-Stage Retrieval (BM25 + Vector + Rerank)",
    tag: "Architecture",
    date: "July 8, 2026",
    author: "ResearchMind Team",
    body: `<p>ResearchMind's search engine combines three distinct retrieval strategies to deliver the most relevant results for academic research.</p>
<h2>Stage 1: BM25 Full-Text Search</h2>
<p>Built on SQLite FTS5, this provides fast keyword matching with stemming, stop-word removal, and prefix search capabilities.</p>
<h2>Stage 2: Vector Semantic Search</h2>
<p>Using bge-m3 embeddings stored in ChromaDB, we find conceptually similar content even when keywords don't match exactly.</p>
<h2>Stage 3: Cross-Encoder Reranking</h2>
<p>An optional cross-encoder model re-ranks the combined results to improve precision at the top of the result list.</p>
<div class="callout">This three-stage pipeline achieves significantly better recall than any single method alone.</div>`,
  },
  "rag-chat-writing": {
    title: "Mastering RAG Chat for Academic Writing & Citation Grounding",
    tag: "Guide",
    date: "June 28, 2026",
    author: "ResearchMind Team",
    body: `<p>RAG (Retrieval-Augmented Generation) is the backbone of ResearchMind's AI chat. Here's how to use it effectively for academic writing.</p>
<h2>Evidence-Only Mode</h2>
<p>Force the AI to cite every claim from your library. No more hallucinated references.</p>
<h2>Multi-Paper Synthesis</h2>
<p>Select 3-5 papers and ask the AI to compare methodologies, findings, and limitations across all of them simultaneously.</p>
<h2>Citation Panel</h2>
<p>Every response includes source chips with page numbers. Click to reveal the exact quote from the original PDF.</p>`,
  },
  "systematic-reviews": {
    title: "Conducting Systematic Literature Reviews with ResearchMind",
    tag: "Guide",
    date: "June 20, 2026",
    author: "ResearchMind Team",
    body: `<p>A systematic literature review requires methodical screening, extraction, and synthesis. ResearchMind streamlines every step.</p>
<h2>Step 1: Discovery</h2>
<p>Use External Search to find papers via OpenAlex and Semantic Scholar with year and OA filters.</p>
<h2>Step 2: Screening</h2>
<p>Use the Screening Board with Include/Exclude/Maybe statuses. Auto-generate a PRISMA diagram.</p>
<h2>Step 3: Extraction</h2>
<p>Use the Evidence Matrix to extract claims by criteria across all included papers.</p>
<h2>Step 4: Synthesis</h2>
<p>Generate a structured review with the Literature Review Builder. Export to DOCX or LaTeX.</p>`,
  },
  "v0-5-release": {
    title: "v0.5 Deep Dive: RapidOCR Engine & Direct Zotero Sync",
    tag: "Release",
    date: "June 5, 2026",
    author: "ResearchMind Team",
    body: `<p>Version 0.5 brought two major infrastructure improvements that significantly expand ResearchMind's capabilities.</p>
<h2>RapidOCR Engine</h2>
<p>Scanned PDFs are now processed with RapidOCR, enabling text extraction from older manuscripts, book chapters, and handwritten notes.</p>
<h2>Direct Zotero Sync</h2>
<p>Connect directly to your Zotero SQLite database for zero-copy metadata and PDF synchronization.</p>`,
  },
  "local-first-ai": {
    title: "Why Local-First AI Matters for Academic Data Sovereignty",
    tag: "Local AI",
    date: "May 22, 2026",
    author: "ResearchMind Team",
    body: `<p>In an era of cloud-dependent AI tools, ResearchMind's local-first architecture offers a fundamentally different approach.</p>
<h2>Intellectual Property Protection</h2>
<p>Your unpublished research and data never leave your machine. No third party has access to your work.</p>
<h2>IRB Compliance</h2>
<p>Many institutional review boards require data to remain on-site. Local AI makes compliance straightforward.</p>
<h2>Offline Independence</h2>
<p>No internet? No problem. Library management, search, and local AI models work fully offline.</p>`,
  },
  "v0-4-release": {
    title: "v0.4: Evidence Mode & AI Critique Tools",
    tag: "Release",
    date: "May 10, 2026",
    author: "ResearchMind Team",
    body: `<p>Version 0.4 introduced evidence-only chat mode and AI-powered critique capabilities.</p>
<h2>Evidence-Only Mode</h2>
<p>Forces the AI to ground every response in your library, eliminating unsupported claims.</p>
<h2>AI Critique Assistant</h2>
<p>Get peer-review level critique of your papers' methodologies, statistical power, and limitations.</p>`,
  },
};

/* ─── Component ─────────────────────────────────────────────── */

const TABS = ["all", "release", "guide", "architecture", "philosophy"];

export default function BlogPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [article, setArticle] = useState<Article | null>(null);

  const featured = ARTICLES.find((a) => a.featured);
  const rest = ARTICLES.filter((a) => !a.featured);

  const filtered = rest.filter((a) => {
    const matchTab = activeTab === "all" || a.category === activeTab;
    const matchSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.desc.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const openArticle = (id: string) => {
    const a = ARTICLES.find((x) => x.id === id);
    if (a) setArticle(a);
  };

  return (
    <div className="blog-page">
      {/* Hero */}
      <div className="blog-page-hero">
        <div className="container">
          <h1>
            <span className="gradient-text">Journal</span> &amp; Product Blog
          </h1>
          <p>
            In-depth release notes, system architecture teardowns, RAG write-ups, and local AI
            research strategies.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          {/* Controls */}
          <div className="blog-controls">
            <div className="blog-tabs">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  className={`blog-tab${activeTab === c.value ? " active" : ""}`}
                  onClick={() => setActiveTab(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="blog-search">
              <span className="blog-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Featured */}
          {featured && (activeTab === "all" || activeTab === featured.category) && !search && (
            <article
              className="blog-card blog-card-featured"
              onClick={() => openArticle(featured.id)}
            >
              <div className="blog-card-image featured-image">
                <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                  <path d="M5 19l1 3 3-1" />
                  <path d="M19 19l-1 3-3-1" />
                </svg>
              </div>
              <div className="blog-card-body">
                <div className="blog-card-header">
                  <span className="blog-card-tag featured-tag">{featured.tag}</span>
                  <span className="blog-card-date">{featured.date}</span>
                </div>
                <h3>{featured.title}</h3>
                <p>{featured.desc}</p>
                <div className="blog-card-meta">
                  <span>✍️ {featured.author}</span>
                  <span>⏱️ {featured.readTime}</span>
                  <span className="blog-read-more">Read Full Article &rarr;</span>
                </div>
              </div>
            </article>
          )}

          {/* Grid */}
          <div className="blog-grid">
            {filtered.length === 0 && (
              <div className="blog-empty">
                <p>No articles found matching your search.</p>
              </div>
            )}
            {filtered.map((post) => (
              <article
                key={post.id}
                className="blog-card"
                onClick={() => openArticle(post.id)}
              >
                <div className="blog-card-image">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--accent-blue)" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v12M6 12h12" />
                    <path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" />
                  </svg>
                </div>
                <div className="blog-card-body">
                  <span className="blog-card-tag">{post.tag}</span>
                  <h3>{post.title}</h3>
                  <p>{post.desc}</p>
                  <div className="blog-card-meta">
                    <span>{post.date}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Article Modal */}
      {article && (
        <div className="article-modal active" onClick={() => setArticle(null)}>
          <div className="article-container" onClick={(e) => e.stopPropagation()}>
            <button className="article-close" onClick={() => setArticle(null)}>
              ✕
            </button>
            <div className="article-header">
              <span className="article-tag-badge">{article.tag}</span>
              <h2 className="article-title">{article.title}</h2>
              <div className="article-info-bar">
                <span>✍️ {article.author || "ResearchMind Team"}</span>
                <span>📅 {article.date}</span>
                <span>⏱️ {article.readTime}</span>
              </div>
            </div>
            <div
              className="article-body"
              dangerouslySetInnerHTML={{
                __html: ARTICLE_CONTENT[article.id]?.body || "<p>Full article content coming soon.</p>",
              }}
            />
            <div className="article-footer-nav">
              <button className="btn btn-secondary" onClick={() => setArticle(null)}>
                ← Back to Articles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="cta-section">
        <div className="container">
          <div className="cta-card">
            <h2>Stay up to date with ResearchMind</h2>
            <p>Get the latest product updates, research tips, and AI insights delivered to your inbox.</p>
            <div className="cta-actions">
              <a href="https://github.com/ViuGiaLai/researchmind/releases" className="btn btn-primary" target="_blank" rel="noopener">
                Follow Releases
              </a>
              <a href="https://github.com/ViuGiaLai/researchmind" className="btn btn-secondary" target="_blank" rel="noopener">
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
