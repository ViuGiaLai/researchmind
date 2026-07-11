import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { marked } from "marked";
import TurndownService from "turndown";
import { IconRefresh, IconSpinner, IconFileText, IconBookOpen } from "../Icons";

const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});


function htmlToMd(html: string): string {
  let md = turndownService.turndown(html);
  md = md.replace(/\\(\[|\])/g, "$1");
  return md;
}

interface Citation {
  paper_id: string;
  paper_title: string;
  citation_text: string;
}

interface ReviewSectionEditorProps {
  section: string;
  title: string;
  content: string;
  loading?: boolean;
  evidenceCount?: number;
  paperCount?: number;
  citations?: Citation[];
  onRegenerate: (section: string) => void;
  onChange: (section: string, content: string) => void;
  onClose?: () => void;
  onCitationClick?: (paperId: string, paperTitle: string, page?: number) => void;
}

function EditorToolbar({ editor, t }: { editor: any; t: (key: string, options?: Record<string, unknown>) => string }) {
  if (!editor) return null;
  const btnStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    padding: "4px 8px",
    borderRadius: 4,
    border: active ? "1px solid var(--color-primary)" : "1px solid transparent",
    background: active ? "rgba(var(--color-primary-rgb), 0.12)" : "transparent",
    color: disabled ? "var(--color-border, rgba(148,163,184,0.3))" : active ? "var(--color-primary)" : "var(--color-text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.72rem",
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s",
    lineHeight: 1,
  });
  return (
    <div style={{
      display: "flex", gap: 2, padding: "6px 8px",
      borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
      flexWrap: "wrap", alignItems: "center",
      background: "rgba(0,0,0,0.02)",
    }}>
      <button
        style={btnStyle(false, !editor.can().undo())}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t("review_editor.undo")}
      >↩ Undo</button>
      <button
        style={btnStyle(false, !editor.can().redo())}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t("review_editor.redo")}
      >↪ Redo</button>
      <div style={{ width: 1, height: 16, background: "var(--color-border, rgba(148,163,184,0.2))", margin: "0 4px" }} />
      <button
        style={btnStyle(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("review_editor.bold")}
      ><strong>B</strong></button>
      <button
        style={btnStyle(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("review_editor.italic")}
      ><em>I</em></button>
      <div style={{ width: 1, height: 16, background: "var(--color-border, rgba(148,163,184,0.2))", margin: "0 4px" }} />
      <button
        style={btnStyle(editor.isActive("heading", { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title={t("review_editor.heading1")}
      >H1</button>
      <button
        style={btnStyle(editor.isActive("heading", { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t("review_editor.heading2")}
      >H2</button>
      <button
        style={btnStyle(editor.isActive("heading", { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title={t("review_editor.heading3")}
      >H3</button>
      <div style={{ width: 1, height: 16, background: "var(--color-border, rgba(148,163,184,0.2))", margin: "0 4px" }} />
      <button
        style={btnStyle(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t("review_editor.bullet_list")}
      >• List</button>
      <button
        style={btnStyle(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t("review_editor.ordered_list")}
      >1. List</button>
      <div style={{ width: 1, height: 16, background: "var(--color-border, rgba(148,163,184,0.2))", margin: "0 4px" }} />
      <button
        style={btnStyle(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title={t("review_editor.blockquote")}
      >"</button>
      <button
        style={btnStyle(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title={t("review_editor.code_block")}
      >{"</>"}</button>
    </div>
  );
}

function renderContentWithCitations(
  text: string,
  citations?: Citation[],
  onCitationClick?: (paperId: string, paperTitle: string, page?: number) => void
) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const parts = line.split(/(\[[^\]]+\])/g);
    const children = parts.map((part, pi) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const num = parseInt(m[1], 10);
        const citation = citations?.[num - 1];
        if (!citation) return <>{part}</>;
        return (
          <span
            key={pi}
            className="review-editor-citation"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick?.(citation.paper_id, citation.paper_title);
            }}
            style={{ cursor: "pointer" }}
            title={citation.paper_title}
          >
            [{num}]
          </span>
        );
      }
      const long = part.match(/^\[([a-f0-9\-]+)_([^\]]*?)(?:,\s*trang\s*(\d+))?\]$/i);
      if (long) {
        const paperId = long[1];
        const page = long[3] ? parseInt(long[3], 10) : undefined;
        const citation = citations?.find((c) => c.paper_id === paperId);
        const label = citation?.paper_title || paperId;
        return (
          <span
            key={pi}
            className="review-editor-citation"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick?.(paperId, label, page);
            }}
            style={{ cursor: "pointer" }}
            title={page ? `${label} ${page}` : label}
          >
            {page ? `[${page}]` : `[${label.slice(0, 20)}...]`}
          </span>
        );
      }
      return <>{part}</>;
    });
    return (
      <span key={li} style={{ display: "block" }}>
        {children}
      </span>
    );
  });
}

export function ReviewSectionEditor({
  section,
  title,
  content,
  loading,
  evidenceCount,
  paperCount,
  citations,
  onRegenerate,
  onChange,
  onClose,
  onCitationClick,
}: ReviewSectionEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: t("review_editor.content_placeholder") }),
    ],
    content: "",
    editable: false,
    editorProps: {
      attributes: {
        style: [
          "padding: 8px 12px",
          "min-height: 120px",
          "outline: none",
          "font-size: 0.82rem",
          "line-height: 1.7",
          "color: var(--color-text, #e2e8f0)",
        ].join(";"),
      },
    },
  });

  const startEditing = useCallback(async () => {
    if (editor) {
      if (content) {
        const html = await marked.parse(content);
        editor.commands.setContent(html);
      } else {
        editor.commands.setContent("");
      }
      editor.setEditable(true);
      setIsEditing(true);
      editor.commands.focus();
    }
  }, [content, editor]);

  const handleSave = useCallback(() => {
    if (editor) {
      const html = editor.getHTML();
      const md = htmlToMd(html);
      editorRef.current = md;
      onChange(section, md);
    }
    setIsEditing(false);
    editor?.setEditable(false);
    if (onClose) onClose();
  }, [editor, onChange, section, onClose]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    editor?.setEditable(false);
    if (onClose) onClose();
  }, [editor, onClose]);

  const handleRegenerate = useCallback(() => {
    onRegenerate(section);
    if (isEditing) {
      setIsEditing(false);
      editor?.setEditable(false);
    }
  }, [onRegenerate, section, isEditing, editor]);

  return (
    <div
      style={{
        border: isEditing
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
        borderRadius: 8,
        marginBottom: 12,
        background: "var(--color-surface, rgba(255, 255, 255, 0.02))",
        transition: "border-color 0.2s",
      }}
    >
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--color-text-muted);
          pointer-events: none;
          height: 0;
          opacity: 0.5;
        }
        .ProseMirror h1 { font-size: 1.3rem; font-weight: 700; margin: 0.5em 0 0.3em; }
        .ProseMirror h2 { font-size: 1.1rem; font-weight: 600; margin: 0.4em 0 0.2em; }
        .ProseMirror h3 { font-size: 0.95rem; font-weight: 600; margin: 0.3em 0 0.2em; }
        .ProseMirror p { margin: 0.3em 0; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.5em; margin: 0.3em 0; }
        .ProseMirror li { margin: 0.15em 0; }
        .ProseMirror blockquote {
          border-left: 3px solid var(--color-primary);
          margin: 0.5em 0;
          padding: 0.3em 1em;
          color: var(--color-text-muted);
          font-style: italic;
        }
        .ProseMirror code {
          background: rgba(var(--color-primary-rgb), 0.1);
          border-radius: 3px;
          padding: 1px 4px;
          font-size: 0.8em;
        }
        .ProseMirror pre {
          background: rgba(0,0,0,0.2);
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
        }
        .review-editor-citation {
          display: inline-flex;
          align-items: center;
          padding: 1px 6px;
          border-radius: 3px;
          background: rgba(var(--color-primary-rgb), 0.1);
          color: var(--color-primary);
          font-size: 0.75em;
          font-weight: 600;
          margin: 0 1px;
          border: 1px solid rgba(var(--color-primary-rgb), 0.2);
        }
        .review-editor-citation:hover {
          background: rgba(var(--color-primary-rgb), 0.18);
        }
      `}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          minWidth: 0,
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {evidenceCount !== undefined && evidenceCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 3,
              padding: "2px 6px", borderRadius: 4,
              background: "rgba(var(--color-primary-rgb), 0.08)",
              color: "var(--color-primary)",
              fontSize: "0.68rem", fontWeight: 500,
            }}>
              <IconFileText size={10} />
              {evidenceCount} chunks
              {paperCount ? ` · ${paperCount} papers` : ""}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                style={{
                  padding: "4px 10px", borderRadius: 4,
                  border: "1px solid var(--color-primary)",
                  background: "var(--color-primary)", color: "#fff",
                  cursor: "pointer", fontSize: "0.75rem", fontWeight: 500,
                }}                >
                {t("review_editor.save")}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: "4px 10px", borderRadius: 4,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "transparent", color: "var(--color-text-muted)",
                  cursor: "pointer", fontSize: "0.75rem",
                }}                >
                {t("review_editor.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEditing}
                disabled={loading}
                style={{
                  padding: "4px 10px", borderRadius: 4,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "transparent", color: "var(--color-text-muted)",
                  cursor: "pointer", fontSize: "0.75rem",
                  opacity: loading ? 0.5 : 1,
                }}                >
                {t("review_editor.edit")}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={loading}
                style={{
                  padding: "4px 10px", borderRadius: 4,
                  border: "1px solid var(--color-primary)",
                  background: "rgba(var(--color-primary-rgb), 0.08)",
                  color: "var(--color-primary)",
                  cursor: "pointer", fontSize: "0.75rem", fontWeight: 500,
                  opacity: loading ? 0.5 : 1,
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {loading ? (
                  <IconSpinner size={12} />
                ) : (
                  <IconRefresh size={12} />
                )}
                {loading ? t("review_editor.generating") : t("review_editor.regenerate")}
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <div>
          <EditorToolbar editor={editor} t={t} />
          <EditorContent editor={editor} />
        </div>
      ) : loading ? (
        <div style={{
          padding: "20px 0", textAlign: "center",
          color: "var(--color-text-muted)", fontSize: "0.85rem",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <IconSpinner size={14} />
          <span>{t("review_editor.generating_content")}</span>
        </div>
      ) : content ? (
        <div style={{ padding: "10px 14px" }}>
          <div
            style={{
              fontSize: "0.82rem", lineHeight: 1.7,
              color: "var(--color-text, #e2e8f0)",
            }}
          >
            {renderContentWithCitations(content, citations, onCitationClick)}
          </div>
        </div>
      ) : (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          {t("review_editor.hint_generate")}
        </div>
      )}

      {/* Citations Footer */}
      {citations && citations.length > 0 && !isEditing && (
        <div style={{
          marginTop: 0, padding: "10px 14px",
          borderTop: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
        }}>
          <div style={{
            fontSize: "0.7rem", fontWeight: 600,
            color: "var(--color-text-muted)",
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <IconBookOpen size={11} />
            Sources
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {citations.map((c, i) => (
              <div
                key={i}
                onClick={() => onCitationClick?.(c.paper_id, c.paper_title)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 4,
                  background: "rgba(var(--color-primary-rgb), 0.06)",
                  fontSize: "0.72rem", color: "var(--color-primary)",
                  cursor: onCitationClick ? "pointer" : "default",
                }}
                title={t("review_builder.open_doc")}
              >
                <span style={{ fontWeight: 700 }}>[{i + 1}]</span>
                {c.paper_title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
