"""
Test script: Generate an HTML report from sample markdown with code blocks and tables.
Uses the same _md_to_html() logic as the synthesis export endpoint.
"""

import re
import sys
import subprocess
from datetime import datetime


# ─── Exact copy of the _md_to_html function from export.py ──────
def md_to_html(md_text: str) -> str:
    """Convert Markdown to HTML with code blocks, tables, lists, headings, etc."""
    lines = md_text.split("\n")
    i = 0
    n = len(lines)
    html_parts = []

    def _escape(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    def _inline(text: str) -> str:
        """Convert inline markdown (bold, italic, code) to HTML."""
        escaped = _escape(text)
        escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
        escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        escaped = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", escaped)
        return escaped

    def _render_html_table(rows: list[list[str]]) -> str:
        if len(rows) < 2:
            return ""
        header = rows[0]
        data_rows = rows[2:] if len(rows) > 2 else []
        thead = "<thead><tr>" + "".join(f"<th>{_inline(h)}</th>" for h in header) + "</tr></thead>"
        tbody = "<tbody>"
        for row in data_rows:
            tbody += "<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in row) + "</tr>"
        tbody += "</tbody>"
        return f"<table>{thead}{tbody}</table>"

    while i < n:
        stripped = lines[i].strip()

        if stripped.startswith("```"):
            lang = _escape(stripped[3:].strip())
            code_lines = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            code_content = "\n".join(code_lines)
            lang_attr = f' class="language-{lang}"' if lang else ''
            html_parts.append(f"<pre><code{lang_attr}>{_escape(code_content)}</code></pre>")
            continue

        if stripped.startswith("|") and "|" in stripped[1:]:
            table_rows = []
            while i < n and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().split("|")]
                cells = [c for c in cells if c]
                table_rows.append(cells)
                i += 1
            html_parts.append(_render_html_table(table_rows))
            continue

        if not stripped:
            i += 1
            continue

        if stripped.startswith("# "):
            html_parts.append(f"<h1>{_inline(stripped[2:])}</h1>")
            i += 1
            continue

        if stripped.startswith("## "):
            html_parts.append(f"<h2>{_inline(stripped[3:])}</h2>")
            i += 1
            continue

        if stripped.startswith("### "):
            html_parts.append(f"<h3>{_inline(stripped[4:])}</h3>")
            i += 1
            continue

        if stripped.startswith("---"):
            html_parts.append("<hr>")
            i += 1
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            items = []
            while i < n and (lines[i].strip().startswith("- ") or lines[i].strip().startswith("* ")):
                item_text = lines[i].strip()[2:]
                items.append(f"<li>{_inline(item_text)}</li>")
                i += 1
            html_parts.append("<ul>" + "".join(items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < n and re.match(r"^\d+\.\s+", lines[i].strip()):
                match = re.match(r"^\d+\.\s+(.+)$", lines[i].strip())
                if match:
                    items.append(f"<li>{_inline(match.group(1))}</li>")
                i += 1
            html_parts.append("<ol>" + "".join(items) + "</ol>")
            continue

        if stripped.startswith("> ") or stripped == ">":
            quote_lines = []
            while i < n:
                s = lines[i].strip()
                if s.startswith("> "):
                    quote_lines.append(s[2:])
                elif s == ">":
                    quote_lines.append("")
                else:
                    break
                i += 1
            quote_html = "<br>".join(_inline(l) if l else "" for l in quote_lines)
            html_parts.append(f"<blockquote>{quote_html}</blockquote>")
            continue

        para_lines = []
        while i < n and lines[i].strip() and not lines[i].strip().startswith("#") \
                and not lines[i].strip().startswith("```") \
                and not lines[i].strip().startswith("|") \
                and not lines[i].strip().startswith("---") \
                and not lines[i].strip().startswith("> ") \
                and not lines[i].strip().startswith("- ") \
                and not lines[i].strip().startswith("* ") \
                and not re.match(r"^\d+\.\s+", lines[i].strip()):
            para_lines.append(_inline(lines[i].strip()))
            i += 1
        if para_lines:
            html_parts.append("<p>" + "<br>".join(para_lines) + "</p>")

    return "\n".join(html_parts)


# ─── Generate full HTML page ───────────────────────────────────
def generate_html(title: str, content: str, output_path: str):
    html_body = md_to_html(content)
    safe_title = _escape(title.replace("_", " "))

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{safe_title} — ResearchMind VN</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            color: #1e293b;
            background: #f8fafc;
        }}
        .container {{
            background: #ffffff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid #e2e8f0;
        }}
        h1 {{ border-bottom: 2px solid #8b5cf6; padding-bottom: 12px; color: #0f172a; margin-top: 0; }}
        h2 {{ color: #1e293b; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }}
        h3 {{ color: #334155; margin-top: 24px; }}
        p {{ margin-bottom: 1.25em; }}
        ul, ol {{ padding-left: 20px; margin-bottom: 1.25em; }}
        li {{ margin-bottom: 0.5em; }}
        code {{
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
            font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        }}
        pre {{
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px 20px;
            overflow-x: auto;
            margin: 0 0 1.25em 0;
        }}
        pre code {{
            background: none;
            padding: 0;
            border-radius: 0;
            font-size: 0.82em;
            line-height: 1.5;
            display: block;
            white-space: pre;
        }}
        blockquote {{
            border-left: 4px solid #8b5cf6;
            background: #f8fafc;
            margin: 0 0 1.25em 0;
            padding: 12px 20px;
            color: #475569;
            font-style: italic;
        }}
        hr {{
            border: none;
            border-top: 1px solid #e2e8f0;
            margin: 32px 0;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 0 0 1.25em 0;
            font-size: 0.9em;
        }}
        table thead {{ background: #6366f1; color: #ffffff; }}
        table th {{ padding: 10px 12px; text-align: center; font-weight: 600; }}
        table td {{
            padding: 8px 12px;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }}
        table tbody tr:nth-child(even) {{ background: #f8fafc; }}
        table tbody tr:hover {{ background: #f1f5f9; }}
        .footer {{
            margin-top: 60px;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            font-size: 0.85em;
            color: #64748b;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{safe_title}</h1>
        {html_body}
        <div class="footer">
            Generated by ResearchMind VN on {datetime.now().strftime('%Y-%m-%d %H:%M')}
        </div>
    </div>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_doc)
    return output_path


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ─── Test with rich sample markdown ────────────────────────────
if __name__ == "__main__":
    sample_markdown = """# Synthesis Report
*Model: gemini-2.0-flash*

## Overview
This is a **sample synthesis report** testing the enhanced *HTML export* with code blocks, tables, and inline `code snippets`.

### Key Findings
- Research shows significant improvement in **model performance**
- The proposed method achieves **94.2% accuracy** on benchmark datasets
- Multi-dataset evaluation with comprehensive metrics

> This finding strongly supports the main hypothesis and aligns with prior work in the field of **deep learning**.

---

## Code Implementation

The main training loop is implemented as follows:

```python
import torch
import torch.nn as nn

class ResearchModel(nn.Module):
    def __init__(self, vocab_size, hidden_dim=768):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, hidden_dim)
        self.transformer = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(hidden_dim, nhead=12),
            num_layers=6
        )

    def forward(self, x):
        return self.transformer(self.embed(x))
```

To run training:

```bash
python train.py --epochs 10 --batch-size 32 --lr 2e-5
```

Use the `--resume` flag to continue from a checkpoint.

---

## Experimental Results

### Benchmark Comparison
| Model | Accuracy | F1 Score | Precision | Recall |
|-------|----------|----------|-----------|--------|
| Ours | **94.2%** | **0.937** | **0.945** | **0.931** |
| Baseline A | 89.1% | 0.882 | 0.891 | 0.874 |
| Baseline B | 91.5% | 0.908 | 0.914 | 0.902 |
| SOTA 2024 | 93.8% | 0.931 | 0.938 | 0.925 |

Our method outperforms all baselines across every metric.

### Ablation Study
| Component | Accuracy | Delta |
|-----------|----------|-------|
| Full model | 94.2% | — |
| w/o attention | 88.3% | -5.9% |
| w/o pretraining | 90.1% | -4.1% |

> "The attention mechanism contributes most significantly." — Reviewer

---

## Conclusion
This work presents a novel approach with these contributions:

1. **Novel architecture** combining transformers + retrieval
2. **SOTA results** with 94.2% accuracy
3. **Open-source** code release

Future work:
* Scaling to larger sizes
* Multi-modal extension

---

*This test document validates **code blocks**, `inline code`, tables, and horizontal rules in HTML export.*
"""

    output_path = "test_synthesis_report.html"
    try:
        result = generate_html("Enhanced_Synthesis_Report_Test", sample_markdown, output_path)
        size = __import__('os').path.getsize(output_path)
        print(f"\n✅ HTML generated successfully: {output_path}")
        print(f"   File size: {size} bytes ({size/1024:.1f} KB)")
        print(f"   Location: {__import__('os').path.abspath(output_path)}")
        print("\n📖 Open in browser to view the formatted result.")
    except Exception as e:
        print(f"\n❌ HTML generation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
