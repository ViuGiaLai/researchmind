import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { IconBrain } from "../Icons";

interface ThinkingBlockProps {
  text: string;
  isThinking: boolean;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ text, isThinking }) => {
  const [isCollapsed, setIsCollapsed] = useState(!isThinking);

  useEffect(() => {
    setIsCollapsed(!isThinking);
  }, [isThinking]);

  return (
    <div
      className="thinking-block"
      style={{
        borderLeft: "3px solid var(--color-border)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeftColor: "var(--color-text-muted)",
        padding: "10px 14px",
        borderRadius: "var(--radius-sm, 6px)",
        margin: "8px 0",
        fontSize: "0.88em",
        color: "var(--color-text-secondary, #a3a3a3)",
      }}
    >
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          userSelect: "none",
          fontWeight: 500,
          color: "var(--color-text-secondary)",
        }}
      >
        {isCollapsed ? <ChevronRight size={14} style={{ display: "inline" }} /> : <ChevronDown size={14} style={{ display: "inline" }} />}
        <IconBrain size={16} style={{ display: "inline" }} className={isThinking ? "brain-icon-loading" : ""} />
        <span>
          {isThinking ? "AI đang suy nghĩ..." : "Chuỗi suy luận (Thinking Process)"}
        </span>
        {isThinking && (
          <span
            style={{
              fontSize: "0.85em",
              color: "var(--color-text-muted, #737373)",
              fontStyle: "italic",
            }}
          >
            (đang tạo...)
          </span>
        )}
      </div>
      {!isCollapsed && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--color-border)",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.9em",
            color: "var(--color-text-secondary, #a3a3a3)",
            lineHeight: 1.6,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

interface Segment {
  type: "text" | "bold" | "italic" | "code" | "citation" | "ref_citation";
  text: string;
  page?: string | null;
  refId?: number;
}

function parseInline(text: string): (string | Segment)[] {
  const parts: (string | Segment)[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // ref citations first: [N] format (e.g., [1], [2], [3])
    const refCiteMatch = remaining.match(/^\[(\d+)\]/);
    if (refCiteMatch) {
      parts.push({
        type: "ref_citation",
        text: refCiteMatch[1],
        refId: parseInt(refCiteMatch[1], 10),
      });
      remaining = remaining.slice(refCiteMatch[0].length);
      continue;
    }

    // legacy citations: [Source] or [Source, trang X]
    const citeMatch = remaining.match(/^\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]/);
    if (citeMatch) {
      parts.push({
        type: "citation",
        text: citeMatch[1].trim(),
        page: citeMatch[2] || null,
      });
      remaining = remaining.slice(citeMatch[0].length);
      continue;
    }

    // code `...`
    if (remaining.startsWith("`")) {
      const end = remaining.indexOf("`", 1);
      if (end !== -1) {
        parts.push({ type: "code", text: remaining.slice(1, end) });
        remaining = remaining.slice(end + 1);
        continue;
      }
    }

    // bold **...**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push({ type: "bold", text: boldMatch[1] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // italic *...*
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push({ type: "italic", text: italicMatch[1] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // plain text until next marker
    const nextMarker = remaining.search(/[\[*`]/);
    if (nextMarker === 0) {
      parts.push({ type: "text", text: remaining[0] });
      remaining = remaining.slice(1);
      continue;
    }
    if (nextMarker === -1) {
      parts.push({ type: "text", text: remaining });
      break;
    }
    parts.push({ type: "text", text: remaining.slice(0, nextMarker) });
    remaining = remaining.slice(nextMarker);
  }

  return parts;
}

function renderSegment(seg: string | Segment, i: number, onCitationClick?: (refId: number) => void, allCitations?: CitationTooltip[]): React.ReactNode {
  if (typeof seg === "string") {
    return seg;
  }
  switch (seg.type) {
    case "bold":
      return React.createElement("strong", { key: i }, seg.text);
    case "italic":
      return React.createElement("em", { key: i }, seg.text);
    case "code":
      return React.createElement(
        "code",
        {
          key: i,
          style: {
            background: "rgba(var(--color-primary-rgb), 0.1)",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: "0.85em",
            fontFamily: "monospace",
          },
        },
        seg.text
      );
    case "ref_citation":
      const citeData = allCitations?.find(c => c.ref_id === seg.refId);
      const tooltipLines = [
        citeData?.paper_title || `Nguồn ${seg.refId}`,
        citeData?.page ? `Trang ${citeData.page}` : null,
        citeData?.text_snippet ? `"${citeData.text_snippet}"` : null,
        citeData ? "Nhấp để mở PDF" : null,
      ].filter(Boolean).join(" | ");
      return React.createElement(
        "span",
        {
          key: i,
          className: "citation-ref",
          onClick: () => onCitationClick?.(seg.refId!),
          title: tooltipLines || `Nguồn ${seg.refId}`,
          style: {
            color: "var(--color-primary)",
            fontWeight: 600,
            fontSize: "0.78em",
            cursor: "pointer",
            padding: "0 2px",
            position: "relative",
          },
        },
        `[${seg.refId}]`
      );
    case "citation":
      return React.createElement(
        "span",
        {
          key: i,
          style: {
            color: "var(--color-primary)",
            fontWeight: 500,
            fontSize: "0.85em",
          },
          title: seg.page ? `Trang ${seg.page}` : seg.text,
        },
        `[${seg.text}${seg.page ? `, tr.${seg.page}` : ""}]`
      );
    default:
      return seg.text;
  }
}

function renderLine(line: string, i: number, onCitationClick?: (refId: number) => void, allCitations?: CitationTooltip[]): React.ReactNode {
  // code block fences
  if (line.startsWith("```")) {
    return null; // handled by code block renderer
  }

  // heading # ## ###
  const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const inner = parseInline(headingMatch[2]).map((s, j) =>
      renderSegment(s, j, onCitationClick, allCitations)
    );
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return React.createElement(
      Tag,
      {
        key: i,
        style: {
          margin: "0.4em 0 0.25em",
          fontSize: level === 1 ? "1.12em" : level === 2 ? "1.06em" : "1em",
          fontWeight: 600,
        },
      },
      ...inner
    );
  }

  // unordered list
  const ulMatch = line.match(/^[-*]\s+(.+)/);
  if (ulMatch) {
    const inner = parseInline(ulMatch[1]).map((s, j) =>
      renderSegment(s, j, onCitationClick, allCitations)
    );
    return React.createElement("li", { key: i }, ...inner);
  }

  // ordered list
  const olMatch = line.match(/^(\d+)\.\s+(.+)/);
  if (olMatch) {
    const inner = parseInline(olMatch[2]).map((s, j) =>
      renderSegment(s, j, onCitationClick, allCitations)
    );
    return React.createElement("li", { key: i, value: parseInt(olMatch[1]) }, ...inner);
  }

  // table row | col1 | col2 |
  if (line.startsWith("|") && line.endsWith("|")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
    if (cells.length > 0 && !isSeparator) {
      return {
        isTableRow: true,
        cells,
        key: i,
      } as any;
    }
    return null;
  }

  // horizontal rule
  if (/^---+$/.test(line)) {
    return React.createElement("hr", {
      key: i,
      style: { border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "12px 0" },
    });
  }

  // normal paragraph
  if (line.trim()) {
    const inner = parseInline(line).map((s, j) => renderSegment(s, j, onCitationClick, allCitations));
    return React.createElement("p", { key: i, style: { margin: "0.2em 0" } }, ...inner);
  }

  return null;
}

interface CitationTooltip {
  ref_id: number;
  paper_title?: string;
  page?: number | null;
  text_snippet?: string;
}

function decodeHTMLEntities(htmlStr: string): string {
  if (!htmlStr) return "";
  return htmlStr
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;amp;/g, '&');
}

interface MarkdownRendererProps {
  text: string;
  onCitationClick?: (refId: number) => void;
  citations?: CitationTooltip[];
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text, onCitationClick, citations }) => {
  const decodedText = decodeHTMLEntities(text);
  const decodedCitations = citations?.map(c => ({
    ...c,
    paper_title: c.paper_title ? decodeHTMLEntities(c.paper_title) : undefined,
    text_snippet: c.text_snippet ? decodeHTMLEntities(c.text_snippet) : undefined
  }));

  let thinkingContent = "";
  let mainContent = decodedText;
  let isThinkingActive = false;

  const thinkStartIndex = decodedText.indexOf("<think>");
  if (thinkStartIndex !== -1) {
    const thinkEndIndex = decodedText.indexOf("</think>", thinkStartIndex + 7);
    if (thinkEndIndex !== -1) {
      thinkingContent = decodedText.slice(thinkStartIndex + 7, thinkEndIndex).trim();
      mainContent = decodedText.slice(0, thinkStartIndex) + decodedText.slice(thinkEndIndex + 8);
    } else {
      thinkingContent = decodedText.slice(thinkStartIndex + 7).trim();
      mainContent = decodedText.slice(0, thinkStartIndex);
      isThinkingActive = true;
    }
  }

  const lines = mainContent.split("\n");
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          React.createElement(
            "pre",
            {
              key: `code-${codeKey++}`,
              style: {
                background: "rgba(0,0,0,0.2)",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                fontSize: "0.85em",
                fontFamily: "monospace",
                margin: "8px 0",
              },
            },
            React.createElement(
              "code",
              null,
              codeLines.join("\n")
            )
          )
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const rendered = renderLine(line, i, onCitationClick, decodedCitations);
    if (rendered !== null) {
      elements.push(rendered);
    }
  }

  // ─── Batch consecutive table rows into a single <table> ───
  const batched: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let tableKey = 0;

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const separatorIdx = tableRows.findIndex((row) =>
      row.every((c) => /^:?-+:?$/.test(c))
    );
    const headerRows = separatorIdx >= 0 ? tableRows.slice(0, separatorIdx) : [];
    const bodyRows = separatorIdx >= 0 ? tableRows.slice(separatorIdx + 1) : tableRows;
    const colCount = Math.max(...tableRows.map((r) => r.length), 0);
    if (colCount === 0 || bodyRows.length === 0) { tableRows = []; return; }

    const styleCell = (label: string, ci: number, isHeader: boolean) => {
      const parsed = parseInline(label).map((s, j) =>
        renderSegment(s, j, onCitationClick, decodedCitations)
      );
      return React.createElement(isHeader ? "th" : "td", {
        key: ci,
        style: {
          padding: "4px 8px",
          fontSize: "0.9em",
          textAlign: "left",
          fontWeight: isHeader ? 600 : 400,
          color: isHeader ? "var(--color-primary)" : undefined,
          borderBottom: isHeader
            ? "2px solid rgba(var(--color-primary-rgb), 0.3)"
            : "1px solid rgba(255,255,255,0.06)",
          verticalAlign: "top",
        },
      }, ...parsed);
    };

    const renderRow = (row: string[], isHeader: boolean, ri: number) =>
      React.createElement("tr", { key: ri },
        ...row.map((c, ci) => styleCell(c, ci, isHeader))
      );

    const children: React.ReactNode[] = [];
    if (headerRows.length > 0) {
      children.push(React.createElement("thead", { key: "h" },
        ...headerRows.map((r, ri) => renderRow(r, true, ri))
      ));
    }
    children.push(React.createElement("tbody", { key: "b" },
      ...bodyRows.map((r, ri) => renderRow(r, false, ri))
    ));

    batched.push(React.createElement("table", {
      key: `table-${tableKey++}`,
      style: {
        width: "100%",
        borderCollapse: "collapse",
        margin: "8px 0",
      },
    }, ...children));

    tableRows = [];
  };

  for (const el of elements) {
    const tblRow = el as any;
    if (tblRow?.isTableRow) {
      tableRows.push(tblRow.cells as string[]);
    } else {
      flushTable();
      batched.push(el);
    }
  }
  flushTable();

  // close unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    batched.push(
      React.createElement(
        "pre",
        {
          key: `code-${codeKey++}`,
          style: {
            background: "rgba(0,0,0,0.2)",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
            fontSize: "0.85em",
            fontFamily: "monospace",
            margin: "8px 0",
          },
        },
        React.createElement("code", null, codeLines.join("\n"))
      )
    );
  }

  // wrap consecutive <li> in <ul>/<ol>
  const wrapped: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listBuffer.length > 0 && listType) {
      wrapped.push(
        React.createElement(
          listType,
          {
            key: `list-${wrapped.length}`,
            style: { margin: "4px 0", paddingLeft: 20 },
          },
          ...listBuffer
        )
      );
      listBuffer = [];
      listType = null;
    }
  };

  for (const el of batched) {
    if (React.isValidElement(el) && el.type === "li") {
      const newType: "ul" | "ol" = el.props.value !== undefined ? "ol" : "ul";
      if (listType === null) {
        listType = newType;
      }
      listBuffer.push(el);
    } else {
      flushList();
      wrapped.push(el);
    }
  }
  flushList();

  const renderedMain = React.createElement(React.Fragment, null, ...wrapped);
  if (thinkingContent) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(ThinkingBlock, { text: thinkingContent, isThinking: isThinkingActive }),
      renderedMain
    );
  }
  return renderedMain;
};
