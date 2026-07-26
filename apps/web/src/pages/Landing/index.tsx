import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* ─── Types ──────────────────────────────────────────────── */
type Testimonial = {
  initials: string;
  name: string;
  role: string;
  text: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    initials: "JD",
    name: "Dr. Jane Doe",
    role: "PhD Candidate, CS",
    text: "ResearchMind has completely changed how I manage my literature review. The hybrid search is incredibly fast, and the evidence matrix saved me weeks of work.",
  },
  {
    initials: "MS",
    name: "Dr. Mark Smith",
    role: "Postdoc, Epidemiology",
    text: "I was sceptical about local-first AI, but ResearchMind delivers. The critique mode is like having a senior colleague review my work.",
  },
  {
    initials: "AL",
    name: "Prof. Anna Lee",
    role: "Associate Professor, History",
    text: "The review builder alone is worth the subscription. I generated a 7-section literature review in minutes and exported to LaTeX.",
  },
];

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
      </svg>
    ),
    color: "blue",
    title: "Import & Index",
    desc: "PDF, DOCX, EPUB, BibTeX, RIS, Zotero. OCR for scanned PDFs, bge-m3 embedding + ChromaDB.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    color: "purple",
    title: "Hybrid Search",
    desc: "BM25 (SQLite FTS5) + vector semantic + cross-encoder rerank. Saved search, filter by collection/tag/year.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    color: "teal",
    title: "RAG Chat",
    desc: "Streaming, multi-paper, Evidence-only mode, citation panel, DOI verification, trust panel.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </svg>
    ),
    color: "emerald",
    title: "Review & Screening",
    desc: "Insights, screening board, 7-section review builder, comparison matrix, export DOCX/Markdown.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 5 4-9" />
      </svg>
    ),
    color: "amber",
    title: "Evidence Matrix",
    desc: "Extract claims by criterion, sourced quotes, visual comparison table across papers.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
    color: "rose",
    title: "Graph & Brain",
    desc: "Paper relationship graph and personal brain — reading suggestions, tags, statistics over time.",
  },
];

const TRUST_LOGOS = ["Tauri", "FastAPI", "ChromaDB", "SQLite", "React", "TypeScript"];

/* ─── Star SVG ─────────────────────────────────────────────── */
function StarSvg() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  /* ── State ─────────────────────────────────────────────── */
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeStr, setTimeStr] = useState("0:00");

  const videoRef = useRef<HTMLVideoElement>(null);

  /* ── Video handlers ────────────────────────────────────── */
  const toggleVideo = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".video-bar-track") || target.closest(".video-bar-time")) return;
      const vid = videoRef.current;
      if (!vid) return;
      if (vid.paused) {
        vid.play();
        setPlaying(true);
      } else {
        vid.pause();
        setPlaying(false);
      }
    },
    [],
  );

  const onTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    const pct = (vid.currentTime / vid.duration) * 100;
    setProgress(pct);
    const m = Math.floor(vid.currentTime / 60);
    const s = Math.floor(vid.currentTime % 60);
    setTimeStr(`${m}:${s < 10 ? "0" : ""}${s}`);
  }, []);

  const onVideoEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    setTimeStr("0:00");
  }, []);

  const seekVideo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const vid = videoRef.current;
    if (vid) vid.currentTime = pct * vid.duration;
  }, []);

  /* ── Scroll to section ────────────────────────────────── */
  const scrollTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="landing-root">

      {/* ═══ HERO ═══ */}
      <section className="hero" id="home">
        <video
          className="hero-bg-video"
          src="https://pub-06049211148f4c7981f606c8a8a71dac.r2.dev/intro.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="hero-bg-overlay" />
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Local-first · Open Source · v0.6
          </div>
          <h1 className="hero-title">
            Academic Research with <br />
            <span className="gradient-text">AI Workspace</span>
          </h1>
          <p className="hero-desc">
            A desktop app to manage your PDF library, perform semantic search, chat with citations,
            critique papers, build evidence matrices, and run deep analysis — choose Cloud Free, your
            own API, or go fully offline.
          </p>
          <div className="hero-actions">
            <button onClick={() => scrollTo("download")} className="btn btn-primary">
              Download Free Trial
            </button>
            <a
              href="https://github.com/ViuGiaLai/researchmind"
              className="btn btn-secondary"
              target="_blank"
              rel="noopener"
            >
              GitHub
            </a>
            <Link to="/app" className="btn btn-secondary">
              Cloud Dashboard
            </Link>
          </div>

          <div
            className={`hero-video-wrapper${playing ? " playing" : ""}`}
            id="heroVideo"
            onClick={toggleVideo}
          >
            <video
              ref={videoRef}
              src="https://pub-06049211148f4c7981f606c8a8a71dac.r2.dev/vide_sanpham_tv.mp4"
              title="ResearchMind Demo"
              playsInline
              onTimeUpdate={onTimeUpdate}
              onEnded={onVideoEnded}
            />
            <div className="shine" />
            <div className="video-play-hint">
              <svg viewBox="0 0 24 24">
                <polygon points="8,5 20,12 8,19 8,5" />
              </svg>
            </div>
            <div className="video-bar">
              <div className="video-bar-track" onClick={seekVideo}>
                <div className="video-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="video-bar-time">{timeStr}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TRUST BAR ═══ */}
      <div className="trust-bar">
        <div className="container">
          <p className="trust-label">Built with industry standards</p>
          <div className="trust-logos">
            {TRUST_LOGOS.map((logo) => (
              <span key={logo} className="trust-logo">
                {logo}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ FEATURES ═══ */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-header">
            <span className="section-label">v0.6 Features</span>
            <h2 className="section-title">
              Built for researchers who value privacy &amp; performance
            </h2>
            <p className="section-desc">
              Everything you need to manage, read, and synthesize research — all on your machine.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <div className={`feature-icon ${f.color}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Workflow</span>
            <h2 className="section-title">From paper to insight in 3 steps</h2>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Import &amp; Index</h3>
              <p>
                Drag &amp; drop PDFs, sync Zotero, or scan folders. Your papers are parsed, chunked,
                and embedded automatically.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Search &amp; Chat</h3>
              <p>
                Hybrid search finds anything instantly. Chat with your papers using RAG — every
                answer comes with citations.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Synthesize &amp; Export</h3>
              <p>
                Build evidence matrices, generate structured reviews, compare papers, and export to
                DOCX, Markdown, or LaTeX.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Testimonials</span>
            <h2 className="section-title">Loved by researchers worldwide</h2>
          </div>
          <div className="testimonial-marquee">
            <div className="testimonial-track testimonial-track-left">
              {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
                <div key={`left-${i}`} className="testimonial-card">
                  <div className="testimonial-stars">
                    {Array.from({ length: 5 }).map((_, si) => (
                      <StarSvg key={si} />
                    ))}
                  </div>
                  <p className="testimonial-text">{t.text}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar">{t.initials}</div>
                    <div className="testimonial-info">
                      <span className="testimonial-name">{t.name}</span>
                      <span className="testimonial-role">{t.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="testimonial-track testimonial-track-right">
              {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
                <div key={`right-${i}`} className="testimonial-card">
                  <div className="testimonial-stars">
                    {Array.from({ length: 5 }).map((_, si) => (
                      <StarSvg key={si} />
                    ))}
                  </div>
                  <p className="testimonial-text">{t.text}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar">{t.initials}</div>
                    <div className="testimonial-info">
                      <span className="testimonial-name">{t.name}</span>
                      <span className="testimonial-role">{t.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">FAQ</span>
            <h2 className="section-title">Frequently asked questions</h2>
          </div>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="faq-item">
              <h3 className="faq-question">Is my data private?</h3>
              <p className="faq-answer">
                Yes. ResearchMind is local-first. Your PDFs, notes, and indexes stay on your
                machine. Cloud AI is only used when you explicitly enable it and send a query.
              </p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">Can I use ResearchMind offline?</h3>
              <p className="faq-answer">
                Yes. Use local AI models (llama-server, GGUF) for fully offline operation. Library
                management and search work without any internet connection.
              </p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">What happens to my data if I uninstall?</h3>
              <p className="faq-answer">
                Local data persists in the application data directory. You can delete it from
                Settings or manually remove the ResearchMind folder.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DOWNLOAD ═══ */}
      <section className="section" id="download">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Download</span>
            <h2 className="section-title">Get ResearchMind Desktop</h2>
            <p className="section-desc">
              Built with Tauri v2 · Current version <strong>v0.6.0</strong>. Requires companion
              Python backend (auto-starts).
            </p>
          </div>
          <div className="download-grid">
            <div className="download-card">
              <div className="download-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.101zM11.25 1.9L24 0v11.55H11.25V1.9zm12.75 10.55V24l-12.75-1.9v-9.65H24z" />
                </svg>
              </div>
              <h3>Windows</h3>
              <p className="download-desc">Windows 10 / 11 (64-bit)</p>
              <a
                href="https://github.com/ViuGiaLai/researchmind/releases/latest"
                className="btn btn-primary btn-full"
                target="_blank"
                rel="noopener"
              >
                Download Installer
              </a>
              <span className="download-meta">v0.6.0 · Installer / Portable</span>
            </div>
            <div className="download-card">
              <div className="download-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.029-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.102 1.51 12.067 1.007 1.452 2.2 3.076 3.774 3.02 1.524-.059 2.098-.98 3.938-.98 1.829 0 2.365.98 3.96.95 1.624-.03 2.661-1.47 3.661-2.93 1.154-1.69 1.632-3.32 1.66-3.4-.03-.01-3.18-1.22-3.21-4.82-.03-3.02 2.48-4.47 2.58-4.53-1.42-2.08-3.62-2.3-4.4-2.36-2.035-.17-3.325 1.04-4.262 1.04zm3.09-4.556c.846-1.025 1.411-2.454 1.253-3.877-1.22.049-2.697.817-3.57 1.839-.77.889-1.442 2.338-1.262 3.738 1.353.104 2.733-.675 3.579-1.7z" />
                </svg>
              </div>
              <h3>macOS</h3>
              <p className="download-desc">Apple Silicon &amp; Intel</p>
              <a
                href="https://github.com/ViuGiaLai/researchmind/releases/latest"
                className="btn btn-secondary btn-full"
                target="_blank"
                rel="noopener"
              >
                Download .dmg
              </a>
              <span className="download-meta">v0.6.0 · Universal</span>
            </div>
            <div className="download-card">
              <div className="download-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <h3>Linux</h3>
              <p className="download-desc">Ubuntu · Debian · Fedora</p>
              <a
                href="https://github.com/ViuGiaLai/researchmind/releases/latest"
                className="btn btn-secondary btn-full"
                target="_blank"
                rel="noopener"
              >
                Download AppImage
              </a>
              <span className="download-meta">v0.6.0 · AppImage / .deb</span>
            </div>
          </div>

          <div className="specs-panel" style={{ marginTop: 48 }}>
            <h4 className="specs-panel-title">System Requirements</h4>
            <div className="specs-grid">
              <div>
                <h4>Dev Stack</h4>
                <p>Node 22+, pnpm, Python 3.11+, Rust, Tauri CLI</p>
              </div>
              <div>
                <h4>RAM</h4>
                <p>8 GB minimum · 16 GB recommended (local LLM 7B)</p>
              </div>
              <div>
                <h4>Storage</h4>
                <p>~500 MB app + additional for index, cache, and GGUF models</p>
              </div>
            </div>
            <p className="specs-hint">
              From source: <code>pnpm install</code> →{" "}
              <code>cd backend && pip install -r requirements.txt</code> →{" "}
              <code>pnpm tauri dev</code>
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <div className="cta-section">
        <div className="container">
          <div className="cta-card">
            <h2>Ready to transform your research workflow?</h2>
            <p>
              Download ResearchMind and start your 14-day free trial. No credit card required.
            </p>
            <div className="cta-actions">
              <a
                href="https://github.com/ViuGiaLai/researchmind/releases/latest"
                className="btn btn-primary"
                target="_blank"
                rel="noopener"
              >
                Download Free Trial
              </a>
              <a
                href="https://github.com/ViuGiaLai/researchmind"
                className="btn btn-secondary"
                target="_blank"
                rel="noopener"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ FOOTER is rendered by MainLayout — not duplicated here ═══ */}
    </div>
  );
}
