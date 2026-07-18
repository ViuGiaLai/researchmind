import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Paper } from "../../lib/api";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { IconChat, IconFileText, IconFolder, IconLibrary, IconSearch, IconSettings } from "../Icons";

export type CommandTarget = "projects" | "library" | "chat" | "review" | "evidence" | "settings";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (target: CommandTarget) => void;
  onOpenPaper: (paperId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onNavigate, onOpenPaper }) => {
  const { t } = useTranslation();
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  const commands = useMemo(() => [
    { target: "projects" as const, label: t("nav.projects"), Icon: IconFolder },
    { target: "library" as const, label: t("nav.library"), Icon: IconLibrary },
    { target: "chat" as const, label: t("nav.chat"), Icon: IconChat },
    { target: "review" as const, label: t("nav.review"), Icon: IconFileText },
    { target: "evidence" as const, label: t("nav.evidence"), Icon: IconSearch },
    { target: "settings" as const, label: t("nav.settings"), Icon: IconSettings },
  ].filter((command) => !query || command.label.toLowerCase().includes(query.toLowerCase())), [query, t]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPapers([]);
      return;
    }
    if (query.trim().length < 2) {
      setPapers([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void api.listPapers(1, 8, undefined, undefined, undefined, { q: query.trim() })
        .then((result) => setPapers(result.papers))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  return (
    <div className="command-overlay" onMouseDown={onClose}>
      <div ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label={t("command.title")} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-input">
          <IconSearch size={16} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("command.placeholder")} />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          <section>
            <span className="command-section-label">{t("command.navigate")}</span>
            {commands.map(({ target, label, Icon }) => (
              <button type="button" key={target} onClick={() => { onNavigate(target); onClose(); }}><Icon size={15} /><span>{label}</span></button>
            ))}
          </section>
          {(loading || papers.length > 0) && (
            <section>
              <span className="command-section-label">{t("command.papers")}</span>
              {loading ? <div className="command-loading">{t("common.loading")}</div> : papers.map((paper) => (
                <button type="button" key={paper.id} onClick={() => { onOpenPaper(paper.id); onClose(); }}>
                  <IconFileText size={15} />
                  <span><strong>{paper.title || paper.filename}</strong><small>{paper.year || t("command.unknown_year")}</small></span>
                  <em>{t("command.ask")}</em>
                </button>
              ))}
            </section>
          )}
        </div>
        <footer><span><kbd>Ctrl</kbd><kbd>K</kbd> {t("command.hint")}</span></footer>
      </div>
    </div>
  );
};
