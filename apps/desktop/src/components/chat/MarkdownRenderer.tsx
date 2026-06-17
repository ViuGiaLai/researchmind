import React from "react";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Segment {
  type: "text" | "bold" | "italic" | "code" | "citation";
  text: string;
  page?: string | null;
}

function parseInline(text: string): (string | Segment)[] {
  const parts: (string | Segment)[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // citations first: [Source] or [Source, trang X]
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
    if (nextMarker === 0) continue;
    if (nextMarker === -1) {
      parts.push({ type: "text", text: remaining });
      break;
    }
    parts.push({ type: "text", text: remaining.slice(0, nextMarker) });
    remaining = remaining.slice(nextMarker);
  }

  return parts;
}

function renderSegment(seg: string | Segment, i: number): React.ReactNode {
  if (typeof seg === "string") {
    return escapeHtml(seg);
  }
  switch (seg.type) {
    case "bold":
      return React.createElement("strong", { key: i }, escapeHtml(seg.text));
    case "italic":
      return React.createElement("em", { key: i }, escapeHtml(seg.text));
    case "code":
      return React.createElement(
        "code",
        {
          key: i,
          style: {
            background: "rgba(99, 102, 241, 0.1)",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: "0.85em",
            fontFamily: "monospace",
          },
        },
        escapeHtml(seg.text)
      );
    case "citation":
      return React.createElement(
        "span",
        {
          key: i,
          style: {
            color: "var(--color-primary, #6366f1)",
            fontWeight: 500,
            fontSize: "0.85em",
          },
          title: seg.page ? `Trang ${seg.page}` : seg.text,
        },
        `[${escapeHtml(seg.text)}${seg.page ? `, tr.${seg.page}` : ""}]`
      );
    default:
      return escapeHtml(seg.text);
  }
}

function renderLine(line: string, i: number): React.ReactNode {
  // code block fences
  if (line.startsWith("```")) {
    return null; // handled by code block renderer
  }

  // heading # ## ###
  const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const inner = parseInline(headingMatch[2]).map((s, j) =>
      renderSegment(s, j)
    );
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return React.createElement(
      Tag,
      {
        key: i,
        style: {
          margin: "12px 0 6px",
          fontSize: level === 1 ? "1.2em" : level === 2 ? "1.1em" : "1em",
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
      renderSegment(s, j)
    );
    return React.createElement("li", { key: i }, ...inner);
  }

  // ordered list
  const olMatch = line.match(/^(\d+)\.\s+(.+)/);
  if (olMatch) {
    const inner = parseInline(olMatch[2]).map((s, j) =>
      renderSegment(s, j)
    );
    return React.createElement("li", { key: i, value: parseInt(olMatch[1]) }, ...inner);
  }

  // table row | col1 | col2 |
  if (line.startsWith("|") && line.endsWith("|")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    // skip separator rows (|---|)
    if (cells.length > 0 && !cells.every((c) => /^-+$/.test(c))) {
      return React.createElement(
        "div",
        {
          key: i,
          style: {
            display: "flex",
            gap: 12,
            padding: "4px 0",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          },
        },
        ...cells.map((c, j) =>
          React.createElement(
            "span",
            {
              key: j,
              style: { flex: 1, minWidth: 80, fontSize: "0.9em" },
            },
            escapeHtml(c)
          )
        )
      );
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
    const inner = parseInline(line).map((s, j) => renderSegment(s, j));
    return React.createElement("p", { key: i, style: { margin: "4px 0" } }, ...inner);
  }

  return React.createElement("br", { key: i });
}

interface MarkdownRendererProps {
  text: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  const lines = text.split("\n");
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

    const rendered = renderLine(line, i);
    if (rendered !== null) {
      elements.push(rendered);
    }
  }

  // close unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
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

  for (const el of elements) {
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

  return React.createElement(React.Fragment, null, ...wrapped);
};
