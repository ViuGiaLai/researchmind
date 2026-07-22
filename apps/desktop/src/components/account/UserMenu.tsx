import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth-provider";
import {
  IconUser,
  IconSettings,
  IconChevronDown,
} from "../Icons";
import { LogOut, LogIn } from "lucide-react";

export interface UserMenuProps {
  sidebarCollapsed: boolean;
  activeTab: string;
  onNavigate: (tab: string, section?: string) => void;
  onRequestSignIn: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  sidebarCollapsed,
  activeTab,
  onNavigate,
  onRequestSignIn,
}) => {
  const { t } = useTranslation();
  const auth = useAuth();
  const user = auth.user;
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleNavigate = (tab: string, section?: string) => {
    setMenuOpen(false);
    onNavigate(tab, section);
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    auth.signOut();
  };

  const handleSignIn = () => {
    setMenuOpen(false);
    onRequestSignIn();
  };

  return (
    <div className="sidebar-account-wrapper" ref={rootRef} style={{ position: "relative" }}>
      {!sidebarCollapsed ? (
        <button
          className={`sidebar-account-entry ${activeTab === "account" || activeTab === "settings" || menuOpen ? "active" : ""}`}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="sidebar-account-avatar" aria-hidden="true">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              (user?.name || user?.email || "R").slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="sidebar-account-copy">
            <strong>{user?.name || (user ? t("account.default_name") : t("auth.optional_sign_in"))}</strong>
            <small>{user?.email || t("auth.optional_sign_in_hint")}</small>
          </span>
          <IconChevronDown size={14} style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginLeft: "auto" }} />
        </button>
      ) : (
        <button
          className={`sidebar-account-collapsed ${activeTab === "account" || activeTab === "settings" || menuOpen ? "active" : ""}`}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title={user?.name || t("account.eyebrow")}
          aria-label={t("account.eyebrow")}
        >
          <span className="sidebar-account-avatar" aria-hidden="true">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
            ) : user ? (
              (user.name || user.email || "R").slice(0, 1).toUpperCase()
            ) : (
              <IconUser size={16} />
            )}
          </span>
        </button>
      )}

      {menuOpen && (
        <div className="sidebar-account-dropdown rm-dropdown-menu" role="menu">
          {/* User Header Profile Card */}
          <div className="account-dropdown-header">
            <div className="account-dropdown-avatar">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                (user?.name || user?.email || "R").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="account-dropdown-info">
              <div className="account-dropdown-name-row">
                <strong>{user?.name || (user ? t("account.default_name") : t("auth.optional_sign_in"))}</strong>
              </div>
              <small>{user?.email || t("auth.optional_sign_in_hint")}</small>
            </div>
          </div>

          <div className="account-dropdown-divider" />

          {/* Account */}
          <button
            type="button"
            className="account-dropdown-item"
            role="menuitem"
            onClick={() => handleNavigate("account")}
          >
            <IconUser size={16} />
            <span className="item-title">{t("account.title", "Tài khoản")}</span>
          </button>

          {/* Settings */}
          <button
            type="button"
            className="account-dropdown-item"
            role="menuitem"
            onClick={() => handleNavigate("settings", "general")}
          >
            <IconSettings size={16} />
            <span className="item-title">{t("nav.settings", "Cài đặt")}</span>
          </button>

          <div className="account-dropdown-divider" />

          {/* Sign Out / Sign In */}
          {user ? (
            <button
              type="button"
              className="account-dropdown-item danger"
              role="menuitem"
              onClick={handleSignOut}
            >
              <LogOut size={16} />
              <span>{t("auth.sign_out", "Đăng xuất")}</span>
            </button>
          ) : (
            <button
              type="button"
              className="account-dropdown-item"
              role="menuitem"
              onClick={handleSignIn}
            >
              <LogIn size={16} />
              <span>{t("auth.sign_in", "Đăng nhập")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
