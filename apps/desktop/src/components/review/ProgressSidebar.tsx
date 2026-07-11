import { useTranslation } from "react-i18next";
import { IconCheck, IconSpinner } from "../Icons";

interface OutlineSection {
  key: string;
  title: string;
  description: string;
}

interface ProgressSidebarProps {
  sections: OutlineSection[];
  sectionStatus: Record<string, "pending" | "generating" | "done" | "empty">;
  activeSection?: string;
  onSectionClick: (key: string) => void;
  onClose?: () => void;
}

const statusIcons: Record<string, { icon: any; color: string }> = {
  done: { icon: IconCheck, color: "#22c55e" },
  generating: { icon: IconSpinner, color: "var(--color-primary)" },
  pending: { icon: null, color: "var(--color-text-muted)" },
  empty: { icon: null, color: "var(--color-text-muted)" },
};

export function ProgressSidebar({
  sections,
  sectionStatus,
  activeSection,
  onSectionClick,
  onClose,
}: ProgressSidebarProps) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderLeft: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
        padding: "16px",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: "0.72rem", fontWeight: 600,
          color: "var(--color-text-muted)",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          Outline
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: 2, borderRadius: 3,
              border: "none", background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer", fontSize: "0.7rem",
              lineHeight: 1,
            }}
            title={t("review_builder.collapse")}
          >▸</button>
        )}
      </div>
      {sections.map((sec) => {
        const status = sectionStatus[sec.key] || "pending";
        const st = statusIcons[status];
        const isActive = sec.key === activeSection;
        const isDone = status === "done";
        return (
          <div
            key={sec.key}
            onClick={() => onSectionClick(sec.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: isActive ? "rgba(var(--color-primary-rgb), 0.08)" : "transparent",
              transition: "all 0.15s",
              opacity: isDone ? 1 : 0.65,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = "rgba(148, 163, 184, 0.05)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            {st.icon ? (
              <st.icon size={14} style={{ color: st.color, flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid var(--color-border, rgba(148, 163, 184, 0.25))",
                flexShrink: 0,
              }} />
            )}
            <span style={{
              fontSize: "0.78rem",
              fontWeight: isDone || isActive ? 600 : 400,
              color: "var(--color-text, #e2e8f0)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {sec.title.replace(/^\d+\.\s*/, "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
