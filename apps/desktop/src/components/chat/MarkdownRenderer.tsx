import React from "react";

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

function renderSegment(seg: string | Segment, i: number): React.ReactNode {
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
            background: "rgba(99, 102, 241, 0.1)",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: "0.85em",
            fontFamily: "monospace",
          },
        },
        seg.text
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
        `[${seg.text}${seg.page ? `, tr.${seg.page}` : ""}]`
      );
    default:
      return seg.text;
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
          margin: "8px 0 4px",
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
    const inner = parseInline(line).map((s, j) => renderSegment(s, j));
    return React.createElement("p", { key: i, style: { margin: "4px 0" } }, ...inner);
  }

  return null;
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
        renderSegment(s, j)
      );
      return React.createElement(isHeader ? "th" : "td", {
        key: ci,
        style: {
          padding: "4px 8px",
          fontSize: "0.9em",
          textAlign: "left",
          fontWeight: isHeader ? 600 : 400,
          color: isHeader ? "var(--color-primary, #6366f1)" : undefined,
          borderBottom: isHeader
            ? "2px solid rgba(99, 102, 241, 0.3)"
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

  return React.createElement(React.Fragment, null, ...wrapped);
};
