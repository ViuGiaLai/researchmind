import React, { useState, useEffect } from "react";
import { IconBrain, IconSearch, IconLibrary, IconChat, IconSettings, IconLock, IconBulb, IconSparkle, IconCalendar, IconBookmark, IconBookOpen } from "./components/Icons";
import { LibraryView } from "./components/library/LibraryView";
import { HighlightsLibraryView } from "./components/library/HighlightsLibraryView";
import { SearchView } from "./components/search/SearchView";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { InsightsView } from "./components/insights/InsightsView";
import { PersonalBrainView } from "./components/personal/PersonalBrainView";
import { DailyReaderView } from "./components/personal/DailyReaderView";
import { WowAnalysisView } from "./components/insights/WowAnalysisView";
import { ReviewBuilderView } from "./components/review/ReviewBuilderView";
import { AISetupWizard } from "./components/setup/AISetupWizard";
import { ToastProvider } from "./components/shared/Toast";
import { api } from "./lib/api";

type Tab = "wow" | "library" | "highlights" | "search" | "chat" | "insights" | "review" | "brain" | "daily" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("wow");
  const [wowPaperId, setWowPaperId] = useState<string | null>(null);
  const [chatPaperIds, setChatPaperIds] = useState<string[]>([]);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const [initialMode, setInitialMode] = useState<"chat" | "review" | "critique" | "debate" | "verify">("chat");
  const [showSetup, setShowSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [initMessage, setInitMessage] = useState("Đang khởi động backend...");
  const retryCountRef = React.useRef(0);

  useEffect(() => {
    checkFirstRun();
  }, []);

  const checkFirstRun = async () => {
    try {
      const h = await api.health();
      setInitMessage(h.init_message || "Đang khởi động...");
      const s = await api.getSettings();
      if (!s.setup_completed) {
        setShowSetup(true);
      }
      setCheckingSetup(false);
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current < 5) {
        setTimeout(checkFirstRun, 2000);
      } else {
        setCheckingSetup(false);
        setShowSetup(true);
      }
    }
  };

  const handleStartChat = (paperIds: string[]) => {
    setInitialQuery(undefined);
    setInitialMode("chat");
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  const handleStartReview = (paperIds: string[]) => {
    setInitialQuery("Tóm tắt giúp tôi các paper này theo cấu trúc: Background, Related Work, Methods, Key Findings, Research Gaps, và Insights.");
    setInitialMode("review");
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  const handleStartCritique = (paperIds: string[]) => {
    setInitialQuery("Phản biện giúp tôi các paper này: liệt kê giả thiết sai hoặc chưa hợp lý, thiếu sót dữ liệu, hạn chế phương pháp, nguy cơ overclaim, và 3 đề xuất cải thiện.");
    setInitialMode("critique");
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  const handleStartDebate = (paperIds: string[]) => {
    setInitialQuery("Hãy tạo một cuộc tranh luận giữa hai AI (AI A và AI B) về chủ đề liên quan đến các paper này. Mỗi bên nêu luận điểm và phản biện, có trích dẫn và kết luận ngắn. Cuối cùng đưa ra 3 đề xuất kiểm chứng.");
    setInitialMode("debate");
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  const handleStartVerify = (paperIds: string[]) => {
    setInitialQuery("Xác thực các kết quả nghiên cứu trong các paper này dựa trên dữ liệu học thuật bên ngoài.");
    setInitialMode("verify");
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  const handleStartWow = (paperId: string) => {
    setWowPaperId(paperId);
    setActiveTab("wow");
  };

  // If showing setup wizard
  if (showSetup || checkingSetup) {
    return (
      <div className="app">
        {showSetup && <AISetupWizard onComplete={() => setShowSetup(false)} />}
        {checkingSetup && !showSetup && (
          <div className="app-loading">
            <div className="app-loading-content">
              <IconBrain size={56} className="icon-gradient" style={{ marginBottom: 16 }} />
              <p>{initMessage}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ToastProvider>
    <div className="app-container">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
          <span className="brand-text">ResearchMind</span>
        </div>
        
        <nav className="sidebar-menu">
          {[
            { tab: "wow" as Tab, icon: IconSparkle, label: "Phân tích tài liệu AI" },
            { tab: "library" as Tab, icon: IconLibrary, label: "Thư viện" },
            { tab: "highlights" as Tab, icon: IconBookmark, label: "Đoạn trích" },
            { tab: "search" as Tab, icon: IconSearch, label: "Tìm kiếm" },
            { tab: "chat" as Tab, icon: IconChat, label: "Chat AI" },
            { tab: "insights" as Tab, icon: IconBulb, label: "Insights" },
            { tab: "review" as Tab, icon: IconBookOpen, label: "Review Builder" },
            { tab: "brain" as Tab, icon: IconBrain, label: "Bộ não" },
            { tab: "daily" as Tab, icon: IconCalendar, label: "Đọc hôm nay" },
            { tab: "settings" as Tab, icon: IconSettings, label: "Cài đặt" },
          ].map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
              className={`sidebar-menu-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => {
                if (activeTab !== tab) {
                  setInitialQuery(undefined);
                }
                setActiveTab(tab);
              }}
            >
              <Icon size={18} style={{ marginRight: 12 }} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-local-info">
            <IconLock size={12} style={{ marginRight: 6 }} />
            <span>Dữ liệu cục bộ</span>
          </div>
          <div className="sidebar-version">
            v0.2.0
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="main">
        {activeTab === "wow" && (
          <WowAnalysisView
            onStartChat={handleStartChat}
            onStartDebate={handleStartDebate}
            initialPaperId={wowPaperId}
            onClearInitialPaperId={() => setWowPaperId(null)}
          />
        )}
        {activeTab === "search" && <SearchView onStartChat={handleStartChat} />}
        {activeTab === "library" && (
          <LibraryView
            onStartChat={handleStartChat}
            onStartReview={handleStartReview}
            onStartCritique={handleStartCritique}
            onStartDebate={handleStartDebate}
            onStartVerify={handleStartVerify}
            onStartWow={handleStartWow}
          />
        )}
        {activeTab === "highlights" && (
          <HighlightsLibraryView onStartChat={handleStartChat} />
        )}
        {activeTab === "chat" && (
          <ChatView
            key={`${chatPaperIds.join(",")}-${initialQuery ?? ""}-${initialMode}`}
            initialPaperIds={chatPaperIds}
            initialQuery={initialQuery}
            initialMode={initialMode}
            onGoToLibrary={() => {
              setActiveTab("library");
            }}
          />
        )}
        {activeTab === "insights" && <InsightsView onStartChat={handleStartChat} />}
        {activeTab === "review" && <ReviewBuilderView />}
        {activeTab === "brain" && <PersonalBrainView />}
        {activeTab === "daily" && <DailyReaderView />}
        {activeTab === "settings" && <SettingsView />}
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
