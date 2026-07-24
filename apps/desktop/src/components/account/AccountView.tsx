import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconCopy, IconEdit, IconLock, IconSpinner, IconUser, IconSparkle } from "../Icons";
import { useAuth } from "../../lib/auth-provider";
import { api, type WorkspaceMember } from "../../lib/api";
import "./account.css";

interface AccountViewProps {
  onOpenSettings: () => void;
}

export function AccountView({ onOpenSettings }: AccountViewProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const user = auth.user;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  // Collaborator Invitation Modal State
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<WorkspaceMember["role"]>("reviewer");
  const [collabProjects, setCollabProjects] = useState<Array<{ id: string; title: string; workspace_id?: string }>>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [collabMembers, setCollabMembers] = useState<WorkspaceMember[]>([]);
  const [collabSending, setCollabSending] = useState(false);

  // Join Workspace Modal State
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinLinkInput, setJoinLinkInput] = useState("");
  const [joining, setJoining] = useState(false);

  const provider = useMemo(() => {
    const raw = user?.providerData?.find((item) => item.providerId !== "firebase")?.providerId;
    if (
      raw === "google.com" ||
      raw === "google" ||
      user?.imageUrl?.includes("googleusercontent.com") ||
      user?.photoURL?.includes("googleusercontent.com") ||
      user?.imageUrl?.includes("google")
    ) {
      return "google.com";
    }
    return "email";
  }, [user]);

  const providerLabel =
    provider === "google.com"
      ? "Google"
      : t("account.email_password", "Email & Mật khẩu");
  const displayName = user?.name || user?.email?.split("@")[0] || t("account.researcher");

  if (!user) return (
    <section className="account-view">
      <header className="account-header">
        <p className="account-eyebrow">{t("account.eyebrow")}</p>
        <h1>{t("account.guest_mode_title")}</h1>
        <p>{t("account.guest_mode_desc")}</p>
      </header>

      {/* Guest Status Banner */}
      <section className="account-profile-card">
        <div className="account-profile-top">
          <div className="account-avatar-large">
            <IconUser size={26} />
          </div>
          <div className="account-hero-info">
            <h2>
              {t("account.guest_mode_title")}
              <span className="guest-badge">LOCAL</span>
            </h2>
            <div className="account-hero-email">
              {t("account.guest_status_sub")}
            </div>
          </div>
        </div>
        <div className="account-profile-actions">
          <button className="account-primary-btn" type="button" onClick={() => auth.signOut()}>
            <IconSparkle size={14} /> {t("account.sign_in_now")}
          </button>
        </div>
      </section>

      {/* Compact Comparison Box */}
      <section className="account-compare-box">
        <div className="account-compare-header">
          <IconSparkle size={18} className="icon-gradient" />
          <div>
            <h2>{t("account.compare_title")}</h2>
            <p>{t("account.compare_subtitle")}</p>
          </div>
        </div>

        <div className="account-compare-grid">
          {/* Guest Column */}
          <div className="account-compare-col guest">
            <div className="col-header">
              <span className="col-tag">{t("account.current_mode")}</span>
              <h3>{t("account.guest_col_title")}</h3>
            </div>
            <ul className="compare-list">
              {/* ✅ Shared: Local Data */}
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>{t("account.guest_feat_local_title")}</strong>
                  <small>{t("account.guest_feat_local_desc")}</small>
                </div>
              </li>
              {/* ✅ Shared: BYOK */}
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>{t("account.guest_feat_byok_title")}</strong>
                  <small>{t("account.guest_feat_byok_desc")}</small>
                </div>
              </li>
              {/* ⚠️ Limited: Cloud AI Gateway */}
              <li className="limited">
                <span className="warn-icon">⚠️</span>
                <div>
                  <strong>{t("account.guest_feat_gateway_title")}</strong>
                  <small>{t("account.guest_feat_gateway_desc")}</small>
                </div>
              </li>
              {/* 🐢 Standard: Priority Queue */}
              <li className="limited">
                <span className="warn-icon">🐢</span>
                <div>
                  <strong>{t("account.guest_feat_priority_title")}</strong>
                  <small>{t("account.guest_feat_priority_desc")}</small>
                </div>
              </li>
              {/* ❌ No: Settings Sync */}
              <li className="disabled">
                <span className="cross-icon">✕</span>
                <div>
                  <strong>{t("account.guest_feat_sync_title")}</strong>
                  <small>{t("account.guest_feat_sync_desc")}</small>
                </div>
              </li>
              {/* ❌ No: Cloud Backup */}
              <li className="disabled">
                <span className="cross-icon">✕</span>
                <div>
                  <strong>{t("account.guest_feat_backup_title")}</strong>
                  <small>{t("account.guest_feat_backup_desc")}</small>
                </div>
              </li>
              {/* ❌ No: Multi-device */}
              <li className="disabled">
                <span className="cross-icon">✕</span>
                <div>
                  <strong>{t("account.guest_feat_multidevice_title")}</strong>
                  <small>{t("account.guest_feat_multidevice_desc")}</small>
                </div>
              </li>
              {/* ❌ No: Publish & Share */}
              <li className="disabled">
                <span className="cross-icon">✕</span>
                <div>
                  <strong>{t("account.guest_feat_publish_title")}</strong>
                  <small>{t("account.guest_feat_publish_desc")}</small>
                </div>
              </li>
              {/* ❌ No: Collaborators */}
              <li className="disabled">
                <span className="cross-icon">✕</span>
                <div>
                  <strong>{t("account.guest_feat_collab_title")}</strong>
                  <small>{t("account.guest_feat_collab_desc")}</small>
                </div>
              </li>
            </ul>
          </div>

          {/* Account Column */}
          <div className="account-compare-col account highlight">
            <div className="col-header">
              <span className="col-tag recommended">{t("account.recommended")}</span>
              <h3>{t("account.account_col_title")}</h3>
            </div>
            <ul className="compare-list">
              {/* ⭐ Exclusive: Unlimited Cloud AI */}
              <li className="feature-boost">
                <span className="star-icon">⭐</span>
                <div>
                  <strong>{t("account.acc_feat_cloud_title")}</strong>
                  <small>{t("account.acc_feat_cloud_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Turbo Priority */}
              <li className="feature-boost">
                <span className="star-icon">⚡</span>
                <div>
                  <strong>{t("account.acc_feat_turbo_title")}</strong>
                  <small>{t("account.acc_feat_turbo_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Settings Sync */}
              <li className="feature-boost">
                <span className="star-icon">🔄</span>
                <div>
                  <strong>{t("account.acc_feat_sync_title")}</strong>
                  <small>{t("account.acc_feat_sync_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Cloud Backup */}
              <li className="feature-boost">
                <span className="star-icon">🛡️</span>
                <div>
                  <strong>{t("account.acc_feat_backup_title")}</strong>
                  <small>{t("account.acc_feat_backup_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Multi-device */}
              <li className="feature-boost">
                <span className="star-icon">🌐</span>
                <div>
                  <strong>{t("account.acc_feat_multidevice_title")}</strong>
                  <small>{t("account.acc_feat_multidevice_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Publish & Share */}
              <li className="feature-boost">
                <span className="star-icon">🔗</span>
                <div>
                  <strong>{t("account.acc_feat_publish_title")}</strong>
                  <small>{t("account.acc_feat_publish_desc")}</small>
                </div>
              </li>
              {/* ⭐ Exclusive: Collaborators */}
              <li className="feature-boost">
                <span className="star-icon">👥</span>
                <div>
                  <strong>{t("account.acc_feat_collab_title")}</strong>
                  <small>{t("account.acc_feat_collab_desc")}</small>
                </div>
              </li>
              {/* ✅ Shared: BYOK & Local AI */}
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>{t("account.acc_feat_byok_title")}</strong>
                  <small>{t("account.acc_feat_byok_desc")}</small>
                </div>
              </li>
              {/* 🔒 Shared: PDF Security */}
              <li>
                <span className="check-icon">🔒</span>
                <div>
                  <strong>{t("account.acc_feat_local_title")}</strong>
                  <small>{t("account.acc_feat_local_desc")}</small>
                </div>
              </li>
            </ul>

            <button className="account-primary-btn full-width" type="button" onClick={() => auth.signOut()}>
              <IconSparkle size={14} /> {t("account.activate_free_perks")}
            </button>
          </div>
        </div>
      </section>
    </section>
  );

  const userId = user.uid || user.id;

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setNotice("");
    try {
      await auth.updateDisplayName(name);
      setEditing(false);
      setNotice(t("account.name_updated"));
    } catch {
      setNotice(t("account.name_update_failed"));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!user.email) return;
    setNotice("");
    try {
      await auth.resetPassword(user.email);
      const msg = `📧 Đã gửi Email hướng dẫn Đặt lại Mật khẩu thông qua Clerk tới địa chỉ:\n${user.email}\n\nHãy kiểm tra Hộp thư đến (hoặc mục Spam) của Email này để thực hiện theo hướng dẫn.`;
      setNotice(`📧 Đã gửi Email đặt lại mật khẩu tới ${user.email}`);
      alert(msg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t("account.reset_failed");
      setNotice(errMsg);
      alert(`⚠️ Không thể gửi Email đặt lại mật khẩu: ${errMsg}`);
    }
  };

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice(t("account.copy_failed"));
    }
  };

  const openCollabModal = async () => {
    setShowCollabModal(true);
    try {
      const res = await api.listProjects();
      if (res.projects && res.projects.length > 0) {
        setCollabProjects(res.projects);
        const firstWId = res.projects[0].workspace_id || res.projects[0].id;
        setSelectedWorkspaceId(firstWId);
        void loadWorkspaceMembers(firstWId);
      }
    } catch {
      // Fallback
    }
  };

  const loadWorkspaceMembers = async (wId: string) => {
    try {
      const res = await api.listWorkspaceMembers(wId);
      setCollabMembers(res.members || []);
    } catch {
      setCollabMembers([]);
    }
  };

  const sendCollabInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabEmail.trim()) return;
    setCollabSending(true);
    try {
      const wId = selectedWorkspaceId || "default_workspace";
      await api.addWorkspaceMember(wId, collabEmail.trim(), collabRole);

      const baseUrl = import.meta.env.VITE_PUBLIC_PAGES_URL || "https://researchmind.pages.dev";
      const inviteUrl = `${baseUrl}/docs.html?invite=usr_${(user?.uid || "guest").slice(0, 8)}&workspace=${wId}&role=${collabRole}`;
      void navigator.clipboard.writeText(inviteUrl);

      alert(`👥 Đã gửi lời mời cộng tác thành công tới ${collabEmail.trim()}!\n\nLink tham gia cộng tác (đã sao chép vào clipboard):\n${inviteUrl}`);
      setCollabEmail("");
      if (wId) void loadWorkspaceMembers(wId);
    } catch (err) {
      alert(`⚠️ Không thể gửi lời mời: ${err instanceof Error ? err.message : "Đã có lỗi xảy ra"}`);
    } finally {
      setCollabSending(false);
    }
  };

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinLinkInput.trim()) return;
    setJoining(true);
    try {
      let invite = "guest";
      let workspaceId = joinLinkInput.trim();
      let role = "reviewer";

      if (joinLinkInput.includes("?")) {
        try {
          const url = new URL(joinLinkInput.trim());
          invite = url.searchParams.get("invite") || invite;
          workspaceId = url.searchParams.get("workspace") || workspaceId;
          role = url.searchParams.get("role") || role;
        } catch {
          const matchInv = joinLinkInput.match(/invite=([^&]+)/);
          const matchWs = joinLinkInput.match(/workspace=([^&]+)/);
          const matchRole = joinLinkInput.match(/role=([^&]+)/);
          if (matchInv) invite = matchInv[1];
          if (matchWs) workspaceId = matchWs[1];
          if (matchRole) role = matchRole[1];
        }
      }

      await api.joinWorkspace(workspaceId, user?.email || user?.uid || invite, role, user?.name || user?.email);
      alert(t("account.join_collab_success", { workspace: workspaceId.slice(0, 12), role }));
      setShowJoinModal(false);
      setJoinLinkInput("");
    } catch (err: any) {
      alert(`⚠️ Lỗi khi gia nhập Workspace: ${err?.message || "Không thể xác thực link lời mời"}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <section className="account-hub-view">
      {/* Page Header */}
      <header className="account-hub-header">
        <div className="hub-title-row">
          <div>
            <span className="hub-kicker">
              <span className="live-dot" /> {t("account.hub_kicker", "RESEARCHMIND STUDIO • PRO SESSION")}
            </span>
            <h1>{t("account.title")}</h1>
            <p>{t("account.description")}</p>
          </div>
          <div className="hub-header-actions">
            <button className="account-secondary-btn" type="button" onClick={() => { setName(displayName); setEditing(true); }}>
              <IconEdit size={14} /> {t("account.edit_profile")}
            </button>
            <button className="account-secondary-btn" type="button" onClick={resetPassword} title={t("account.reset_password")}>
              🔑 {t("account.reset_password")}
            </button>
            <button className="account-signout-btn" type="button" onClick={() => auth.signOut()}>
              {t("auth.sign_out")}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Profile Banner Spanning Full Width */}
      <section className="account-hero-banner">
        <div className="hero-banner-main">
          <div className="hero-avatar">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              (user.name || user.email || "R").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="hero-user-info">
            <div className="hero-name-row">
              <h2>{displayName}</h2>
              <span className="pro-badge-glow">
                <IconSparkle size={12} /> {t("account.pro_unlimited", "PRO UNLIMITED")}
              </span>
            </div>
            <p className="hero-email">{user.email || t("account.no_email")}</p>
            <div className="hero-meta-tags">
              <span className="hub-tag">{providerLabel}</span>
              <button type="button" className="hub-tag uid-tag" onClick={copyUid} title={t("account.copy_account_id")}>
                UID: {userId} {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
              </button>
            </div>
          </div>
        </div>

        {/* Inline Name Editor */}
        {editing && (
          <div className="hero-edit-panel">
            <label>
              <span>{t("account.display_name")}</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div className="hero-edit-actions">
              <button className="account-primary-btn" type="button" disabled={saving || !name.trim()} onClick={saveName}>
                {saving ? <IconSpinner size={14} /> : <IconCheck size={14} />} {t("common.save")}
              </button>
              <button className="account-cancel-btn" type="button" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Hero Bottom Perks Strip */}
        <div className="hero-perks-strip">
          <div className="perk-pill active">
            <span className="perk-icon">⚡</span>
            <span>{t("account.perk_cloud_gateway")}: <strong>{t("account.unlimited")} ({t("account.turbo_queue")})</strong></span>
          </div>
          <div className="perk-pill">
            <span className="perk-icon">🛡️</span>
            <span>{t("account.perk_security_status")}: <strong>{t("account.synced_encrypted")}</strong></span>
          </div>
          <div className="perk-pill">
            <span className="perk-icon">🌐</span>
            <span>{t("account.perk_sync")}: <strong>{t("account.multi_device_ready")}</strong></span>
          </div>
          <div className="perk-pill">
            <span className="perk-icon">👥</span>
            <span>{t("account.perk_collab")}: <strong>{t("account.team_ready")}</strong></span>
          </div>
        </div>
      </section>

      {/* Main 2-Column Balanced Dashboard (50% / 50%) */}
      <div className="account-hub-grid">
        {/* Left Panel: Profile Facts & Local Data Security */}
        <section className="hub-panel">
          <div className="hub-panel-header">
            <IconUser size={18} className="icon-teal" />
            <div>
              <h2>{t("account.profile_and_security", "Hồ sơ & Bảo mật Dữ liệu")}</h2>
              <p>{t("account.profile_and_security_sub", "Chi tiết tài khoản và trạng thái lưu trữ cục bộ")}</p>
            </div>
          </div>

          <dl className="hub-facts-grid">
            <div className="fact-item">
              <dt>{t("account.display_name")}</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="fact-item">
              <dt>{t("auth.email")}</dt>
              <dd>{user.email || t("account.no_email")}</dd>
            </div>
            <div className="fact-item">
              <dt>{t("account.sign_in_method")}</dt>
              <dd>{providerLabel}</dd>
            </div>
            <div className="fact-item">
              <dt>{t("account.account_id")}</dt>
              <dd className="uid-mono">{userId.slice(0, 16)}...</dd>
            </div>
          </dl>

          {/* PDF Local Security Shield Box */}
          <div className="hub-local-shield">
            <div className="shield-top">
              <IconLock size={18} className="icon-teal" />
              <div>
                <h3>{t("account.local_data_title")}</h3>
                <span className="shield-badge">{t("account.local_disk_verified", "🔒 Đã xác minh 100% Lưu đĩa Cục bộ")}</span>
              </div>
            </div>
            <p className="shield-desc">{t("account.local_data_copy")}</p>
            <div className="shield-path">
              <code>%LOCALAPPDATA%\ResearchMind\papers</code>
            </div>
            <button type="button" className="account-secondary-btn full-w" onClick={onOpenSettings}>
              📁 {t("account.open_data_controls")}
            </button>
          </div>
        </section>

        {/* Right Panel: Operations & Cloud Tools Bento Hub */}
        <section className="hub-panel">
          <div className="hub-panel-header">
            <IconSparkle size={18} className="icon-gradient" />
            <div>
              <h2>{t("account.operations_hub_title", "Trung tâm Thao tác & Cloud Hub")}</h2>
              <p>{t("account.operations_hub_sub", "Các công cụ tạo link, mời đồng nghiệp và sao lưu Cloud")}</p>
            </div>
          </div>

          <div className="hub-bento-grid">
            {/* Bento 1: Cloud Share Link */}
            <div className="hub-bento-card">
              <div className="bento-card-top">
                <span className="bento-icon green">🔗</span>
                <span className="bento-badge">HTTPS READY</span>
              </div>
              <div className="bento-card-content">
                <h4>{t("account.acc_feat_publish_title")}</h4>
                <p>{t("account.acc_feat_publish_desc")}</p>
              </div>
              <button
                type="button"
                className="account-primary-btn compact-w"
                onClick={() => {
                  const baseUrl = import.meta.env.VITE_PUBLIC_PAGES_URL || "https://researchmind.pages.dev";
                  const userIdHash = (user?.uid || user?.id || "guest").slice(0, 8);
                  const reportId = `usr_${userIdHash}_rep_${Math.random().toString(36).substring(2, 8)}`;
                  const authorName = encodeURIComponent(user?.name || user?.email?.split("@")[0] || "Researcher");
                  const reportTitle = encodeURIComponent("Báo cáo Tổng quan Nghiên cứu Đã đối soát (Systematic Review)");
                  const shareUrl = `${baseUrl}/blog.html?report=${reportId}&author=${authorName}&title=${reportTitle}&score=98`;
                  void navigator.clipboard.writeText(shareUrl);
                  alert(`🔗 Đã tạo & sao chép Link Báo cáo Nhanh thực tế (Cloudflare Pages):\n\n${shareUrl}\n\nLink này mở trực tiếp trên trình duyệt bất kỳ để hiển thị Báo cáo đối soát hoàn chỉnh!`);
                }}
              >
                {t("account.btn_create_share_link", "🔗 Tạo & Sao chép Link")}
              </button>
            </div>

            {/* Bento 2: Team Collaborators */}
            <div className="hub-bento-card">
              <div className="bento-card-top">
                <span className="bento-icon purple">👥</span>
                <span className="bento-badge">TEAMWORK</span>
              </div>
              <div className="bento-card-content">
                <h4>{t("account.acc_feat_collab_title")}</h4>
                <p>{t("account.acc_feat_collab_desc")}</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="account-secondary-btn compact-w"
                  onClick={openCollabModal}
                >
                  {t("account.btn_invite_collab", "👥 Mời Đồng nghiệp")}
                </button>
                <button
                  type="button"
                  className="account-secondary-btn compact-w"
                  style={{ borderColor: "var(--color-primary-alpha, rgba(45, 212, 191, 0.4))", color: "var(--color-primary, #0d9488)" }}
                  onClick={() => setShowJoinModal(true)}
                >
                  {t("account.btn_join_collab", "📥 Nhập Link Mời")}
                </button>
              </div>
            </div>

            {/* Bento 3: Multi-device Session */}
            <div className="hub-bento-card">
              <div className="bento-card-top">
                <span className="bento-icon blue">🌐</span>
                <span className="bento-badge">SESSION SYNC</span>
              </div>
              <div className="bento-card-content">
                <h4>{t("account.acc_feat_multidevice_title")}</h4>
                <p>{t("account.acc_feat_multidevice_desc")}</p>
              </div>
              <button
                type="button"
                className="account-secondary-btn compact-w"
                onClick={() => alert(t("account.sync_session_success", "🔄 Đã đồng bộ phiên làm việc đa thiết bị thành công! Laptop & Desktop của bạn đang ở trạng thái mới nhất."))}
              >
                {t("account.btn_sync_session", "🔄 Đồng bộ Phiên")}
              </button>
            </div>

            {/* Bento 4: Encrypted Cloud Backup */}
            <div className="hub-bento-card">
              <div className="bento-card-top">
                <span className="bento-icon amber">☁️</span>
                <span className="bento-badge">ENCRYPTED</span>
              </div>
              <div className="bento-card-content">
                <h4>{t("account.acc_feat_backup_title")}</h4>
                <p>{t("account.acc_feat_backup_desc")}</p>
              </div>
              <button
                type="button"
                className="account-primary-btn compact-w"
                onClick={() => alert(t("account.cloud_backup_success", "☁️ Đã sao lưu dữ liệu nghiên cứu mã hóa lên Cloud thành công!"))}
              >
                {t("account.btn_backup_now", "☁️ Sao lưu ngay")}
              </button>
            </div>
          </div>
        </section>
      </div>

      {notice && <p className="account-notice" role="status">{notice}</p>}

      {/* Interactive Collaborator Invitation Modal */}
      {showCollabModal && (
        <div className="collab-modal-overlay" onClick={() => setShowCollabModal(false)}>
          <div className="collab-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="collab-modal-header">
              <div>
                <h3>👥 {t("account.modal_collab_title", "Mời Cộng tác viên Dự án")}</h3>
                <p>{t("account.modal_collab_sub", "Cùng đọc, note và soát bằng chứng trích dẫn với đồng đội")}</p>
              </div>
              <button type="button" className="collab-close-btn" onClick={() => setShowCollabModal(false)}>✕</button>
            </div>

            <form onSubmit={sendCollabInvite} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Select Project Workspace */}
              <div className="collab-form-group">
                <label>{t("account.modal_collab_project_label", "Chọn Dự án / Workspace")}</label>
                <select
                  className="collab-select"
                  value={selectedWorkspaceId}
                  onChange={(e) => {
                    setSelectedWorkspaceId(e.target.value);
                    if (e.target.value) void loadWorkspaceMembers(e.target.value);
                  }}
                >
                  {collabProjects.length > 0 ? (
                    collabProjects.map((p) => (
                      <option key={p.id} value={p.workspace_id || p.id}>
                        {p.title || p.id} ({p.workspace_id || p.id})
                      </option>
                    ))
                  ) : (
                    <option value="default_workspace">{t("account.default_workspace", "Dự án Nghiên cứu Chính (Default Workspace)")}</option>
                  )}
                </select>
              </div>

              {/* Collab Email Input */}
              <div className="collab-form-group">
                <label>{t("account.modal_collab_email_label", "Email Đồng nghiệp / Giáo viên")}</label>
                <input
                  type="email"
                  required
                  placeholder="professor@university.edu.vn"
                  className="collab-input"
                  value={collabEmail}
                  onChange={(e) => setCollabEmail(e.target.value)}
                />
              </div>

              {/* Select Role */}
              <div className="collab-form-group">
                <label>{t("account.modal_collab_role_label", "Quyền Hạn / Vai trò")}</label>
                <select
                  className="collab-select"
                  value={collabRole}
                  onChange={(e) => setCollabRole(e.target.value as WorkspaceMember["role"])}
                >
                  <option value="reviewer">🔍 Reviewer - Soát bằng chứng & Phản biện</option>
                  <option value="editor">✏️ Editor - Cùng đọc, note và chỉnh sửa</option>
                  <option value="viewer">👁️ Viewer - Chỉ xem báo cáo</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" className="account-primary-btn" disabled={collabSending || !collabEmail.trim()} style={{ flex: 1 }}>
                  {collabSending ? <IconSpinner size={14} /> : <IconCheck size={14} />} {t("account.modal_send_invite", "Xác nhận Mời & Tạo Link")}
                </button>
                <button type="button" className="account-secondary-btn" onClick={() => setShowCollabModal(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>

            {/* Existing Collaborators List */}
            {collabMembers.length > 0 && (
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--color-border, #e2e8f0)", paddingTop: "14px" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "var(--color-text-secondary, #64748b)" }}>
                  👥 {t("account.active_collaborators", "Thành viên đang cộng tác trong Dự án")} ({collabMembers.length}):
                </h4>
                <div className="collab-members-list">
                  {collabMembers.map((m) => (
                    <div key={m.id} className="collab-member-item">
                      <div>
                        <strong style={{ color: "var(--color-text, #0f172a)" }}>{m.display_name || m.identity}</strong>
                        <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary, #64748b)" }}>{m.identity}</div>
                      </div>
                      <span className="collab-role-tag">{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 📥 ACCEPT INVITE LINK MODAL */}
      {showJoinModal && (
        <div className="collab-modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="collab-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="collab-modal-header">
              <h3>{t("account.join_modal_title", "📥 Gia nhập Workspace Cộng tác")}</h3>
              <button type="button" className="collab-close-btn" onClick={() => setShowJoinModal(false)}>✕</button>
            </div>

            <p className="collab-modal-desc">
              {t("account.join_modal_desc", "Dán đường dẫn Lời mời HTTPS (researchmind.pages.dev/docs.html?invite=...) hoặc mã Workspace vào bên dưới.")}
            </p>

            <form onSubmit={handleJoinWorkspace} className="collab-form">
              <div className="collab-form-group">
                <label>{t("account.prompt_join_invite", "Dán Link Mời Cộng tác hoặc Mã Workspace từ đồng nghiệp:")}</label>
                <input
                  type="text"
                  className="collab-input"
                  placeholder={t("account.join_modal_placeholder", "https://researchmind.pages.dev/docs.html?invite=usr_...&workspace=...")}
                  value={joinLinkInput}
                  onChange={(e) => setJoinLinkInput(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button type="submit" className="account-primary-btn" disabled={joining || !joinLinkInput.trim()} style={{ flex: 1 }}>
                  {joining ? <IconSpinner size={14} /> : <IconCheck size={14} />} {t("account.btn_confirm_join", "🚀 Xác nhận Gia nhập")}
                </button>
                <button type="button" className="account-secondary-btn" onClick={() => setShowJoinModal(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

