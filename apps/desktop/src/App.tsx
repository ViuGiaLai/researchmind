import React, { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { IconBrain, IconLibrary, IconChat, IconSettings, IconLock, IconSparkle, IconCalendar, IconBookOpen, IconGraph, IconChart, IconSpinner } from "./components/Icons";
import { LibraryHub } from "./components/hub/LibraryHub";
import { ReviewHub } from "./components/hub/ReviewHub";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { PersonalBrainView } from "./components/personal/PersonalBrainView";
import { DailyReaderView } from "./components/personal/DailyReaderView";
import { WowAnalysisView } from "./components/insights/WowAnalysisView";
import { GraphView } from "./components/graph/GraphView";
import { EvidenceMatrixView } from "./components/evidence/EvidenceMatrixView";
import { AISetupWizard } from "./components/setup/AISetupWizard";
import { ToastProvider } from "./components/shared/Toast";
import { api } from "./lib/api";

type Tab = "wow" | "library" | "chat" | "review" | "brain" | "daily" | "graph" | "evidence" | "settings";

const LABS_TABS: { tab: Tab; icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string }[] = [
  { tab: "wow", icon: IconSparkle, label: "Phân tích sâu" },
  { tab: "brain", icon: IconBrain, label: "Bộ não" },
  { tab: "daily", icon: IconCalendar, label: "Đọc hôm nay" },
  { tab: "graph", icon: IconGraph, label: "Biểu đồ" },
];

function LabsBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <div style={{
      display: "flex", gap: "16px", padding: "16px 20px 12px",
      borderBottom: "1px solid var(--color-border, #282828)",
      flexShrink: 0, alignItems: "center",
    }}>
      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--color-text-muted, #94a3b8)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Phòng thí nghiệm
      </span>
      {LABS_TABS.map(({ tab, icon: LabIcon, label }) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #333)",
            background: activeTab === tab ? "rgba(99, 102, 241, 0.08)" : "transparent",
            color: activeTab === tab ? "var(--color-primary, #6366f1)" : "var(--color-text-muted, #94a3b8)",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.15s",
          }}
        >
          <LabIcon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("researchmind:sidebar-collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("researchmind:sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    checkFirstRun();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("researchmind:last-tab", activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

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
      const h = await api.health();
      setBackendUnavailable(false);
      setInitMessage(h.init_message || "Đang khởi động...");
      const s = await api.getSettings();
      if (!s.setup_completed) {
        setShowSetup(true);
      }
      setCheckingSetup(false);
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current < 30) {
        setTimeout(checkFirstRun, 2000);
      } else {
        setCheckingSetup(false);
        setBackendUnavailable(true);
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
            <p>Không thể kết nối đến backend tại http://127.0.0.1:8765.</p>
            <p style={{ opacity: 0.72, fontSize: 14 }}>
              Nếu đang chạy bản web/dev, hãy khởi động FastAPI hoặc chạy ứng dụng qua Tauri.
            </p>
            <button
              onClick={retryBackendConnection}
              style={{
                marginTop: 12,
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--color-primary)",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
              }}
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
        {showSetup && <AISetupWizard onComplete={() => setShowSetup(false)} />}
        {checkingSetup && !showSetup && (
          <div className="app-container">
            <aside className="app-sidebar">
              <div className="sidebar-brand">
                <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
                <span className="brand-text">ResearchMind</span>
              </div>
              <nav className="sidebar-menu">
                {["Thư viện", "Tìm kiếm", "Chat AI", "Review Builder", "Cài đặt"].map((label) => (
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
            { tab: "review" as Tab, icon: IconBookOpen, label: "Đánh giá" },
            { tab: "evidence" as Tab, icon: IconChart, label: "Bằng chứng" },
            { tab: "settings" as Tab, icon: IconSettings, label: "Cài đặt" },
          ].map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
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
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="sidebar-local-info">
              <IconLock size={12} style={{ marginRight: 6 }} />
              <span>Dữ liệu cục bộ</span>
            </div>
            <div className="sidebar-version">
              v0.6.0
            </div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <main className="main">
        {(["wow", "brain", "daily", "graph", "settings"] as Tab[]).includes(activeTab) ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <LabsBar activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="labs-content" style={{ flex: 1, overflow: "hidden" }}>
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
              {activeTab === "settings" && <SettingsView />}
            </div>
          </div>
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
    </div>
    </ToastProvider>
  );
}

export default App;
