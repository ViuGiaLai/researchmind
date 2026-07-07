import React, { useEffect, useRef, useState } from "react";
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

const MENU_ITEMS: HelpMenuItem[] = [
  { id: "center", label: "Trung tâm trợ giúp", icon: IconHelp, section: "home" },
  { id: "docs", label: "Tài liệu", icon: IconBookOpen, section: "user-guide" },
  { id: "start", label: "Bắt đầu", icon: IconRocket, section: "getting-started" },
  { id: "shortcuts", label: "Phím tắt", icon: IconKeyboard, section: "shortcuts" },
  { id: "whats-new", label: "Có gì mới", icon: IconSparkle, section: "release-notes" },
  { id: "bug", label: "Báo lỗi", icon: IconBug, external: BUG_REPORT_URL },
  { id: "contact", label: "Liên hệ hỗ trợ", icon: IconMail, external: `mailto:${CONTACT_EMAIL}` },
  { id: "about", label: "Về ResearchMind", icon: IconInfo, section: "about" },
];

interface HelpMenuProps {
  onOpenSection: (id: HelpSectionId) => void;
  onStartTour: () => void;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ onOpenSection, onStartTour }) => {
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
        title="Trợ giúp"
        data-tooltip="Trợ giúp"
      >
        <IconHelp size={18} />
      </button>

      {menuOpen && (
        <div className="app-help-dropdown rm-dropdown-menu" role="menu">
          <div className="app-help-dropdown-header">Trợ giúp</div>
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
            role="menuitem"
            onClick={() => handleItem({ id: "tour", label: "Tour giới thiệu", icon: IconRocket, action: "tour" })}
          >
            <IconRocket size={16} />
            <span>Tour giới thiệu</span>
          </button>
        </div>
      )}
    </div>
  );
};
