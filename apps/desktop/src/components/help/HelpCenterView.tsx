import React from "react";
import { useTranslation } from "react-i18next";
import {
  getHelpSections,
  HELP_NAV,
  type HelpBlock,
  type HelpSectionId,
} from "./helpContent";
import { IconClose } from "../Icons";
import { useDialogFocus } from "../../hooks/useDialogFocus";

interface HelpCenterViewProps {
  sectionId: HelpSectionId;
  onClose: () => void;
  onNavigate: (id: HelpSectionId) => void;
}

function renderBlock(block: HelpBlock, index: number) {
  switch (block.type) {
    case "p":
      return <p key={index} className="help-block-p">{block.text}</p>;
    case "h3":
      return <h3 key={index} className="help-block-h3">{block.text}</h3>;
    case "ul":
      return (
        <ul key={index} className="help-block-ul">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={index} className="help-block-ol">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "faq":
      return (
        <dl key={index} className="help-faq-list">
          {block.items.map((item, i) => (
            <div key={i} className="help-faq-item">
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      );
    case "shortcuts":
      return (
        <div key={index} className="help-shortcuts-table">
          {block.items.map((item, i) => (
            <div key={i} className="help-shortcut-row">
              <kbd className="help-kbd">{item.keys}</kbd>
              <span>{item.action}</span>
            </div>
          ))}
        </div>
      );
    case "releases":
      return (
        <div key={index} className="help-releases">
          {block.items.map((rel, i) => (
            <div key={i} className="help-release-card">
              <h4 className="help-release-version">{rel.version}</h4>
              <ul>
                {rel.items.map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    case "links":
      return (
        <div key={index} className="help-links">
          {block.items.map((link, i) => (
            <a key={i} href={link.href} className="help-link-btn" target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export const HelpCenterView: React.FC<HelpCenterViewProps> = ({
  sectionId,
  onClose,
  onNavigate,
}) => {
  const { t, i18n } = useTranslation();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  const section = getHelpSections(i18n.resolvedLanguage || i18n.language)[sectionId];
  const groups = HELP_NAV.reduce<string[]>((acc, item) => {
    const g = item.group ?? t("help.other");
    if (!acc.includes(g)) acc.push(g);
    return acc;
  }, []);

  return (
    <div className="help-center-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="help-center-panel aw-fade-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
        tabIndex={-1}
      >
        <aside className="help-center-nav">
          <div className="help-center-nav-header">
            <span className="help-center-nav-brand">{t("help.center")}</span>
          </div>
          <nav className="help-center-nav-list">
            {groups.map((group) => (
              <div key={group} className="help-nav-group">
                  <div className="help-nav-group-label">{t(group)}</div>
                {HELP_NAV.filter((n) => (n.group ?? t("help.other")) === group).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`help-nav-item${sectionId === item.id ? " active" : ""}`}
                    onClick={() => onNavigate(item.id)}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="help-center-main">
          <header className="help-center-header">
            <div>
              <h2 id="help-center-title" className="help-center-title">{section.title}</h2>
              <p className="help-center-subtitle">{section.subtitle}</p>
            </div>
            <button type="button" className="help-center-close" onClick={onClose} aria-label={t("common.close")}>
              <IconClose size={18} />
            </button>
          </header>
          <article className="help-center-content">
            {section.blocks.map((block, i) => renderBlock(block, i))}
          </article>
        </div>
      </div>
    </div>
  );
};
