import React, { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { IconBrain, IconLibrary, IconChat, IconSettings, IconLock, IconSparkle, IconCalendar, IconBookOpen, IconGraph, IconChart, IconSpinner, IconBookmark, IconSearch, IconBulb, IconFilter } from "./components/Icons";
import { LibraryView } from "./components/library/LibraryView";
import { HighlightsLibraryView } from "./components/library/HighlightsLibraryView";
import { SearchView } from "./components/search/SearchView";
import { DiscoveryView } from "./components/discovery/DiscoveryView";
import { ReviewBuilderView } from "./components/review/ReviewBuilderView";
import { InsightsView } from "./components/insights/InsightsView";
import { ScreeningBoard } from "./components/screening/ScreeningBoard";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { PersonalBrainView } from "./components/personal/PersonalBrainView";
import { DailyReaderView } from "./components/personal/DailyReaderView";
import { WowAnalysisView } from "./components/insights/WowAnalysisView";
import { GraphView } from "./components/graph/GraphView";
import { EvidenceMatrixView } from "./components/evidence/EvidenceMatrixView";
import { AISetupWizard } from "./components/setup/AISetupWizard";
import { HelpMenu } from "./components/help/HelpMenu";
import { HelpCenterView } from "./components/help/HelpCenterView";
import { WelcomeTour, hasSeenWelcomeTour, resetWelcomeTourSeen } from "./components/help/WelcomeTour";
import type { HelpSectionId } from "./components/help/helpContent";
import { ToastProvider } from "./components/shared/Toast";
import { SubTabBar } from "./components/shared/SubTabBar";
import { api, BASE_URL } from "./lib/api";

type Tab = "wow" | "library" | "chat" | "review" | "brain" | "daily" | "graph" | "evidence" | "settings";

const LABS_TABS = ["wow", "brain", "daily", "graph"] as const;
type LabsTab = (typeof LABS_TABS)[number];

const LABS_TAB_ITEMS: { tab: LabsTab; icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string }[] = [
  { tab: "wow", icon: IconSparkle, label: "Phân tích sâu" },
  { tab: "brain", icon: IconBrain, label: "Bộ não" },
  { tab: "daily", icon: IconCalendar, label: "Đọc hôm nay" },
  { tab: "graph", icon: IconGraph, label: "Biểu đồ" },
];

function isLabsTab(tab: Tab): tab is LabsTab {
  return (LABS_TABS as readonly string[]).includes(tab);
}

const LibraryHub: React.FC<{
  onStartChat: (paperIds: string[]) => void;
  onStartReview: (paperIds: string[]) => void;
  onStartCritique: (paperIds: string[]) => void;
  onStartDebate?: (paperIds: string[]) => void;
  onStartVerify?: (paperIds: string[]) => void;
  onStartWow?: (paperId: string) => void;
}> = (props) => {
  const [subTab, setSubTab] = useState<"library" | "highlights" | "search" | "discovery">("library");
  const tabs = [
    { key: "library" as const, icon: IconLibrary, label: "Thư viện" },
    { key: "highlights" as const, icon: IconBookmark, label: "Đoạn trích" },
    { key: "search" as const, icon: IconSearch, label: "Tìm kiếm" },
    { key: "discovery" as const, icon: IconSparkle, label: "Khám phá" },
  ];
  return (
    <div className="hub-shell">
      <SubTabBar tabs={tabs} active={subTab} onChange={setSubTab} variant="underline" />
      <div className="hub-shell__content">
        {subTab === "library" && <LibraryView {...props} />}
        {subTab === "highlights" && <HighlightsLibraryView onStartChat={props.onStartChat} />}
        {subTab === "search" && <SearchView onStartChat={props.onStartChat} />}
        {subTab === "discovery" && <DiscoveryView />}
      </div>
    </div>
  );
};

const ReviewHub: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const [subTab, setSubTab] = useState<"review" | "insights" | "screening">("review");
  const tabs = [
    { key: "review" as const, icon: IconBookOpen, label: "Đánh giá" },
    { key: "insights" as const, icon: IconBulb, label: "Nhận định" },
    { key: "screening" as const, icon: IconFilter, label: "Sàng lọc" },
  ];
  return (
    <div className="hub-shell">
      <SubTabBar tabs={tabs} active={subTab} onChange={setSubTab} variant="underline" />
      <div className="hub-shell__content">
        {subTab === "review" && <ReviewBuilderView />}
        {subTab === "insights" && <InsightsView onStartChat={onStartChat} />}
        {subTab === "screening" && <ScreeningBoard />}
      </div>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem("researchmind:last-tab") as Tab) || "library";
    } catch {
      return "library";
    }
  });
  const [wowPaperId, setWowPaperId] = useState<string | null>(null);
  const [chatPaperIds, setChatPaperIds] = useState<string[]>([]);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const [initialMode, setInitialMode] = useState<"chat" | "review" | "critique" | "debate" | "verify">("chat");
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  const [initMessage, setInitMessage] = useState("Đang khởi động backend...");
  const retryCountRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("researchmind:sidebar-collapsed");
      if (saved !== null) return saved === "true";
      return window.innerWidth < 1024;
    } catch {
      return false;
    }
  });
  const [helpSection, setHelpSection] = useState<HelpSectionId | null>(null);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [welcomeTourKey, setWelcomeTourKey] = useState(0);
  const setupJustCompletedRef = React.useRef(false);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("researchmind:sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    checkFirstRun();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      const w = window.innerWidth;
      const level =
        w >= 1400 ? "wide" :
        w >= 1100 ? "comfortable" :
        w >= 960 ? "compact" : "tight";
      document.documentElement.setAttribute("data-viewport", level);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("researchmind:last-tab", activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && helpSection) {
        setHelpSection(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setActiveTab("settings");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [helpSection]);

  const openWelcomeTour = useCallback(() => {
    setWelcomeTourKey((k) => k + 1);
    setShowWelcomeTour(true);
  }, []);

  useEffect(() => {
    if (!checkingSetup && !showSetup && !hasSeenWelcomeTour() && !setupJustCompletedRef.current) {
      const t = window.setTimeout(() => openWelcomeTour(), 600);
      return () => window.clearTimeout(t);
    }
  }, [checkingSetup, showSetup, openWelcomeTour]);

  const handleReplaySetup = useCallback(async () => {
    try {
      await api.updateSettings({ setup_completed: false });
      resetWelcomeTourSeen();
      setupJustCompletedRef.current = false;
      setShowWelcomeTour(false);
      setShowSetup(true);
    } catch (e) {
      console.error("Replay setup failed:", e);
      window.alert(e instanceof Error ? e.message : "Không thể mở lại Setup Wizard.");
    }
  }, []);

  const handleSetupComplete = useCallback(() => {
    setupJustCompletedRef.current = true;
    setShowSetup(false);
    if (!hasSeenWelcomeTour()) {
      window.setTimeout(() => openWelcomeTour(), 400);
    }
  }, [openWelcomeTour]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("/") || href.startsWith("http://localhost") || href.startsWith("http://127.0.0.1")) return;
      e.preventDefault();
      e.stopPropagation();
      open(href).catch((err) => console.error("Failed to open link:", err));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const checkFirstRun = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let h: { status: string; backend_ready?: boolean; init_message?: string };
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765"}/api/ping`, { headers: { "ngrok-skip-browser-warning": "true" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        h = await res.json();
      } catch (fetchErr) {
        clearTimeout(timeout);
        throw fetchErr;
      }

      if (!mountedRef.current) return;
      setBackendUnavailable(false);
      setInitMessage(
        h.backend_ready
          ? "Sẵn sàng"
          : (h.init_message || "Đang khởi tạo AI engine...")
      );

      try {
        const s = await api.getSettings();
        if (!mountedRef.current) return;
        if (!s.setup_completed) {
          setShowSetup(true);
        }
      } catch (settingsErr) {
        console.warn("Settings load during startup:", settingsErr);
      }

      if (!mountedRef.current) return;
      // Only leave the loading screen after setup state is known
      setCheckingSetup(false);
    } catch {
      if (!mountedRef.current) return;
      retryCountRef.current += 1;

      // Surface Tauri spawn errors immediately (bundled backend missing / permission denied)
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const spawn = await invoke<{
          attempted: boolean;
          spawned: boolean;
          error?: string | null;
        }>("get_backend_spawn_status");
        if (spawn.error) {
          if (!mountedRef.current) return;
          setCheckingSetup(false);
          setBackendUnavailable(true);
          setInitMessage(spawn.error);
          return;
        }
      } catch {
        // Not running inside Tauri (web dev) — keep polling health
      }

      const waitSeconds = Math.min(120, retryCountRef.current * 2);
      setInitMessage(
        retryCountRef.current <= 3
          ? "Đang kết nối backend... (chạy `uvicorn main:app --port 8765` hoặc `pnpm tauri:external`)"
          : `Đang khởi động backend... (${waitSeconds}s)`
      );

      const delayMs = retryCountRef.current <= 5 ? 500 : 2000;
      if (retryCountRef.current < 120) {
        setTimeout(() => {
          if (mountedRef.current) checkFirstRun();
        }, delayMs);
      } else {
        if (!mountedRef.current) return;
        setCheckingSetup(false);
        setBackendUnavailable(true);
        setInitMessage(
          "Backend không phản hồi sau 4 phút. Lần đầu mở app có thể cần 1–3 phút để giải nén AI engine."
        );
      }
    }
  };

  const retryBackendConnection = () => {
    retryCountRef.current = 0;
    setBackendUnavailable(false);
    setCheckingSetup(true);
    setInitMessage("Đang khởi động backend...");
    checkFirstRun();
  };

  const handleStartChat = (paperIds: string[]) => {
    setInitialQuery(undefined);
    setInitialMode("chat");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartReview = (paperIds: string[]) => {
    setInitialQuery("Tóm tắt giúp tôi các paper này theo cấu trúc: Background, Related Work, Methods, Key Findings, Research Gaps, và Insights.");
    setInitialMode("review");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartCritique = (paperIds: string[]) => {
    setInitialQuery("Phản biện giúp tôi các paper này: liệt kê giả thiết sai hoặc chưa hợp lý, thiếu sót dữ liệu, hạn chế phương pháp, nguy cơ overclaim, và 3 đề xuất cải thiện.");
    setInitialMode("critique");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartDebate = (paperIds: string[]) => {
    setInitialQuery("Hãy tạo một cuộc tranh luận giữa hai AI (AI A và AI B) về chủ đề liên quan đến các paper này. Mỗi bên nêu luận điểm và phản biện, có trích dẫn và kết luận ngắn. Cuối cùng đưa ra 3 đề xuất kiểm chứng.");
    setInitialMode("debate");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartVerify = (paperIds: string[]) => {
    setInitialQuery("Xác thực các kết quả nghiên cứu trong các paper này dựa trên dữ liệu học thuật bên ngoài.");
    setInitialMode("verify");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartWow = (paperId: string) => {
    setWowPaperId(paperId);
    setActiveTab("wow");
  };

  // If showing setup wizard
  if (backendUnavailable) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="app-loading-content">
            <IconBrain size={56} className="icon-gradient" style={{ marginBottom: 16 }} />
            <p>Không thể kết nối đến backend tại {BASE_URL}.</p>
            <p style={{ opacity: 0.72, fontSize: 14 }}>
              Nếu đang chạy bản web/dev, hãy khởi động FastAPI hoặc chạy ứng dụng qua Tauri.
            </p>
            <button
              onClick={retryBackendConnection}
              className="app-retry-btn"
            >
              Thử kết nối lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSetup || checkingSetup) {
    return (
      <div className="app">
        {showSetup && <AISetupWizard onComplete={handleSetupComplete} />}
        {checkingSetup && !showSetup && (
          <div className="app-container">
            <aside className="app-sidebar">
              <div className="sidebar-brand">
                <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
                <span className="brand-text">ResearchMind</span>
              </div>
              <nav className="sidebar-menu">
                {["Thư viện", "Tìm kiếm", "Chat AI", "Trình tạo review", "Cài đặt"].map((label) => (
                  <button key={label} className="sidebar-menu-btn" disabled>
                    <IconSpinner size={16} style={{ marginRight: 12 }} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </aside>
            <main className="main">
              <div className="app-loading" style={{ minHeight: "100%" }}>
                <div className="app-loading-content">
                  <IconBrain size={56} className="icon-gradient" style={{ marginBottom: 16 }} />
                  <p>{initMessage}</p>
                  <div className="app-loading-bar-track">
                    <div className="app-loading-bar-fill" />
                  </div>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    );
  }

  return (
    <ToastProvider>
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
          <span className="brand-text">{sidebarCollapsed ? "RM" : "ResearchMind"}</span>
          <button
            className={`sidebar-collapse-btn${sidebarCollapsed ? " collapsed" : ""}`}
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={sidebarCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
            </svg>
          </button>
        </div>
        
        <nav className="sidebar-menu">
          {[
            { tab: "library" as Tab, icon: IconLibrary, label: "Thư viện" },
            { tab: "chat" as Tab, icon: IconChat, label: "Chat AI" },
            { tab: "review" as Tab, icon: IconBookOpen, label: "Trình tạo review" },
            { tab: "evidence" as Tab, icon: IconChart, label: "Bằng chứng" },
          ].map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
              id={tab === "library" ? "sidebar-library" : tab === "chat" ? "sidebar-chat" : tab === "review" ? "sidebar-review" : undefined}
              className={`sidebar-menu-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => {
                if (activeTab !== tab) {
                  setInitialQuery(undefined);
                  if (activeTab === "chat") {
                    setChatPaperIds([]);
                    setInitialMode("chat");
                  }
                  if (tab === "chat") {
                    setChatSessionKey((k) => k + 1);
                  }
                }
                setActiveTab(tab);
              }}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={20} />
              <span className="sidebar-label">{label}</span>
            </button>
          ))}

          <div className="sidebar-divider" role="separator" />

          <button
            id="sidebar-labs"
            className={`sidebar-menu-btn sidebar-menu-btn-labs ${isLabsTab(activeTab) ? "active" : ""}`}
            onClick={() => setActiveTab(isLabsTab(activeTab) ? activeTab : "wow")}
            title={sidebarCollapsed ? "Thí nghiệm" : undefined}
          >
            <IconSparkle size={20} />
            <span className="sidebar-label">Thí nghiệm</span>
          </button>

          <button
            className={`sidebar-menu-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
            title={sidebarCollapsed ? "Cài đặt" : undefined}
          >
            <IconSettings size={20} />
            <span className="sidebar-label">Cài đặt</span>
          </button>
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="sidebar-core-value">
              <div className="sidebar-local-info">
                <IconLock size={12} style={{ marginRight: 6 }} />
                <span>Dữ liệu cục bộ</span>
              </div>
              <div className="sidebar-core-value-text">Nền tảng nghiên cứu ưu tiên bằng chứng</div>
            </div>
            <div className="sidebar-version">
              v0.6.0
            </div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <main className="main">
        <HelpMenu
          onOpenSection={(id) => setHelpSection(id)}
          onStartTour={openWelcomeTour}
        />
        {isLabsTab(activeTab) ? (
          <div className="hub-shell">
            <SubTabBar
              tabs={LABS_TAB_ITEMS.map(({ tab, icon, label }) => ({ key: tab, icon, label }))}
              active={activeTab}
              onChange={setActiveTab}
              variant="pills"
              label="Phòng thí nghiệm"
            />
            <div className="hub-shell__content labs-content">
              {activeTab === "wow" && (
                <WowAnalysisView
                  onStartChat={handleStartChat}
                  onStartDebate={handleStartDebate}
                  initialPaperId={wowPaperId}
                  onClearInitialPaperId={() => setWowPaperId(null)}
                />
              )}
              {activeTab === "brain" && <PersonalBrainView />}
              {activeTab === "daily" && <DailyReaderView />}
              {activeTab === "graph" && <GraphView />}
            </div>
          </div>
        ) : activeTab === "settings" ? (
          <SettingsView
            onOpenHelp={(id) => setHelpSection(id)}
            onStartTour={openWelcomeTour}
            onReplaySetup={handleReplaySetup}
          />
        ) : (
          <>
            {activeTab === "library" && (
              <LibraryHub
                onStartChat={handleStartChat}
                onStartReview={handleStartReview}
                onStartCritique={handleStartCritique}
                onStartDebate={handleStartDebate}
                onStartVerify={handleStartVerify}
                onStartWow={handleStartWow}
              />
            )}
            {activeTab === "chat" && (
              <ChatView
                key={`${chatPaperIds.join(",")}-${initialQuery ?? ""}-${initialMode}-s${chatSessionKey}`}
                initialPaperIds={chatPaperIds}
                initialQuery={initialQuery}
                initialMode={initialMode}
                onGoToLibrary={() => {
                  setActiveTab("library");
                }}
              />
            )}
            {activeTab === "review" && (
              <ReviewHub onStartChat={handleStartChat} />
            )}
            {activeTab === "evidence" && <EvidenceMatrixView />}
          </>
        )}
      </main>

      {helpSection && (
        <HelpCenterView
          sectionId={helpSection}
          onClose={() => setHelpSection(null)}
          onNavigate={setHelpSection}
        />
      )}

      {showWelcomeTour && (
        <WelcomeTour
          key={welcomeTourKey}
          onPrepareStep={(targetId) => {
            if (targetId.startsWith("sidebar-") && sidebarCollapsed) {
              setSidebarCollapsed(false);
              try { localStorage.setItem("researchmind:sidebar-collapsed", "false"); } catch {}
            }
          }}
          onComplete={() => setShowWelcomeTour(false)}
          onOpenHelp={() => {
            setShowWelcomeTour(false);
            setHelpSection("getting-started");
          }}
        />
      )}
    </div>
    </ToastProvider>
  );
}

export default App;
