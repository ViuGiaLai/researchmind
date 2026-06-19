import { useEffect, useState } from "react";
import { IconRefresh, IconSpinner } from "../Icons";

interface ReviewSectionEditorProps {
  section: string;
  title: string;
  content: string;
  loading?: boolean;
  onRegenerate: (section: string) => void;
  onChange: (section: string, content: string) => void;
}

export function ReviewSectionEditor({
  section,
  title,
  content,
  loading,
  onRegenerate,
  onChange,
}: ReviewSectionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  useEffect(() => {
    if (!editing) {
      setEditContent(content);
    }
  }, [content, editing]);

  const handleSave = () => {
    onChange(section, editContent);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditContent(content);
    setEditing(false);
  };

  const handleEdit = () => {
    setEditContent(content);
    setEditing(true);
  };

  return (
    <div
      style={{
        border: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
        borderRadius: 8,
        marginBottom: 12,
        background: "var(--color-surface, rgba(255, 255, 255, 0.02))",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {editing ? (
            <>
              <button
                onClick={handleSave}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-primary, #6366f1)",
                  background: "var(--color-primary, #6366f1)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                Lưu
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "transparent",
                  color: "var(--color-text-muted, #94a3b8)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                Huỷ
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleEdit}
                disabled={loading}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "transparent",
                  color: "var(--color-text-muted, #94a3b8)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  opacity: loading ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                >
                  Sửa
                </button>
              <button
                onClick={() => onRegenerate(section)}
                disabled={loading}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-primary, #6366f1)",
                  background: "rgba(99, 102, 241, 0.08)",
                  color: "var(--color-primary, #6366f1)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  opacity: loading ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {loading ? (
                  <IconSpinner size={12} />
                ) : (
                  <IconRefresh size={12} />
                )}
                {loading ? "Đang tạo..." : "Tạo lại"}
              </button>
            </>
          )}
        </div>
      </div>
      <div style={{ padding: "10px 14px" }}>
        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: 120,
              padding: 8,
              borderRadius: 4,
              border: "1px solid var(--color-border, rgba(148, 163, 184, 0.2))",
              background: "var(--color-bg, rgba(0,0,0,0.05))",
              color: "var(--color-text, #e2e8f0)",
              fontSize: "0.82rem",
              lineHeight: 1.6,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        ) : loading ? (
          <div
            style={{
              padding: "20px 0",
              textAlign: "center",
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <IconSpinner size={14} />
            <span>Đang tạo nội dung...</span>
          </div>
        ) : content ? (
          <div
            style={{
              fontSize: "0.82rem",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              color: "var(--color-text, #e2e8f0)",
            }}
          >
            {content}
          </div>
        ) : (
          <div
            style={{
              padding: "20px 0",
              textAlign: "center",
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: "0.85rem",
            }}
          >
            Nhấn "Tạo lại" để tạo nội dung cho phần này
          </div>
        )}
      </div>
    </div>
  );
}
