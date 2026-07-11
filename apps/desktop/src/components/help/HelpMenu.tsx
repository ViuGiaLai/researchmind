import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-shell";
import {
  IconHelp,
  IconBookOpen,
  IconRocket,
  IconKeyboard,
  IconSparkle,
  IconBug,
  IconMail,
  IconInfo,
} from "../Icons";
import { BUG_REPORT_URL, CONTACT_EMAIL, type HelpSectionId } from "./helpContent";

export interface HelpMenuItem {
  id: string;
  label: string;
  icon: React.FC<{ size?: number }>;
  section?: HelpSectionId;
  external?: string;
  action?: "tour";
}

const getMenuItems = (t: (key: string) => string): HelpMenuItem[] => [
  { id: "center", label: t("help.center"), icon: IconHelp, section: "home" },
  { id: "docs", label: t("help.docs"), icon: IconBookOpen, section: "user-guide" },
  { id: "start", label: t("help.getting_started"), icon: IconRocket, section: "getting-started" },
  { id: "shortcuts", label: t("help.shortcuts"), icon: IconKeyboard, section: "shortcuts" },
  { id: "whats-new", label: t("help.whats_new"), icon: IconSparkle, section: "release-notes" },
  { id: "bug", label: t("help.report_bug"), icon: IconBug, external: BUG_REPORT_URL },
  { id: "contact", label: t("help.contact"), icon: IconMail, external: `mailto:${CONTACT_EMAIL}` },
  { id: "about", label: t("help.about"), icon: IconInfo, section: "about" },
];

interface HelpMenuProps {
  onOpenSection: (id: HelpSectionId) => void;
  onStartTour: () => void;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ onOpenSection, onStartTour }) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const MENU_ITEMS = getMenuItems(t);

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

  const handleItem = async (item: HelpMenuItem) => {
    setMenuOpen(false);
    if (item.action === "tour") {
      onStartTour();
      return;
    }
    if (item.external) {
      try {
        await open(item.external);
      } catch (err) {
        console.error("Failed to open link:", err);
      }
      return;
    }
    if (item.section) onOpenSection(item.section);
  };

  return (
    <div className="app-help-menu" ref={rootRef}>
      <button
        type="button"
        id="app-help-btn"
        className="app-help-btn"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={t("help.menu_title")}
        data-tooltip={t("help.menu_title")}
      >
        <IconHelp size={18} />
      </button>

      {menuOpen && (
        <div className="app-help-dropdown rm-dropdown-menu" role="menu">
          <div className="app-help-dropdown-header">{t("help.menu_title")}</div>
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="app-help-dropdown-item rm-dropdown-item"
                role="menuitem"
                onClick={() => handleItem(item)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="app-help-dropdown-divider" />
          <button
            type="button"
            className="app-help-dropdown-item rm-dropdown-item"
            role="menuitem"          onClick={() => handleItem({ id: "tour", label: t("help.tour"), icon: IconRocket, action: "tour" })}
        >
            <IconRocket size={16} />
            <span>{t("help.tour")}</span>
          </button>
        </div>
      )}
    </div>
  );
};
