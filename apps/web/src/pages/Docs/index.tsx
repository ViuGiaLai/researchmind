import { useEffect, useState } from "react";

const SIDEBAR_ITEMS = [
  { heading: "Getting Started" },
  { id: "getting-started", label: "1. Getting Started" },
  { id: "import", label: "2. Import & Library" },
  { id: "collections", label: "3. Collections & Organization" },
  { id: "search", label: "4. Hybrid Search" },
  { id: "chat", label: "5. AI Chat" },
  { id: "review-builder", label: "6. Literature Review Builder" },
  { id: "evidence-matrix", label: "7. Evidence Matrix" },
  { id: "insights", label: "8. Insights & Analysis" },
  { id: "verification", label: "9. Academic Verification" },
  { id: "deep-research", label: "10. Deep Research" },
  { id: "graph", label: "11. Graph & Personal Brain" },
  { id: "workspace", label: "12. Workspace & Projects" },
  { id: "ai-providers", label: "13. AI Providers" },
  { id: "settings", label: "14. Settings & System" },
  { id: "licensing", label: "15. Licensing & Account" },
  { id: "faq", label: "16. FAQ" },
];

export default function DocsPage() {
  const [activeId, setActiveId] = useState("getting-started");

  useEffect(() => {
    const ids = SIDEBAR_ITEMS.filter((i) => "id" in i).map((i) => (i as { id: string }).id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    const updateActive = () => {
      let current = "";
      for (const el of els) {
        if (el.getBoundingClientRect().top <= 120) current = el.id;
      }
      if (current) setActiveId(current);
    };

    window.addEventListener("scroll", updateActive, { passive: true });
    updateActive();
    return () => window.removeEventListener("scroll", updateActive);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="docs-page">
      <div className="docs-page-hero">
        <div className="container">
          <h1>Documentation</h1>
          <p>Complete guide to using ResearchMind — from setup to deep research.</p>
        </div>
      </div>

      <div className="container docs-layout">
        <aside className="docs-sidebar" id="docsSidebar">
          <div className="docs-sidebar-title">Table of Contents</div>
          <ul>
            {SIDEBAR_ITEMS.map((item, i) => {
              if ("heading" in item) {
                return <li key={`h-${i}`} className="docs-sidebar-heading">{item.heading}</li>;
              }
              return (
                <li key={item.id}>
                  <button
                    className={`docs-sidebar-link${activeId === item.id ? " active" : ""}`}
                    onClick={() => scrollTo(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="docs-toc-mobile">
          <select value={`#${activeId}`} onChange={(e) => scrollTo(e.target.value.replace("#", ""))}>
            {SIDEBAR_ITEMS.filter((i) => "id" in i).map((i) => {
              const item = i as { id: string; label: string };
              return <option key={item.id} value={`#${item.id}`}>{item.label}</option>;
            })}
          </select>
        </div>

        <main className="docs-content">
          <Section id="getting-started">
            <h1>1. Getting Started</h1>
            <h2>1.1 System Requirements</h2>
            <ul>
              <li><strong>OS:</strong> Windows 10/11 (64-bit), macOS (Apple Silicon & Intel), Linux (Ubuntu/Debian/Fedora)</li>
              <li><strong>RAM:</strong> 8 GB minimum, 16 GB recommended for local LLM (7B models)</li>
              <li><strong>Storage:</strong> ~500 MB app + additional for index, cache, and GGUF models</li>
              <li><strong>Optional:</strong> Python 3.11+ for local AI mode</li>
            </ul>
            <h2>1.2 Quick Install</h2>
            <p>Download the latest release from <a href="https://github.com/ViuGiaLai/researchmind/releases" target="_blank">GitHub Releases</a>. The application bundles the Python backend for a seamless experience.</p>
            <h2>1.3 First Launch & Setup Wizard</h2>
            <p>On first run, ResearchMind will:</p>
            <ul>
              <li>Initialize the local SQLite database (<code>researchmind.db</code>)</li>
              <li>Create the ChromaDB vector index</li>
              <li>Launch the backend FastAPI server (auto‑starts)</li>
              <li>Prompt you to choose your AI provider (Cloud Free, API key, or Local)</li>
            </ul>
            <div className="note"><strong>Tip:</strong> The setup wizard guides you through provider configuration. You can skip and configure later in Settings.</div>
            <h2>1.4 Troubleshooting Installation</h2>
            <ul>
              <li><strong>Backend fails to start:</strong> Ensure Python 3.11+ is installed and ports 8000–8005 are free.</li>
              <li><strong>Index rebuild:</strong> If search fails, go to Settings → System → Rebuild FTS Index.</li>
              <li><strong>Logs:</strong> Check <code>~/.researchmind/logs/</code> for detailed error logs.</li>
            </ul>
          </Section>

          <Section id="import">
            <h2>2. Import &amp; Library</h2>
            <h3>2.1 Supported Formats</h3>
            <ul>
              <li>PDF (with OCR for scanned documents via RapidOCR)</li>
              <li>DOCX, EPUB, TXT, MD, HTML</li>
              <li>BibTeX (.bib) and RIS (.ris)</li>
              <li>Zotero (direct sync from SQLite)</li>
            </ul>
            <h3>2.2 Import Methods</h3>
            <ul>
              <li><strong>Drag & Drop:</strong> Drop files/folders directly into the Library view.</li>
              <li><strong>Scan Folder:</strong> Import all supported files from a directory.</li>
              <li><strong>Zotero Sync:</strong> Connect your Zotero account to sync metadata and PDFs.</li>
              <li><strong>Import Metadata Only:</strong> Add papers by DOI, arXiv ID, or manual entry.</li>
            </ul>
            <h3>2.3 Import Queue & Status Tracking</h3>
            <p>Each file goes through: <code>queued</code> → <code>parsing</code> → <code>embedding</code> → <code>indexing</code> → <code>OCR</code> → <code>summarizing</code> → <code>ready</code></p>
            <h3>2.4 Retry Import & Manual OCR</h3>
            <p>Click <strong>Retry</strong> on any failed import. Manual OCR allows reprocessing scanned PDFs.</p>
            <h3>2.5 BibTeX & RIS Import</h3>
            <p>Parse standard BibTeX and RIS files to extract metadata. Import with or without associated PDFs.</p>
            <h3>2.6 Paper Management</h3>
            <ul>
              <li><strong>View / Edit:</strong> Click any paper to see details, edit metadata, add notes.</li>
              <li><strong>Delete:</strong> Remove a paper (also removes chunks and vector entries).</li>
              <li><strong>Star / Read Status:</strong> Mark papers to track progress.</li>
              <li><strong>Bulk Operations:</strong> Select multiple papers for batch actions.</li>
            </ul>
          </Section>

          <Section id="collections">
            <h2>3. Collections &amp; Organization</h2>
            <h3>3.1 Creating & Managing Collections</h3>
            <ul>
              <li><strong>Create:</strong> Name your collection with optional description.</li>
              <li><strong>Edit / Delete:</strong> Update or remove collections (papers remain in library).</li>
              <li><strong>Add/Remove Papers:</strong> Drag papers or use bulk action menu.</li>
            </ul>
            <h3>3.2 Saved Searches</h3>
            <p>Save any search query with filters for one‑click reuse.</p>
            <h3>3.3 Tags & Filters</h3>
            <p>Assign custom tags. Filter by collection, tag, year, type, read status, and starred.</p>
            <h3>3.4 Bulk Operations</h3>
            <p>Select multiple papers to add to collection, delete, change status, or apply tags.</p>
          </Section>

          <Section id="search">
            <h2>4. Hybrid Search</h2>
            <p>ResearchMind combines three retrieval strategies:</p>
            <h3>4.1 BM25 Full‑Text Search</h3>
            <p>Fast keyword matching using SQLite FTS5 with stemming and prefix searches.</p>
            <h3>4.2 Vector Semantic Search</h3>
            <p>Dense vector retrieval using <strong>bge‑m3</strong> embeddings in ChromaDB.</p>
            <h3>4.3 Cross‑Encoder Reranking</h3>
            <p>Optional reranking of top results for improved precision.</p>
            <h3>4.4 Filters</h3>
            <p>Collection, tags, year range, document type, read status, starred.</p>
            <h3>4.5 Saved Searches</h3>
            <p>Save searches with filters for one‑click reuse.</p>
          </Section>

          <Section id="chat">
            <h2>5. AI Chat</h2>
            <h3>5.1 Chat Modes</h3>
            <ul>
              <li><strong>Free Mode:</strong> General AI chat with optional paper context.</li>
              <li><strong>Evidence‑Only Mode:</strong> Responses cited from your library.</li>
              <li><strong>Critique Mode:</strong> AI critically analyses methodologies.</li>
              <li><strong>Debate Mode:</strong> Multiple AI personas debate a question.</li>
            </ul>
            <h3>5.2 Multi‑Paper Conversations</h3>
            <p>Select multiple papers for cross‑paper comparison and synthesis.</p>
            <h3>5.3 Citation & Trust Panels</h3>
            <p>Source chips with page numbers, expandable quotes, and trust scores.</p>
            <h3>5.4 Suggest Questions</h3>
            <p>AI generates recommended questions based on current paper context.</p>
            <h3>5.5 Chat History & Usage</h3>
            <p>View past conversations, delete sessions, track token usage.</p>
            <h3>5.6 Reasoning Mode</h3>
            <p><strong>Fast</strong> for quick answers, <strong>Deep</strong> for thorough step‑by‑step analysis.</p>
          </Section>

          <Section id="review-builder">
            <h2>6. Literature Review Builder</h2>
            <h3>6.1 Generate Outline</h3>
            <p>AI generates a structured outline from selected papers.</p>
            <h3>6.2 Generate Draft (7 Sections)</h3>
            <p>Background → Methods → Results → Discussion → Gap → Future → Conclusion.</p>
            <h3>6.3 Streaming Draft Generation</h3>
            <p>Watch the draft being written section by section in real‑time.</p>
            <h3>6.4 Section Regeneration</h3>
            <p>Regenerate any section independently with new instructions.</p>
            <h3>6.5 Quality Check</h3>
            <p>AI evaluates coherence, completeness, and citation coverage.</p>
            <h3>6.6 Save, Version, Restore</h3>
            <p>Save multiple drafts, view history, restore previous versions.</p>
            <h3>6.7 Export</h3>
            <p>DOCX, Markdown, LaTeX, HTML formats available.</p>
          </Section>

          <Section id="evidence-matrix">
            <h2>7. Evidence Matrix</h2>
            <h3>7.1 Custom Criteria</h3>
            <p>Define your own evaluation criteria (sample size, blinding, etc.).</p>
            <h3>7.2 AI Claim Extraction</h3>
            <p>Extracts claims with source quotes mapped to criteria.</p>
            <h3>7.3 Visual Comparison Table</h3>
            <p>Rows = criteria, columns = papers, cells = claims with clickable quotes.</p>
            <h3>7.4 Save & Version</h3>
            <p>Save multiple matrices, track changes.</p>
            <h3>7.5 Export to CSV</h3>
            <p>For further analysis in Excel or other tools.</p>
          </Section>

          <Section id="insights">
            <h2>8. Insights &amp; Analysis</h2>
            <h3>8.1 Gap Analysis</h3>
            <p>Detect underrepresented topics in your library.</p>
            <h3>8.2 Conflict Detection</h3>
            <p>Identify contradictory papers on methodology or findings.</p>
            <h3>8.3 Topic Suggestions</h3>
            <p>AI suggests new research directions based on coverage.</p>
            <h3>8.4 Evolution Map</h3>
            <p>Timeline view of field evolution from publication data.</p>
            <h3>8.5 Paper Comparison</h3>
            <p>Side‑by‑side comparison across multiple dimensions.</p>
          </Section>

          <Section id="verification">
            <h2>9. Academic Verification</h2>
            <h3>9.1 DOI Lookup</h3>
            <p>Query OpenAlex, Crossref, and Semantic Scholar for metadata.</p>
            <h3>9.2 Claim Verification</h3>
            <p>Search external sources to verify or refute claims.</p>
            <h3>9.3 Paper Discovery</h3>
            <p>Find new related papers via academic APIs.</p>
            <h3>9.4 PDF Proxy</h3>
            <p>Download open‑access PDFs through our proxy.</p>
          </Section>

          <Section id="deep-research">
            <h2>10. Deep Research</h2>
            <h3>10.1 Deep Research Mode</h3>
            <p>Multi‑step AI research: decomposes questions, searches, reads, and synthesizes reports.</p>
            <h3>10.2 Query Decomposition</h3>
            <p>Complex questions broken into sub‑queries, aggregated into final answers.</p>
          </Section>

          <Section id="graph">
            <h2>11. Graph &amp; Personal Brain</h2>
            <h3>11.1 Paper Relationship Graph</h3>
            <p>Visual network of papers by similarity, citations, co‑authors, and topics.</p>
            <h3>11.2 GraphRAG</h3>
            <p>Global, Local, and Drift search strategies across the knowledge graph.</p>
            <h3>11.3 Cluster Detection</h3>
            <p>Automatic grouping into thematic clusters.</p>
            <h3>11.4 Personal Brain</h3>
            <p>Reading stats, suggestions, and tag cloud based on your history.</p>
          </Section>

          <Section id="workspace">
            <h2>12. Workspace &amp; Projects</h2>
            <h3>12.1 Workspaces & Members</h3>
            <p>Separate workspaces for different research areas. Invite team members (Pro/Lab).</p>
            <h3>12.2 Projects</h3>
            <p>Organise papers, reviews, matrices, and chats within a workspace.</p>
            <h3>12.3 Screening Board & PRISMA</h3>
            <p>Include/Exclude/Maybe screening with auto‑generated PRISMA diagram.</p>
            <h3>12.4 Annotations & Highlights</h3>
            <p>Searchable highlights and margin notes on PDFs.</p>
            <h3>12.5 Reading Progress</h3>
            <p>Track percentage of pages read per paper.</p>
            <h3>12.6 Backup & Restore</h3>
            <p>ZIP backup of entire database. JSON privacy data export.</p>
          </Section>

          <Section id="ai-providers">
            <h2>13. AI Providers Configuration</h2>
            <h3>13.1 Cloud Free Mode</h3>
            <p>No setup required. Limited daily quota.</p>
            <h3>13.2 Gemini, DeepSeek, Claude, Groq</h3>
            <p>Enter API key, validate with Test button.</p>
            <h3>13.3 Local AI (llama-server, GGUF)</h3>
            <p>Download GGUF model, run <code>llama-server</code>, point to local endpoint.</p>
            <h3>13.4 Provider Fallback Chain</h3>
            <p>Ordered list with auto‑switch on failure.</p>
            <h3>13.5 API Key Validation</h3>
            <p>Test keys before saving.</p>
          </Section>

          <Section id="settings">
            <h2>14. Settings &amp; System</h2>
            <h3>14.1 General Settings</h3>
            <p>Interface language, default AI provider, theme selection.</p>
            <h3>14.2 Cache Management</h3>
            <p>View and clear cache for embeddings, search, and LLM responses.</p>
            <h3>14.3 System Diagnostics</h3>
            <p>Health metrics, reliability score, system specs detection.</p>
            <h3>14.4 Rebuild Index</h3>
            <p>Rebuild FTS or Vector index as needed.</p>
          </Section>

          <Section id="licensing">
            <h2>15. Licensing &amp; Account</h2>
            <h3>15.1 Free vs Pro vs Lab</h3>
            <ul>
              <li><strong>Free:</strong> 50 papers, basic search, 14‑day Pro trial.</li>
              <li><strong>Pro ($4/mo):</strong> Unlimited papers, all AI features.</li>
              <li><strong>Lab:</strong> Team features, custom deployment.</li>
            </ul>
            <h3>15.2 License Activation</h3>
            <p>Enter license key to activate Pro or Lab features.</p>
            <h3>15.3 Google Sign‑in</h3>
            <p>Optional OAuth to sync settings across devices.</p>
          </Section>

          <Section id="faq">
            <h2>16. FAQ</h2>
            <h3>Privacy & Data</h3>
            <div className="faq-item"><p><strong>Is my data private?</strong><br />Yes. Local‑first by design. Cloud AI only when you explicitly enable it.</p></div>
            <div className="faq-item"><p><strong>What happens if I uninstall?</strong><br />Data persists in app directory. Delete manually or from Settings.</p></div>
            <h3>Offline Usage</h3>
            <div className="faq-item"><p><strong>Can I use offline?</strong><br />Yes. Local AI models + library management work fully offline.</p></div>
            <h3>Troubleshooting</h3>
            <div className="faq-item"><p><strong>Import fails / OCR not working?</strong><br />Check file integrity. Use Retry or manual OCR. Ensure sufficient RAM.</p></div>
            <div className="faq-item"><p><strong>AI provider errors?</strong><br />Validate API key in Settings. Enable fallback chain.</p></div>
            <div className="faq-item"><p><strong>Local LLM not loading?</strong><br />Ensure <code>llama-server</code> is running with correct model path.</p></div>
          </Section>
        </main>
      </div>
    </div>
  );
}

/* ─── Section wrapper ──────────────────────────────────────── */
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="docs-section-block">
      {children}
    </section>
  );
}
