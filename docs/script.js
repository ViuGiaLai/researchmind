/* ═══════════════════════════════════════════════════
   RESEARCHMIND — script.js
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ─── Detect report page ──────────────────────────────────
  function isReportPage() {
    var path = window.location.pathname.replace(/\/+$/, "");
    // Direct access: /report.html or /report
    // Clean URL:     /r/ID or /report/ID
    // Query param:   ?report=ID
    if (/\/report(?:\.html)?$/.test(path)) return true;
    if (/\/r\/[\w-]+$|\/report\/[\w-]+$/.test(path)) return true;
    if (getReportIdFromQuery()) return true;
    return false;
  }

  // ─── Extract report ID from path ─────────────────────────
  function getReportId() {
    var m = window.location.pathname.match(/\/(?:r|report)\/([\w-]+)/);
    if (m) return m[1];
    return getReportIdFromQuery();
  }

  function getReportIdFromQuery() {
    var p = new URLSearchParams(window.location.search);
    return p.get("report") || p.get("id") || null;
  }

  // ═══════════════════════════════════════════════════════════
  // i18n — Vietnamese + English
  // ═══════════════════════════════════════════════════════════
  var LOCALE = {
    vi: {
      langLabel: "Tiếng Việt",
      altLang: "English",
      altLangCode: "en",
      verifiedBadge: "ĐÃ XÁC MINH",
      reportTitle: "Báo cáo Tổng quan Nghiên cứu",
      reportSubtitle: "Large Language Models for Scientific Research",
      generatedBy: "Được tạo bởi ResearchMind AI",
      author: "Viu Rmah",
      readTime: "phút đọc",
      documents: "tài liệu",
      citations: "trích dẫn",
      aiAssisted: "AI Hỗ trợ",
      verified: "ĐÃ XÁC MINH",
      downloadPdf: "Tải PDF",
      exportDocx: "Xuất DOCX",
      copyCitation: "Sao chép Trích dẫn",
      shareReport: "Chia sẻ Báo cáo",
      openWorkspace: "Mở Workspace",
      researchIntegrity: "Tính toàn vẹn Nghiên cứu",
      trustOriginalDocs: "Tệp gốc không bao giờ được tải lên",
      trustLocal: "Báo cáo được tạo cục bộ",
      trustMetadata: "Siêu dữ liệu trích dẫn đã xác minh",
      trustDoi: "DOI đã xác thực",
      trustDedup: "Tham chiếu trùng lặp đã loại bỏ",
      trustAiTraceable: "Tóm tắt AI có thể truy vết",
      notAvailable: "Không có sẵn",
      privacy: "Quyền riêng tư",
      privacyPdf: "PDF gốc",
      privacyEmbeddings: "Embeddings",
      privacyStoredLocal: "Chỉ lưu cục bộ",
      privacyShared: "Dữ liệu đã chia sẻ",
      privacySummary: "Tóm tắt tổng quan",
      privacyCitations: "Trích dẫn đã chọn",
      privacyRefMeta: "Siêu dữ liệu tham chiếu",
      privacyNothingElse: "Không có gì khác.",
      executiveSummary: "Tóm tắt Tổng quan",
      executiveDesc: "ResearchMind đã tổng hợp",
      published: "được xuất bản từ",
      mainConclusions: "Kết luận chính",
      overallConfidence: "Độ tin cậy tổng thể",
      evidenceCoverage: "Mức độ bao phủ bằng chứng",
      researchQuestion: "Câu hỏi Nghiên cứu",
      keyFindings: "Phát hiện Chính",
      finding: "Phát hiện",
      confidence: "Độ tin cậy",
      supportedBy: "Được hỗ trợ bởi",
      evidenceMatrix: "Ma trận Bằng chứng",
      claim: "Luận điểm",
      papers: "Bài báo",
      quality: "Chất lượng",
      consensus: "Đồng thuận",
      high: "Cao",
      medium: "Trung bình",
      low: "Thấp",
      strong: "Mạnh",
      moderate: "Vừa phải",
      limited: "Hạn chế",
      citationExplorer: "Khám phá Trích dẫn",
      doiVerified: "DOI đã xác thực",
      publisher: "Nhà xuất bản",
      openPaper: "Mở Bài báo",
      copyApa: "Sao chép APA",
      copyBibtex: "Sao chép BibTeX",
      copyDoi: "Sao chép DOI",
      knowledgeGraph: "Đồ thị Tri thức",
      timeline: "Dòng thời gian",
      evidenceConfidence: "Độ tin cậy Bằng chứng",
      supportedBySources: "Được hỗ trợ bởi",
      sources: "nguồn",
      conflictingEvidence: "Bằng chứng mâu thuẫn",
      consensusScore: "Đồng thuận",
      reproducibility: "Chi tiết Tạo lập",
      llm: "Mô hình Ngôn ngữ",
      embedding: "Embedding",
      reranker: "Reranker",
      generated: "Đã tạo",
      promptVersion: "Phiên bản Prompt",
      workspaceVersion: "Phiên bản Workspace",
      generatedWith: "Được tạo với ResearchMind",
      footerDesc: "Báo cáo này được tự động tạo từ tài liệu nghiên cứu đã chọn của tác giả.",
      footerLocal: "Tệp gốc vẫn ở trên thiết bị của tác giả.",
      footerShared: "Chỉ thông tin được chia sẻ rõ ràng mới được công bố.",
      copyright: "ResearchMind",
      darkMode: "Chế độ Tối",
      lightMode: "Chế độ Sáng",
      language: "Ngôn ngữ",
      copyLink: "Sao chép Link",
      linkCopied: "Đã sao chép Link!",
      researchPassport: "Hộ chiếu Nghiên cứu",
      authorLabel: "Tác giả",
      institution: "Tổ chức",
      generatedByLabel: "Được tạo bởi",
      verification: "Xác minh",
      privacyLabel: "Quyền riêng tư",
      doiChecked: "DOI đã kiểm tra",
      relatedReports: "Báo cáo Liên quan",
      aiTransparency: "Minh bạch AI",
      summaryGeneratedBy: "Tóm tắt được tạo bởi AI",
      traceableClaims: "Mọi đoạn văn đều liên kết đến tham chiếu hỗ trợ.",
      hallucinationCheck: "Kiểm tra Ảo giác",
      noUnsupported: "Không phát hiện tuyên bố không được hỗ trợ.",
      unsupportedClaims: "Tuyên bố không được hỗ trợ",
      verifiedCitations: "Trích dẫn đã xác minh",
      traceability: "Khả năng truy vết",
      reportId: "Mã báo cáo",
      version: "Phiên bản",
      visibility: "Hiển thị",
      public: "Công khai",
      integrity: "Tính toàn vẹn",
      shaVerified: "SHA256 đã xác minh",
    },
    en: {
      langLabel: "English",
      altLang: "Tiếng Việt",
      altLangCode: "vi",
      verifiedBadge: "VERIFIED",
      reportTitle: "Research Overview Report",
      reportSubtitle: "Large Language Models for Scientific Research",
      generatedBy: "Generated by ResearchMind AI",
      author: "Viu Rmah",
      readTime: "min read",
      documents: "documents",
      citations: "citations",
      aiAssisted: "AI Assisted",
      verified: "VERIFIED",
      downloadPdf: "Download PDF",
      exportDocx: "Export DOCX",
      copyCitation: "Copy Citation",
      shareReport: "Share Report",
      openWorkspace: "Open Workspace",
      researchIntegrity: "Research Integrity",
      trustOriginalDocs: "Original documents never uploaded",
      trustLocal: "Report generated locally",
      trustMetadata: "Citation metadata verified",
      trustDoi: "DOI validated",
      trustDedup: "Duplicate references removed",
      trustAiTraceable: "AI summary traceable",
      notAvailable: "Not Available",
      privacy: "Privacy",
      privacyPdf: "Original PDF",
      privacyEmbeddings: "Embeddings",
      privacyStoredLocal: "Stored locally only",
      privacyShared: "Shared Data",
      privacySummary: "Executive Summary",
      privacyCitations: "Selected Citations",
      privacyRefMeta: "Reference Metadata",
      privacyNothingElse: "Nothing else.",
      executiveSummary: "Executive Summary",
      executiveDesc: "ResearchMind synthesized",
      published: "published between",
      mainConclusions: "Main Conclusions",
      overallConfidence: "Overall Confidence",
      evidenceCoverage: "Evidence Coverage",
      researchQuestion: "Research Question",
      keyFindings: "Key Findings",
      finding: "Finding",
      confidence: "Confidence",
      supportedBy: "Supported by",
      evidenceMatrix: "Evidence Matrix",
      claim: "Claim",
      papers: "Papers",
      quality: "Quality",
      consensus: "Consensus",
      high: "High",
      medium: "Medium",
      low: "Low",
      strong: "Strong",
      moderate: "Moderate",
      limited: "Limited",
      citationExplorer: "Citation Explorer",
      doiVerified: "DOI Verified",
      publisher: "Publisher",
      openPaper: "Open Paper",
      copyApa: "Copy APA",
      copyBibtex: "Copy BibTeX",
      copyDoi: "Copy DOI",
      knowledgeGraph: "Knowledge Graph",
      timeline: "Timeline",
      evidenceConfidence: "Evidence Confidence",
      supportedBySources: "Supported by",
      sources: "sources",
      conflictingEvidence: "Conflicting Evidence",
      consensusScore: "Consensus",
      reproducibility: "Generation Details",
      llm: "LLM",
      embedding: "Embedding",
      reranker: "Reranker",
      generated: "Generated",
      promptVersion: "Prompt Version",
      workspaceVersion: "Workspace Version",
      generatedWith: "Generated with ResearchMind",
      footerDesc: "This report was automatically generated from the author's selected research materials.",
      footerLocal: "Original documents remain on the author's device.",
      footerShared: "Only explicitly shared information is published.",
      copyright: "ResearchMind",
      darkMode: "Dark Mode",
      lightMode: "Light Mode",
      language: "Language",
      copyLink: "Copy Link",
      linkCopied: "Link copied!",
      researchPassport: "Research Passport",
      authorLabel: "Author",
      institution: "Institution",
      generatedByLabel: "Generated by",
      verification: "Verification",
      privacyLabel: "Privacy",
      doiChecked: "DOI Checked",
      relatedReports: "Related Reports",
      aiTransparency: "AI Transparency",
      summaryGeneratedBy: "Summary generated by AI",
      traceableClaims: "Every paragraph links back to its supporting references.",
      hallucinationCheck: "Hallucination Check",
      noUnsupported: "No unsupported statements detected.",
      unsupportedClaims: "Unsupported claims",
      verifiedCitations: "Verified citations",
      traceability: "Traceability",
      reportId: "Report ID",
      version: "Version",
      visibility: "Visibility",
      public: "Public",
      integrity: "Integrity",
      shaVerified: "SHA256 Verified",
    },
  };

  /* ─── State ─────────────────────────────────────────────── */
  var currentLang = "vi";
  var currentTheme = "light";
  var reportData = null;

  /* ─── Mock report data (in production, fetch from API) ──── */
  function getDefaultReportData() {
    return {
      id: "8D3A9F",
      version: "v1.2",
      generated: "24 Jul 2026 14:32 UTC+7",
      title: "Large Language Models for Scientific Research",
      author: "Viu Rmah",
      date: "24 Jul 2026",
      readTime: 8,
      docCount: 36,
      citationCount: 218,
      questions: "How can GraphRAG improve evidence retrieval compared with traditional vector search?",
      summary: {
        yearRange: "2021–2026",
        conclusions: [
          "GraphRAG improves retrieval accuracy by 24% over dense vector search alone on biomedical datasets.",
          "Hybrid search (BM25 + Vector + Rerank) achieves the best MRR across academic benchmarks.",
          "Agent-based memory systems reduce hallucination rates by up to 40% in evidence-grounded generation.",
        ],
        confidence: "High",
        coverage: 87,
      },
      findings: [
        { id: 1, text: "GraphRAG improves evidence retrieval by 24% over dense vector search", confidence: 5, papers: 12, yearRange: "2024–2026" },
        { id: 2, text: "Hybrid search outperforms single-stage retrieval in academic benchmarks", confidence: 4, papers: 8, yearRange: "2023–2026" },
        { id: 3, text: "Agent memory systems reduce hallucination in evidence-grounded generation", confidence: 3, papers: 4, yearRange: "2025–2026" },
      ],
      evidenceMatrix: [
        { claim: "GraphRAG improves retrieval", papers: 12, quality: "High", consensus: "Strong" },
        { claim: "Hybrid Search faster", papers: 8, quality: "Medium", consensus: "Moderate" },
        { claim: "Agent Memory useful", papers: 4, quality: "Low", consensus: "Limited" },
      ],
      citations: [
        { id: 1, title: "GraphRAG: Unlocking LLM Discovery on Narrative Private Data", venue: "Nature", year: 2025, doi: "10.1038/s41586-025-00123-4", publisher: "Springer Nature", verified: true },
        { id: 2, title: "Hybrid Search Architectures for Scientific Literature Retrieval", venue: "ACL", year: 2024, doi: "10.18653/v1/2024.acl-long.123", publisher: "ACL Anthology", verified: true },
        { id: 3, title: "Agent Memory: Reducing Hallucination in RAG Systems", venue: "NeurIPS", year: 2025, doi: "10.48550/arXiv.2501.12345", publisher: "arXiv", verified: true },
        { id: 4, title: "Semantic Scholar: A Scalable Academic Search Engine", venue: "ArXiv", year: 2024, doi: "10.48550/arXiv.2412.04567", publisher: "arXiv", verified: false },
      ],
      timeline: { 2021: 2, 2022: 4, 2023: 8, 2024: 11, 2025: 14, 2026: 5 },
      confidence: { level: "High", sources: 36, conflicting: 3, consensus: 82 },
      reproducibility: {
        llm: "Gemini 2.5 Flash",
        embedding: "BGE-M3",
        reranker: "bge-reranker-v2",
        generated: "24 Jul 2026",
        promptVersion: "ResearchMind v1.4",
        workspaceVersion: "v0.6.0",
      },
      graph: [
        { from: "Paper A", to: "Method" },
        { from: "Method", to: "Experiment" },
        { from: "Experiment", to: "Finding" },
        { from: "Finding", to: "Conclusion" },
      ],
      aiTransparency: {
        verifiedCitations: 36,
        unsupportedClaims: 0,
        traceability: 100,
      },
      integrity: {
        originalDocs: true,
        localGeneration: true,
        metadataVerified: true,
        doiValidated: true,
        dedupRemoved: true,
        aiTraceable: true,
      },
      related: [
        "Hybrid Search Benchmark",
        "Evidence Matrix",
        "Literature Review",
        "GraphRAG Notes",
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════

  function t(key) {
    return (LOCALE[currentLang] && LOCALE[currentLang][key]) || key;
  }

  function starRating(n) {
    var s = "";
    for (var i = 0; i < 5; i++) {
      s += i < n
        ? '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" style="color:var(--report-star);"><path d="M10 1l2.39 4.84L17.6 6.7l-3.8 3.7.9 5.26L10 13.2l-4.7 2.5.9-5.26L2.4 6.7l5.21-.86L10 1z"/></svg>'
        : '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--report-star);opacity:0.3;"><path d="M10 1l2.39 4.84L17.6 6.7l-3.8 3.7.9 5.26L10 13.2l-4.7 2.5.9-5.26L2.4 6.7l5.21-.86L10 1z"/></svg>';
    }
    return s;
  }

  function esc(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════
  // URL helpers
  // ═══════════════════════════════════════════════════════════

  function getLangFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var l = params.get("lang");
    if (l === "en" || l === "vi") return l;
    return "vi";
  }

  function updateUrlLang(lang) {
    var url = new URL(window.location);
    url.searchParams.set("lang", lang);
    history.replaceState(null, "", url.toString());
  }

  function toggleLanguage() {
    currentLang = currentLang === "vi" ? "en" : "vi";
    updateUrlLang(currentLang);
    renderReport();
  }

  // ═══════════════════════════════════════════════════════════
  // Theme
  // ═══════════════════════════════════════════════════════════

  function getTheme() {
    return localStorage.getItem("rm-theme") || "light";
  }

  function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rm-theme", theme);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.innerHTML = theme === "dark" ? "☀️" : "🌙";
    var floatBtn = document.getElementById("floatThemeToggle");
    if (floatBtn) floatBtn.innerHTML = theme === "dark" ? t("lightMode") : t("darkMode");
  }

  function toggleTheme() {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  }

  // ═══════════════════════════════════════════════════════════
  // Floating Toolbar
  // ═══════════════════════════════════════════════════════════

  function createFloatingToolbar() {
    var existing = document.getElementById("floatToolbar");
    if (existing) existing.remove();

    var bar = document.createElement("div");
    bar.id = "floatToolbar";
    bar.className = "report-float-toolbar";
    bar.innerHTML =
      '<button class="float-btn" onclick="window.print()" title="' + t("downloadPdf") + '" aria-label="' + t("downloadPdf") + '">⬇ PDF</button>' +
      '<button class="float-btn" id="floatThemeToggle" onclick="window.__rmToggleTheme()" title="' + (currentTheme === "dark" ? t("lightMode") : t("darkMode")) + '">' + (currentTheme === "dark" ? t("lightMode") : t("darkMode")) + '</button>' +
      '<button class="float-btn" onclick="window.__rmCopyLink()" title="' + t("copyLink") + '" aria-label="' + t("copyLink") + '">🔗 ' + t("copyLink") + '</button>' +
      '<button class="float-btn float-lang" onclick="window.__rmToggleLang()" title="' + t("language") + '">' + (currentLang === "vi" ? "EN" : "VI") + '</button>';
    document.body.appendChild(bar);
  }

  // ─── Expose toggle functions globally ─────────────────────
  window.__rmToggleTheme = function () {
    toggleTheme();
    createFloatingToolbar();
  };
  window.__rmToggleLang = function () {
    toggleLanguage();
    createFloatingToolbar();
  };
  window.__rmCopyLink = function () {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        showToast(t("linkCopied"));
      });
    } else {
      showToast(t("linkCopied"));
    }
  };

  function showToast(msg) {
    var t = document.createElement("div");
    t.className = "report-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }
  window.showToast = showToast;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  function renderReport() {
    var root = document.getElementById("report-root");
    if (!root || !reportData) return;

    var d = reportData;
    var integrity = d.integrity;

    // Build trust items
    var trustItems = [
      { ok: integrity.originalDocs, label: t("trustOriginalDocs") },
      { ok: integrity.localGeneration, label: t("trustLocal") },
      { ok: integrity.metadataVerified, label: t("trustMetadata") },
      { ok: integrity.doiValidated, label: t("trustDoi") },
      { ok: integrity.dedupRemoved, label: t("trustDedup") },
      { ok: integrity.aiTraceable, label: t("trustAiTraceable") },
    ];

    var trustHtml = trustItems.map(function (item) {
      return '<div class="report-trust-item"><span class="report-trust-icon' + (item.ok ? '' : ' report-trust-na') + '">' + (item.ok ? '✅' : '⚪') + '</span><span>' + esc(item.label) + '</span></div>';
    }).join("");

    // Evidence matrix rows
    var matrixRows = d.evidenceMatrix.map(function (row) {
      var qClass = row.quality === "High" ? "quality-high" : row.quality === "Medium" ? "quality-med" : "quality-low";
      var cClass = row.consensus === "Strong" ? "consensus-strong" : row.consensus === "Moderate" ? "consensus-mod" : "consensus-limited";
      return '<tr><td class="matrix-claim">' + esc(row.claim) + '</td><td class="matrix-num">' + row.papers + '</td><td class="' + qClass + '">' + t(row.quality.toLowerCase()) + '</td><td class="' + cClass + '">' + t(row.consensus.toLowerCase()) + '</td></tr>';
    }).join("");

    // Citation cards
    var citationCards = d.citations.map(function (c) {
      return '<div class="report-citation-card">' +
        '<div class="citation-venue">' + esc(c.venue) + ' · ' + c.year + '</div>' +
        '<div class="citation-title">' + esc(c.title) + '</div>' +
        '<div class="citation-meta">' +
          '<span class="citation-doi-badge' + (c.verified ? '' : ' unverified') + '">' + (c.verified ? '✅ ' : '') + t("doiVerified") + '</span>' +
          '<span>' + esc(c.publisher) + '</span>' +
        '</div>' +
        '<div class="citation-actions">' +
          '<a href="https://doi.org/' + esc(c.doi) + '" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">' + t("openPaper") + '</a>' +
          '<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(\'' + esc(c.title) + '. ' + esc(c.venue) + ', ' + c.year + '. DOI: ' + esc(c.doi) + '\');showToast(\'' + t("copyApa") + '\')">' + t("copyApa") + '</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(\'@article{' + c.id + ',\\\\n  title={' + esc(c.title) + '},\\\\n  year={' + c.year + '},\\\\n  doi={' + esc(c.doi) + '},\\\\n}\');showToast(\'' + t("copyBibtex") + '\')">' + t("copyBibtex") + '</button>' +
        '</div>' +
      '</div>';
    }).join("");

    // Timeline
    var years = Object.keys(d.timeline).sort();
    var maxVal = Math.max.apply(null, years.map(function (y) { return d.timeline[y]; }));
    var timelineBars = years.map(function (y) {
      var pct = (d.timeline[y] / maxVal) * 100;
      return '<div class="timeline-year"><div class="timeline-label">' + y + '</div><div class="timeline-bar-track"><div class="timeline-bar-fill" style="width:' + pct + '%"></div></div><div class="timeline-count">' + d.timeline[y] + '</div></div>';
    }).join("");

    // Knowledge graph
    var graphNodes = d.graph.map(function (g) {
      return '<div class="graph-node"><div class="graph-node-label">' + esc(g.from) + '</div><div class="graph-arrow">↓</div></div>';
    }).join("") + '<div class="graph-node"><div class="graph-node-label">' + esc(d.graph[d.graph.length - 1].to) + '</div></div>';

    // Related reports
    var relatedHtml = d.related.map(function (r) {
      return '<a href="#" class="related-chip">' + esc(r) + '</a>';
    }).join("");

    root.innerHTML =
      /* ── Report Container ── */
      '<div class="report-container">' +
        /* ═══ VERIFIED HEADER ═══ */
        '<div class="report-header-verified">' +
          '<div class="report-header-top">' +
            '<span class="report-verified-badge">🟢 ' + t("verifiedBadge") + ' RESEARCH REPORT</span>' +
            '<span class="report-brand-header">Research<span style="color:var(--accent-blue);">Mind</span></span>' +
          '</div>' +
          '<div class="report-header-meta">' +
            '<div class="report-meta-item"><span class="meta-label">' + t("reportId") + '</span><span class="meta-value">RM-2026-07-24-' + esc(d.id) + '</span></div>' +
            '<div class="report-meta-item"><span class="meta-label">' + t("version") + '</span><span class="meta-value">' + esc(d.version) + '</span></div>' +
            '<div class="report-meta-item"><span class="meta-label">' + t("generated") + '</span><span class="meta-value">' + esc(d.generated) + '</span></div>' +
            '<div class="report-meta-item"><span class="meta-label">' + t("visibility") + '</span><span class="meta-value public-badge">🌍 ' + t("public") + '</span></div>' +
            '<div class="report-meta-item"><span class="meta-label">' + t("integrity") + '</span><span class="meta-value integrity-badge">🔒 ' + t("shaVerified") + '</span></div>' +
          '</div>' +
        '</div>' +

        /* ═══ RESEARCH PASSPORT ═══ */
        '<div class="report-passport">' +
          '<div class="passport-header">' + t("researchPassport") + '</div>' +
          '<div class="passport-grid">' +
            '<div class="passport-item"><span class="passport-label">' + t("authorLabel") + '</span><span class="passport-value">' + esc(d.author) + '</span></div>' +
            '<div class="passport-item"><span class="passport-label">' + t("institution") + '</span><span class="passport-value passport-na">—</span></div>' +
            '<div class="passport-item"><span class="passport-label">' + t("generatedByLabel") + '</span><span class="passport-value">ResearchMind Studio</span></div>' +
            '<div class="passport-item"><span class="passport-label">' + t("verification") + '</span><span class="passport-value passport-ok">' + t("trustMetadata") + '</span></div>' +
            '<div class="passport-item"><span class="passport-label">' + t("privacyLabel") + '</span><span class="passport-value passport-ok">Local-first</span></div>' +
            '<div class="passport-item"><span class="passport-label">DOI</span><span class="passport-value passport-ok">' + t("doiChecked") + '</span></div>' +
          '</div>' +
        '</div>' +

        /* ═══ HERO ═══ */
        '<div class="report-hero">' +
          '<div class="hero-badges">' +
            '<span class="hero-badge-item">👤 ' + esc(d.author) + '</span>' +
            '<span class="hero-badge-item">📅 ' + esc(d.date) + '</span>' +
            '<span class="hero-badge-item">⏱ ' + d.readTime + ' ' + t("readTime") + '</span>' +
            '<span class="hero-badge-item">📄 ' + d.docCount + ' ' + t("documents") + '</span>' +
            '<span class="hero-badge-item">📑 ' + d.citationCount + ' ' + t("citations") + '</span>' +
            '<span class="hero-badge-item hero-badge-ai">🧠 ' + t("aiAssisted") + '</span>' +
            '<span class="hero-badge-item hero-badge-verified">🟢 ' + t("verified") + '</span>' +
          '</div>' +
          '<h1 class="report-hero-title"><span class="gradient-text">' + esc(t("reportTitle")) + '</span></h1>' +
          '<p class="report-hero-subtitle">' + esc(d.title) + '</p>' +
          '<p class="report-hero-byline">' + t("generatedBy") + '</p>' +
          '<div class="report-hero-actions">' +
            '<button class="btn btn-primary" onclick="window.print()">⬇ ' + t("downloadPdf") + '</button>' +
            '<button class="btn btn-secondary">📄 ' + t("exportDocx") + '</button>' +
            '<button class="btn btn-secondary" onclick="navigator.clipboard.writeText(\'' + esc(d.title) + '. ResearchMind, ' + d.date + '. DOI: RM-' + esc(d.id) + '\');showToast(\'' + t("copyCitation") + '\')">📚 ' + t("copyCitation") + '</button>' +
            '<button class="btn btn-secondary" onclick="window.__rmCopyLink()">🔗 ' + t("shareReport") + '</button>' +
            '<a href="https://researchmind.app" class="btn btn-ghost">🚀 ' + t("openWorkspace") + '</a>' +
          '</div>' +
        '</div>' +

        /* ═══ TRUST CENTER ═══ */
        '<div class="report-section report-trust">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">🔒 ' + t("researchIntegrity") + '</h2>' +
          '<div class="report-trust-grid">' + trustHtml + '</div>' +
        '</div>' +

        /* ═══ PRIVACY ═══ */
        '<div class="report-section report-privacy">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">🛡️ ' + t("privacy") + '</h2>' +
          '<div class="privacy-grid">' +
            '<div class="privacy-row"><span class="privacy-label">' + t("privacyPdf") + '</span><span class="privacy-status privacy-local">🟢 ' + t("privacyStoredLocal") + '</span></div>' +
            '<div class="privacy-row"><span class="privacy-label">' + t("privacyEmbeddings") + '</span><span class="privacy-status privacy-local">🟢 ' + t("privacyStoredLocal") + '</span></div>' +
            '<div class="privacy-divider"></div>' +
            '<div class="privacy-row"><span class="privacy-label privacy-shared-label">' + t("privacyShared") + '</span></div>' +
            '<div class="privacy-row"><span class="privacy-label">' + t("privacySummary") + '</span><span class="privacy-status privacy-shared">✅</span></div>' +
            '<div class="privacy-row"><span class="privacy-label">' + t("privacyCitations") + '</span><span class="privacy-status privacy-shared">✅</span></div>' +
            '<div class="privacy-row"><span class="privacy-label">' + t("privacyRefMeta") + '</span><span class="privacy-status privacy-shared">✅</span></div>' +
            '<div class="privacy-row"><span class="privacy-label privacy-na-label" style="opacity:0.6;">' + t("privacyNothingElse") + '</span></div>' +
          '</div>' +
        '</div>' +

        /* ═══ EXECUTIVE SUMMARY ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">📋 ' + t("executiveSummary") + '</h2>' +
          '<p class="report-summary-desc">' + t("executiveDesc") + ' ' + d.docCount + ' ' + t("documents") + ' ' + t("published") + ' ' + esc(d.summary.yearRange) + '.</p>' +
          '<h3 class="report-subsection-title">' + t("mainConclusions") + '</h3>' +
          '<ul class="report-conclusions">' +
            d.summary.conclusions.map(function (c, i) {
              return '<li class="conclusion-item" data-citation-idx="' + (i + 1) + '"><span class="conclusion-bullet">•</span><span class="conclusion-text">' + esc(c) + ' <sup class="conclusion-sup">[' + (i + 1) + ',' + (i + 2) + ']</sup></span></li>';
            }).join("") +
          '</ul>' +
          '<div class="summary-stats">' +
            '<div class="summary-stat"><span class="stat-label">' + t("overallConfidence") + '</span><span class="stat-value stat-high">' + t(d.summary.confidence.toLowerCase()) + '</span></div>' +
            '<div class="summary-stat"><span class="stat-label">' + t("evidenceCoverage") + '</span><span class="stat-value">' + d.summary.coverage + '%</span></div>' +
          '</div>' +
        '</div>' +

        /* ═══ RESEARCH QUESTION ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">❓ ' + t("researchQuestion") + '</h2>' +
          '<div class="research-question-block">' +
            '<p>' + esc(d.questions) + '</p>' +
          '</div>' +
        '</div>' +

        /* ═══ KEY FINDINGS ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">💡 ' + t("keyFindings") + '</h2>' +
          '<div class="findings-grid">' +
            d.findings.map(function (f) {
              return '<div class="finding-card">' +
                '<div class="finding-number">' + t("finding") + ' #' + f.id + '</div>' +
                '<div class="finding-text">' + esc(f.text) + '</div>' +
                '<div class="finding-confidence">' + starRating(f.confidence) + '</div>' +
                '<div class="finding-meta"><span>' + t("supportedBy") + ' ' + f.papers + ' ' + t("documents") + '</span><span>' + t("published") + ' ' + esc(f.yearRange) + '</span></div>' +
              '</div>';
            }).join("") +
          '</div>' +
        '</div>' +

        /* ═══ EVIDENCE MATRIX ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">📊 ' + t("evidenceMatrix") + '</h2>' +
          '<div class="matrix-wrapper">' +
            '<table class="report-matrix">' +
              '<thead><tr><th>' + t("claim") + '</th><th>' + t("papers") + '</th><th>' + t("quality") + '</th><th>' + t("consensus") + '</th></tr></thead>' +
              '<tbody>' + matrixRows + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +

        /* ═══ CITATION EXPLORER ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">📚 ' + t("citationExplorer") + '</h2>' +
          '<div class="citations-grid">' + citationCards + '</div>' +
        '</div>' +

        /* ═══ KNOWLEDGE GRAPH ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">🔗 ' + t("knowledgeGraph") + '</h2>' +
          '<div class="graph-flow">' + graphNodes + '</div>' +
        '</div>' +

        /* ═══ TIMELINE ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">📈 ' + t("timeline") + '</h2>' +
          '<div class="timeline-chart">' + timelineBars + '</div>' +
        '</div>' +

        /* ═══ AI CONFIDENCE ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">🎯 ' + t("evidenceConfidence") + '</h2>' +
          '<div class="confidence-panel">' +
            '<div class="confidence-main"><span class="confidence-level level-' + d.confidence.level.toLowerCase() + '">' + t(d.confidence.level.toLowerCase()) + '</span></div>' +
            '<div class="confidence-stats">' +
              '<div class="confidence-stat"><span class="cstat-label">' + t("supportedBySources") + '</span><span class="cstat-value">' + d.confidence.sources + ' ' + t("sources") + '</span></div>' +
              '<div class="confidence-stat"><span class="cstat-label">' + t("conflictingEvidence") + '</span><span class="cstat-value cstat-warn">' + d.conflicting + '</span></div>' +
              '<div class="confidence-stat"><span class="cstat-label">' + t("consensusScore") + '</span><span class="cstat-value">' + d.confidence.consensus + '%</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ═══ AI TRANSPARENCY ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">🔍 ' + t("aiTransparency") + '</h2>' +
          '<div class="transparency-panel">' +
            '<div class="transparency-row"><span>' + t("summaryGeneratedBy") + '</span><span class="transparency-ok">✅</span></div>' +
            '<p class="transparency-desc">' + t("traceableClaims") + '</p>' +
            '<div class="transparency-divider"></div>' +
            '<div class="transparency-row"><span>' + t("hallucinationCheck") + '</span><span class="transparency-ok">✅ ' + t("noUnsupported") + '</span></div>' +
            '<div class="transparency-stats">' +
              '<div class="transparency-stat"><span class="tstat-label">' + t("unsupportedClaims") + '</span><span class="tstat-value tstat-good">0</span></div>' +
              '<div class="transparency-stat"><span class="tstat-label">' + t("verifiedCitations") + '</span><span class="tstat-value">' + d.aiTransparency.verifiedCitations + '/' + d.citations.length + '</span></div>' +
              '<div class="transparency-stat"><span class="tstat-label">' + t("traceability") + '</span><span class="tstat-value">' + d.aiTransparency.traceability + '%</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ═══ REPRODUCIBILITY ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">⚙️ ' + t("reproducibility") + '</h2>' +
          '<div class="repro-grid">' +
            '<div class="repro-item"><span class="repro-label">' + t("llm") + '</span><span class="repro-value">' + esc(d.reproducibility.llm) + '</span></div>' +
            '<div class="repro-item"><span class="repro-label">' + t("embedding") + '</span><span class="repro-value">' + esc(d.reproducibility.embedding) + '</span></div>' +
            '<div class="repro-item"><span class="repro-label">' + t("reranker") + '</span><span class="repro-value">' + esc(d.reproducibility.reranker) + '</span></div>' +
            '<div class="repro-item"><span class="repro-label">' + t("generated") + '</span><span class="repro-value">' + esc(d.reproducibility.generated) + '</span></div>' +
            '<div class="repro-item"><span class="repro-label">' + t("promptVersion") + '</span><span class="repro-value">' + esc(d.reproducibility.promptVersion) + '</span></div>' +
            '<div class="repro-item"><span class="repro-label">' + t("workspaceVersion") + '</span><span class="repro-value">' + esc(d.reproducibility.workspaceVersion) + '</span></div>' +
          '</div>' +
        '</div>' +

        /* ═══ RELATED REPORTS ═══ */
        '<div class="report-section">' +
          '<div class="section-divider"></div>' +
          '<h2 class="report-section-title">📎 ' + t("relatedReports") + '</h2>' +
          '<div class="related-chips">' + relatedHtml + '</div>' +
        '</div>' +

        /* ═══ FOOTER ═══ */
        '<div class="report-footer">' +
          '<div class="report-footer-brand">Research<span style="color:var(--accent-blue);">Mind</span></div>' +
          '<p class="report-footer-desc">' + t("footerDesc") + '</p>' +
          '<p class="report-footer-desc">' + t("footerLocal") + '</p>' +
          '<p class="report-footer-desc">' + t("footerShared") + '</p>' +
          '<p class="report-footer-copy">© ' + new Date().getFullYear() + ' ' + t("copyright") + '</p>' +
        '</div>' +
      '</div>';

    // Update page title
    document.title = d.title + " — ResearchMind";
    var canon = document.getElementById("canonicalLink");
    if (canon) canon.href = window.location.href;
    setTheme(currentTheme);
    createFloatingToolbar();
  }

  // ═══════════════════════════════════════════════════════════
  // INIT — dispatch based on page type
  // ═══════════════════════════════════════════════════════════
  document.addEventListener("DOMContentLoaded", function () {
    if (isReportPage()) {
      currentLang = getLangFromUrl();
      currentTheme = getTheme();
      reportData = getDefaultReportData();

      // Fix conflicting property name (typo in mock data)
      // d.conflicting -> d.confidence.conflicting
      reportData.conflicting = reportData.confidence.conflicting;

      renderReport();
      return;
    }

    // ─── REGULAR PAGE LOGIC (non-report pages) ───────────────
    var urlParams = new URLSearchParams(window.location.search);

    // Navbar scroll
    var navbar = document.getElementById("navbar");
    if (navbar) {
      window.addEventListener("scroll", function () {
        if (window.scrollY > 20) {
          navbar.classList.add("scrolled");
        } else {
          navbar.classList.remove("scrolled");
        }
      });
    }

    // Mobile menu toggle
    var navToggle = document.getElementById("navToggle");
    var navLinks = document.getElementById("navLinks");
    if (navToggle && navLinks) {
      navToggle.addEventListener("click", function () {
        navToggle.classList.toggle("active");
        navLinks.classList.toggle("open");
      });
      document.querySelectorAll(".nav-links a").forEach(function (link) {
        link.addEventListener("click", function () {
          navToggle.classList.remove("active");
          navLinks.classList.remove("open");
        });
      });
    }

    // Hero video
    var heroVideo = document.getElementById("heroVideo");
    if (heroVideo) {
      var vid = heroVideo.querySelector("video");
      var barFill = document.getElementById("videoBarFill");
      var barTime = document.getElementById("videoBarTime");
      var barTrack = heroVideo.querySelector(".video-bar-track");

      function fmt(t) { var m = Math.floor(t / 60); var s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }

      heroVideo.addEventListener("click", function (e) {
        if (e.target.closest(".video-bar-track,.video-bar-time")) return;
        if (vid.paused) { vid.play(); this.classList.add("playing"); }
        else { vid.pause(); this.classList.remove("playing"); }
      });

      if (vid) {
        vid.addEventListener("timeupdate", function () {
          var pct = (vid.currentTime / vid.duration) * 100;
          if (barFill) barFill.style.width = pct + "%";
          if (barTime) barTime.textContent = fmt(vid.currentTime);
        });
        vid.addEventListener("ended", function () {
          heroVideo.classList.remove("playing");
          if (barFill) barFill.style.width = "0%";
          if (barTime) barTime.textContent = "0:00";
        });
      }

      if (barTrack) {
        barTrack.addEventListener("click", function (e) {
          var rect = this.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var pct = x / rect.width;
          if (vid) vid.currentTime = pct * vid.duration;
        });
      }
    }

    // Anchor scrolling
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        var href = this.getAttribute("href");
        if (href === "#") return;
        e.preventDefault();
        var target = document.querySelector(href);
        if (target) {
          var offset = 72;
          var top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top: top, behavior: "smooth" });
        }
      });
    });

    // Collaboration invitation portal (?invite=)
    var inviteParam = urlParams.get("invite");
    var workspaceParam = urlParams.get("workspace") || "Default Workspace";
    var roleParam = urlParams.get("role") || "reviewer";

    if (inviteParam) {
      var roleLabel =
        roleParam === "editor" ? "✏️ Editor (Cùng đọc, note và sửa)" :
        roleParam === "reviewer" ? "🔍 Reviewer (Soát bằng chứng & Phản biện)" :
        "👁️ Viewer (Chỉ xem báo cáo)";

      var inviteHtml =
        '<div id="live-collab-invite" style="max-width:860px;margin:40px auto;padding:36px;background:var(--report-card-bg);border:1px solid var(--report-border);border-radius:var(--radius-lg);color:var(--text-primary);box-shadow:0 20px 50px rgba(0,0,0,0.6);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px solid var(--report-border);margin-bottom:28px;">' +
            '<span style="font-size:0.75rem;font-weight:800;background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.35);padding:4px 14px;border-radius:999px;letter-spacing:0.05em;">👥 LỜI MỜI CỘNG TÁC NGHIÊN CỨU</span>' +
            '<a href="https://researchmind.pages.dev" style="color:var(--accent-blue);text-decoration:none;font-size:0.85rem;font-weight:700;">← ResearchMind</a>' +
          '</div>' +
          '<h1 style="font-size:1.8rem;font-weight:800;margin-bottom:12px;">Bạn nhận được lời mời tham gia Dự án Nghiên cứu!</h1>' +
          '<p style="font-size:0.95rem;color:var(--text-secondary);line-height:1.6;margin-bottom:28px;">Đồng nghiệp / Giáo viên đã mời bạn cùng đọc tài liệu, kiểm tra trích dẫn và đọc tổng quan bằng chứng khoa học trên hệ thống ResearchMind AI Workspace.</p>' +
          '<div style="background:var(--bg-surface);border:1px solid var(--report-border);border-radius:var(--radius-md);padding:22px;margin-bottom:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;">' +
            '<div><span style="font-size:0.78rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Người mời (UID)</span><strong style="color:var(--accent-blue);font-family:monospace;font-size:0.95rem;">' + esc(inviteParam) + '</strong></div>' +
            '<div><span style="font-size:0.78rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Dự án / Workspace</span><strong style="font-size:0.95rem;">' + esc(workspaceParam) + '</strong></div>' +
            '<div><span style="font-size:0.78rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Quyền Hạn Được Gán</span><span style="color:var(--report-green);font-weight:700;font-size:0.95rem;">' + roleLabel + '</span></div>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">' +
            '<button onclick="window.location.href=\'researchmind://invite?invite=' + encodeURIComponent(inviteParam) + '&workspace=' + encodeURIComponent(workspaceParam) + '&role=' + encodeURIComponent(roleParam) + '\';setTimeout(function(){showToast(\'🚀 Đã kích hoạt Desktop App!\')},800)" style="padding:12px 24px;border-radius:var(--radius-sm);background:var(--accent-blue);color:#fff;border:none;font-weight:700;cursor:pointer;font-size:0.9rem;">🚀 Mở ResearchMind Desktop App</button>' +
            '<a href="https://researchmind.pages.dev/docs.html" style="padding:12px 24px;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);border:1px solid var(--report-border);font-weight:600;text-decoration:none;font-size:0.9rem;">📖 Hướng dẫn Cộng tác</a>' +
          '</div>' +
        '</div>';

      var mainContainer = document.querySelector("main") || document.querySelector(".container") || document.body;
      if (mainContainer && typeof mainContainer.innerHTML !== "undefined") {
        mainContainer.innerHTML = inviteHtml;
      }
    }
  });
})();
