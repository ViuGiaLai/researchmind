import React, { useState, useEffect } from "react";
import { IconBrain, IconSearch, IconLibrary, IconChat, IconSettings, IconLock } from "./components/Icons";
import { LibraryView } from "./components/library/LibraryView";
import { SearchView } from "./components/search/SearchView";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { AISetupWizard } from "./components/setup/AISetupWizard";
import { api } from "./lib/api";

type Tab = "library" | "search" | "chat" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [chatPaperIds, setChatPaperIds] = useState<string[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const retryCountRef = React.useRef(0);

  useEffect(() => {
    checkFirstRun();
  }, []);

  const checkFirstRun = async () => {
    try {
      const s = await api.getSettings();
      // Show wizard if onboarding setup is not completed yet
      if (!s.setup_completed) {
        setShowSetup(true);
      }
    } catch {
      // Retry up to 5 times with 2s delay
      retryCountRef.current += 1;
      if (retryCountRef.current < 5) {
        setTimeout(checkFirstRun, 2000);
      }
    } finally {
      setCheckingSetup(false);
    }
  };

  const handleStartChat = (paperIds: string[]) => {
    setChatPaperIds(paperIds);
    setActiveTab("chat");
  };

  // If showing setup wizard
  if (showSetup || checkingSetup) {
    return (
      <div className="app">
        {showSetup && <AISetupWizard onComplete={() => setShowSetup(false)} />}
        {checkingSetup && !showSetup && (
          <div className="app-loading">
            <div className="app-loading-content">
              <IconBrain size={48} className="icon-gradient" style={{ marginBottom: 16 }} />
              <p>Đang khởi động ResearchMind VN...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">
            <IconBrain size={24} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
            ResearchMind VN
          </h1>
        </div>
        <div className="header-right">
          {[
            { tab: "search" as Tab, icon: IconSearch, label: "Tìm kiếm" },
            { tab: "library" as Tab, icon: IconLibrary, label: "Thư viện" },
            { tab: "chat" as Tab, icon: IconChat, label: "Chat AI" },
            { tab: "settings" as Tab, icon: IconSettings, label: "" },
          ].map(({ tab, icon: Icon, label }) => (
            <button
              key={tab}
              className={`nav-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              <Icon size={16} style={{ marginRight: label ? 4 : 0 }} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        {activeTab === "search" && <SearchView onStartChat={handleStartChat} />}
        {activeTab === "library" && <LibraryView onStartChat={handleStartChat} />}
        {activeTab === "chat" && <ChatView key={chatPaperIds.join(",")} initialPaperIds={chatPaperIds} />}
        {activeTab === "settings" && <SettingsView />}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <IconLock size={12} style={{ marginRight: 4 }} />
          Local-first · Dữ liệu trên máy bạn
        </div>
        <div className="footer-right">
          🎓 ResearchMind VN v0.1.0
        </div>
      </footer>
    </div>
  );
}

export default App;
