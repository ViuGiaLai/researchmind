import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-shell";
import { IconBrain, IconLibrary, IconChat, IconLock, IconSparkle, IconCalendar, IconBookOpen, IconGraph, IconChart, IconSpinner, IconBookmark, IconSearch, IconBulb, IconFilter, IconFolder } from "./components/Icons";
import { HelpMenu } from "./components/help/HelpMenu";
import { UserMenu } from "./components/account/UserMenu";
import { HelpCenterView } from "./components/help/HelpCenterView";
import { WelcomeTour, hasSeenWelcomeTour, resetWelcomeTourSeen } from "./components/help/WelcomeTour";
import type { HelpSectionId } from "./components/help/helpContent";
import { useToast } from "./components/shared/Toast";
import { SubTabBar } from "./components/shared/SubTabBar";
import { CommandPalette, type CommandTarget } from "./components/shared/CommandPalette";
import { api, BASE_URL } from "./lib/api";
import { useAuth } from "./lib/auth-provider";
import { SyncStatus } from "./components/auth/SyncStatus";
import { MasterPasswordModal } from "./components/auth/MasterPasswordModal";
import { SyncDaemon } from "./lib/sync";

const LibraryView = React.lazy(() => import("./components/library/LibraryView").then(({ LibraryView }) => ({ default: LibraryView })));
const HighlightsLibraryView = React.lazy(() => import("./components/library/HighlightsLibraryView").then(({ HighlightsLibraryView }) => ({ default: HighlightsLibraryView })));
const SearchView = React.lazy(() => import("./components/search/SearchView").then(({ SearchView }) => ({ default: SearchView })));
const DiscoveryView = React.lazy(() => import("./components/discovery/DiscoveryView").then(({ DiscoveryView }) => ({ default: DiscoveryView })));
const ReviewBuilderView = React.lazy(() => import("./components/review/ReviewBuilderView").then(({ ReviewBuilderView }) => ({ default: ReviewBuilderView })));
const InsightsView = React.lazy(() => import("./components/insights/InsightsView").then(({ InsightsView }) => ({ default: InsightsView })));
const ScreeningBoard = React.lazy(() => import("./components/screening/ScreeningBoard").then(({ ScreeningBoard }) => ({ default: ScreeningBoard })));
const ChatView = React.lazy(() => import("./components/chat/ChatView").then(({ ChatView }) => ({ default: ChatView })));
const SettingsView = React.lazy(() => import("./components/settings/SettingsView").then(({ SettingsView }) => ({ default: SettingsView })));
const AccountView = React.lazy(() => import("./components/account/AccountView").then(({ AccountView }) => ({ default: AccountView })));
const PersonalBrainView = React.lazy(() => import("./components/personal/PersonalBrainView").then(({ PersonalBrainView }) => ({ default: PersonalBrainView })));
const DailyReaderView = React.lazy(() => import("./components/personal/DailyReaderView").then(({ DailyReaderView }) => ({ default: DailyReaderView })));
const WowAnalysisView = React.lazy(() => import("./components/insights/WowAnalysisView").then(({ WowAnalysisView }) => ({ default: WowAnalysisView })));
const GraphView = React.lazy(() => import("./components/graph/GraphView").then(({ GraphView }) => ({ default: GraphView })));
const EvidenceMatrixView = React.lazy(() => import("./components/evidence/EvidenceMatrixView").then(({ EvidenceMatrixView }) => ({ default: EvidenceMatrixView })));
const ProjectWorkspaceView = React.lazy(() => import("./components/projects/ProjectWorkspaceView").then(({ ProjectWorkspaceView }) => ({ default: ProjectWorkspaceView })));
const AISetupWizard = React.lazy(() => import("./components/setup/AISetupWizard").then(({ AISetupWizard }) => ({ default: AISetupWizard })));

type Tab = "wow" | "projects" | "library" | "chat" | "review" | "brain" | "daily" | "graph" | "evidence" | "settings" | "account";

const VALID_TABS = new Set<Tab>(["wow", "projects", "library", "chat", "review", "brain", "daily", "graph", "evidence", "settings", "account"]);

function isValidTab(value: string | null): value is Tab {
  return value !== null && VALID_TABS.has(value as Tab);
}

const LABS_TABS = ["wow", "brain", "daily", "graph"] as const;
type LabsTab = (typeof LABS_TABS)[number];

function getLabsTabItems(t: (key: string) => string): { tab: LabsTab; icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string }[] {
  return [
    { tab: "wow", icon: IconSparkle, label: t("labs.deep_analysis") },
    { tab: "brain", icon: IconBrain, label: t("labs.brain") },
    { tab: "daily", icon: IconCalendar, label: t("labs.daily_read") },
    { tab: "graph", icon: IconGraph, label: t("labs.graph") },
  ];
}

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
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<"library" | "highlights" | "search" | "discovery">("library");
  const tabs = [
    { key: "library" as const, icon: IconLibrary, label: t("library.title") },
    { key: "highlights" as const, icon: IconBookmark, label: t("library.highlights") },
    { key: "search" as const, icon: IconSearch, label: t("library.search") },
    { key: "discovery" as const, icon: IconSparkle, label: t("library.discovery") },
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
  projectId?: string;
  initialPaperIds?: string[];
}> = ({ onStartChat, projectId, initialPaperIds }) => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<"review" | "insights" | "screening">("review");
  const tabs = [
    { key: "review" as const, icon: IconBookOpen, label: t("review.title") },
    { key: "insights" as const, icon: IconBulb, label: t("review.insights") },
    { key: "screening" as const, icon: IconFilter, label: t("review.screening") },
  ];
  return (
    <div className="hub-shell">
      <SubTabBar tabs={tabs} active={subTab} onChange={setSubTab} variant="underline" />
      <div className="hub-shell__content">
        {subTab === "review" && <ReviewBuilderView projectId={projectId} initialPaperIds={initialPaperIds} />}
        {subTab === "insights" && <InsightsView onStartChat={onStartChat} />}
        {subTab === "screening" && <ScreeningBoard projectId={projectId} />}
      </div>
    </div>
  );
};

function App() {
  const { addToast } = useToast();
  const auth = useAuth();
  const requestSignIn = () => auth.signIn();
  const { t } = useTranslation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem("researchmind:last-tab");
      return isValidTab(saved) ? saved : "library";
    } catch {
      return "library";
    }
  });
  const [wowPaperId, setWowPaperId] = useState<string | null>(null);
  const [chatPaperIds, setChatPaperIds] = useState<string[]>([]);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const [initialMode, setInitialMode] = useState<"chat" | "review" | "critique" | "debate" | "verify">("chat");
  const [e2eeLocked, setE2eeLocked] = useState(false);
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(() => {
    try { return localStorage.getItem("researchmind:active-project") || undefined; } catch { return undefined; }
  });
  const [workflowPaperIds, setWorkflowPaperIds] = useState<string[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  const [initMessage, setInitMessage] = useState(t("startup.starting_backend"));
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
  const [settingsSection, setSettingsSection] = useState<string>("general");
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
    const handleResize = () => {
      if (window.innerWidth <= 960) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
      addToast("error", e instanceof Error ? e.message : t("startup.replay_setup_error"));
    }
  }, [addToast, t]);

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
          ? t("startup.ready")
          : (h.init_message || t("startup.initializing_ai"))
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
          ? t("startup.connecting_backend")
          : t("startup.starting_backend_retry", { seconds: waitSeconds })
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
        setInitMessage(t("startup.backend_timeout"));
      }
    }
  };

  const retryBackendConnection = () => {
    retryCountRef.current = 0;
    setBackendUnavailable(false);
    setCheckingSetup(true);
    setInitMessage(t("startup.starting_backend"));
    checkFirstRun();
  };

  const handleStartChat = (paperIds: string[], query?: string) => {
    setInitialQuery(query);
    setInitialMode("chat");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartReview = (paperIds: string[]) => {
    setInitialQuery(t("chat.review_mode"));
    setInitialMode("review");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleOpenProjectReview = (paperIds: string[], projectId: string) => {
    setActiveProjectId(projectId);
    setWorkflowPaperIds(paperIds);
    setActiveTab("review");
  };

  const handleProjectChange = (projectId?: string) => {
    setActiveProjectId(projectId);
    try {
      if (projectId) localStorage.setItem("researchmind:active-project", projectId);
      else localStorage.removeItem("researchmind:active-project");
    } catch {}
  };

  const handleStartCritique = (paperIds: string[]) => {
    setInitialQuery(t("chat.critique_mode"));
    setInitialMode("critique");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartDebate = (paperIds: string[]) => {
    setInitialQuery(t("chat.debate_mode"));
    setInitialMode("debate");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartVerify = (paperIds: string[]) => {
    setInitialQuery(t("chat.verify_mode"));
    setInitialMode("verify");
    setChatPaperIds(paperIds);
    setChatSessionKey((k) => k + 1);
    setActiveTab("chat");
  };

  const handleStartWow = (paperId: string) => {
    setWowPaperId(paperId);
    setActiveTab("wow");
  };

  // Check if E2EE master password needs to be set (when user logs in without salt)
  useEffect(() => {
    if (!auth.user) {
      setE2eeLocked(false);
      return;
    }
    const hasSalt = localStorage.getItem("rm_e2ee_salt");
    // If salt exists, user has already set up E2EE — ask for unlock
    // If no salt, they'll set it up on first use (modal shown on first note)
    setE2eeLocked(!!hasSalt && !localStorage.getItem("rm_e2ee_unlocked"));
  }, [auth.user]);

  // Start/stop background sync daemon when auth state changes
  // Note: auth.getToken intentionally omitted from deps — its reference
  // changes every render but its behavior is stable (reads localStorage).
  useEffect(() => {
    if (!auth.user) return;
    const daemon = new SyncDaemon(auth.getToken);
    daemon.start();
    return () => daemon.stop();
  }, [auth.user]);

  useEffect(() => {
    const onCommandKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onCommandKey);
    return () => window.removeEventListener("keydown", onCommandKey);
  }, []);

  // If showing setup wizard
  if (backendUnavailable) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="app-loading-content">
            <IconBrain size={56} className="icon-gradient" style={{ marginBottom: 16 }} />
            <p>{t("startup.cannot_connect", { url: BASE_URL })}</p>
            <p style={{ opacity: 0.72, fontSize: 14 }}>
              {t("startup.web_dev_hint")}
            </p>
            <button
              onClick={retryBackendConnection}
              className="app-retry-btn"
            >
              {t("startup.retry_connection")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSetup || checkingSetup) {
    return (
      <div className="app">
        {showSetup && (
          <React.Suspense fallback={<div className="app-loading"><IconSpinner size={32} /></div>}>
            <AISetupWizard onComplete={handleSetupComplete} />
          </React.Suspense>
        )}
        {checkingSetup && !showSetup && (
          <div className="app-container">
            <aside className="app-sidebar">
              <div className="sidebar-brand">
                <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
                <span className="brand-text">ResearchMind</span>
              </div>
              <nav className="sidebar-menu">
                {[t("nav.library"), t("library.search"), t("nav.chat"), t("nav.review"), t("nav.settings")].map((label) => (
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
    <>
    <a className="skip-link" href="#main-content">{t("common.skip_to_content", { defaultValue: "Skip to content" })}</a>
      <div className="app-container">
      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <IconBrain size={26} className="icon-gradient" style={{ marginRight: 8 }} />
          <span className="brand-text">{sidebarCollapsed ? "RM" : "ResearchMind"}</span>
          <button
            type="button"
            className={`sidebar-collapse-btn${sidebarCollapsed ? " collapsed" : ""}`}
            onClick={toggleSidebar}
            title={sidebarCollapsed ? t("nav.sidebar_expand") : t("nav.sidebar_collapse")}
            aria-expanded={!sidebarCollapsed}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={sidebarCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="sidebar-command-btn"
          onClick={() => setCommandOpen(true)}
          title={t("command.title")}
          aria-label={t("command.title")}
        >
          <IconSearch size={17} />
          <span className="sidebar-command-label">{t("command.title")}</span>
          <kbd className="sidebar-command-shortcut">Ctrl K</kbd>
        </button>
        
        <nav className="sidebar-menu" aria-label={t("common.main_navigation", { defaultValue: "Main navigation" })}>
          {!sidebarCollapsed && (
            <div className="sidebar-group-label">
              {t("nav.workspace", { defaultValue: "Workspace" })}
            </div>
          )}
            {[
            { tab: "library" as Tab, icon: IconLibrary, label: t("nav.library") },
            { tab: "projects" as Tab, icon: IconFolder, label: t("nav.projects") },
            { tab: "chat" as Tab, icon: IconChat, label: t("nav.chat") },
            { tab: "review" as Tab, icon: IconBookOpen, label: t("nav.review") },
            { tab: "evidence" as Tab, icon: IconChart, label: t("nav.evidence") },
          ].map(({ tab, icon: Icon, label }) => (
            <button
              type="button"
              key={tab}
              id={tab === "library" ? "sidebar-library" : tab === "chat" ? "sidebar-chat" : tab === "review" ? "sidebar-review" : undefined}
              className={`sidebar-menu-btn ${activeTab === tab ? "active" : ""}`}
              aria-current={activeTab === tab ? "page" : undefined}
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

          {!sidebarCollapsed && (
            <div className="sidebar-group-label">
              {t("nav.intelligence", { defaultValue: "Intelligence" })}
            </div>
          )}

          <button
            type="button"
            id="sidebar-labs"
            className={`sidebar-menu-btn sidebar-menu-btn-labs ${isLabsTab(activeTab) ? "active" : ""}`}
            aria-current={isLabsTab(activeTab) ? "page" : undefined}
            onClick={() => setActiveTab(isLabsTab(activeTab) ? activeTab : "wow")}
            title={sidebarCollapsed ? t("nav.labs") : undefined}
          >
            <IconSparkle size={20} />
            <span className="sidebar-label">{t("nav.labs")}</span>
          </button>

        </nav>

        <HelpMenu
          onOpenSection={(id) => setHelpSection(id)}
          onStartTour={openWelcomeTour}
        />

        {!sidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="sidebar-footer-meta">
              <div className="sidebar-core-value">
                <div className="sidebar-local-info">
                  <IconLock size={12} style={{ marginRight: 6 }} />
                  <span>{t("common.data_local")}</span>
                </div>
                <div className="sidebar-core-value-text">{t("app.tagline")}</div>
              </div>
              <div className="sidebar-version">
                v0.6.0
              </div>
            </div>
            <SyncStatus />
            <UserMenu
              sidebarCollapsed={false}
              activeTab={activeTab}
              onNavigate={(tab, section) => {
                if (section) setSettingsSection(section);
                setActiveTab(tab as Tab);
              }}
              onRequestSignIn={requestSignIn}
            />
          </div>
        )}
        {sidebarCollapsed && (
          <UserMenu
            sidebarCollapsed={true}
            activeTab={activeTab}
            onNavigate={(tab, section) => {
              if (section) setSettingsSection(section);
              setActiveTab(tab as Tab);
            }}
            onRequestSignIn={requestSignIn}
          />
        )}
      </aside>

      {/* Main content area */}
      <main id="main-content" className="main" tabIndex={-1}>
        <React.Suspense
          fallback={
            <div className="page-loading-state" role="status" aria-live="polite">
              <IconSpinner size={24} />
              <span>{t("common.loading")}</span>
            </div>
          }
        >
        {isLabsTab(activeTab) ? (
          <div className="hub-shell">
            <SubTabBar
              tabs={getLabsTabItems(t).map(({ tab, icon, label }) => ({ key: tab, icon, label }))}
              active={activeTab}
              onChange={setActiveTab}
              variant="pills"
              label={t("labs.title")}
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
        ) : activeTab === "account" ? (
          <AccountView onOpenSettings={() => { setSettingsSection("data"); setActiveTab("settings"); }} />
        ) : activeTab === "settings" ? (
          <SettingsView
            initialSection={settingsSection as any}
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
            {activeTab === "projects" && (
              <ProjectWorkspaceView
                onStartChat={(paperIds, query, projectId) => {
                  handleProjectChange(projectId);
                  setWorkflowPaperIds(paperIds);
                  handleStartChat(paperIds, query);
                }}
                onStartReview={handleOpenProjectReview}
                onProjectChange={handleProjectChange}
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
              <ReviewHub onStartChat={handleStartChat} projectId={activeProjectId} initialPaperIds={workflowPaperIds} />
            )}
            {activeTab === "evidence" && <EvidenceMatrixView projectId={activeProjectId} initialPaperIds={workflowPaperIds} />}
          </>
        )}
        </React.Suspense>
      </main>

      {helpSection && (
        <HelpCenterView
          sectionId={helpSection}
          onClose={() => setHelpSection(null)}
          onNavigate={setHelpSection}
        />
      )}

      {e2eeLocked && (
        <MasterPasswordModal
          onUnlock={() => {
            localStorage.setItem("rm_e2ee_unlocked", "true");
            setE2eeLocked(false);
          }}
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
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={(target: CommandTarget) => setActiveTab(target)}
        onOpenPaper={(paperId) => handleStartChat([paperId])}
      />
      </div>
    </>
  );
}

export default App;
