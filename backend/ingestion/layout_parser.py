"""
Layout-aware PDF text reordering for multi-column documents.

Algorithm adapted from RAGFlow deepdoc (Apache 2.0):
https://github.com/infiniflow/ragflow/blob/main/deepdoc/parser/pdf_parser.py

Key ideas:
- K-Means on text block x0 positions to detect columns
- Indentation tolerance (12% page width): blocks near left margin treated as same column
- Silhouette score + k penalty to prefer simpler layouts
- Final sort: left-to-right by column, top-to-bottom within column
"""

import fitz
import numpy as np
from loguru import logger


def _assign_columns(
    x0: np.ndarray,
    x1: np.ndarray | None = None,
    page_width: float = 1.0,
    min_blocks_per_column: int = 2,
    max_k: int = 4,
    indent_tol_ratio: float = 0.12,
    silhouette_threshold: float = 0.18,  # Lowered from 0.3 to better tolerate layout noise in academic papers
) -> tuple[int, np.ndarray]:
    """
    Assign column IDs to text blocks on a single page using K-Means.

    Adapted from RAGFlow `_assign_column`:
    https://github.com/infiniflow/ragflow/blob/main/deepdoc/parser/pdf_parser.py#L804

    Args:
        x0: x0 positions (normalized 0..1 or raw coordinates).
        x1: optional x1 positions (for width detection).
        page_width: page width (for min_x0/max_x1 computation).
        min_blocks_per_column: minimum blocks to form a column.
        max_k: maximum columns to try.
        indent_tol_ratio: blocks within this fraction of min_x0 are clamped.
        silhouette_threshold: below this, fall back to single column.

    Returns:
        (n_columns, labels) where labels[i] = column index (0-indexed, left->right).
    """
    n = len(x0)
    if n < min_blocks_per_column * 2:
        return 1, np.zeros(n, dtype=int)

    # Indentation tolerance: clamp blocks near left margin
    min_x0 = float(np.min(x0))
    width = float(np.max(x1 if x1 is not None else x0) - min_x0)
    indent_tol = max(width * indent_tol_ratio, 0.01)

    x0s = np.array([[min_x0] if abs(x - min_x0) < indent_tol else [x] for x in x0], dtype=float)

    # Filter out wide blocks (spanning blocks) for clustering.
    # Spanning blocks like titles or full-width tables start at the left margin but span both columns.
    # Including them in clustering distorts KMeans centers and degrades Silhouette Score.
    is_narrow = np.ones(n, dtype=bool)
    if x1 is not None:
        is_narrow = (x1 - x0) <= 0.6 * page_width

    narrow_indices = np.where(is_narrow)[0]
    # Fallback to all blocks if too few narrow blocks are found
    if len(narrow_indices) < min_blocks_per_column * 2:
        narrow_indices = np.arange(n)

    x0s_narrow = x0s[narrow_indices]
    max_try = min(max_k, len(narrow_indices))
    best_k = 1
    best_score = -1.0
    best_labels_narrow = np.zeros(len(narrow_indices), dtype=int)

    for k in range(1, max_try + 1):
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score

        km = KMeans(n_clusters=k, random_state=0, n_init="auto")
        labels = km.fit_predict(x0s_narrow)

        unique, counts = np.unique(labels, return_counts=True)
        if np.any(counts < min_blocks_per_column):
            continue

        if k > 1:
            try:
                score = silhouette_score(x0s_narrow, labels)
            except ValueError:
                score = -1
        else:
            score = 0

        # Penalize higher k (prefer 2-column for academic papers)
        adjusted = score * (1.0 - 0.1 * (k - 2)) if k >= 2 else score

        if adjusted > best_score:
            best_score = adjusted
            best_k = k
            best_labels_narrow = labels

    if best_score < silhouette_threshold:
        best_k = 1
        return 1, np.zeros(n, dtype=int)

    # Remap column indices left-to-right by mean x0
    if best_k > 1:
        from sklearn.cluster import KMeans

        km = KMeans(n_clusters=best_k, random_state=0, n_init="auto")
        km.fit(x0s_narrow)

        # Predict column labels for all blocks (including wide ones)
        all_labels = km.predict(x0s)

        means = np.array([x0[narrow_indices][best_labels_narrow == i].mean() for i in range(best_k)])
        order = np.argsort(means)
        remap = {old: new for new, old in enumerate(order)}
        best_labels = np.array([remap[int(label)] for label in all_labels])
        return best_k, best_labels
    else:
        return 1, np.zeros(n, dtype=int)


def reorder_page_text(page: "fitz.Page") -> str:
    """
    Reorder text on a PDF page using multi-column layout detection.

    Falls back to page.get_text('text') for single-column pages.
    """

    blocks = page.get_text("blocks")
    if not blocks:
        return page.get_text("text")

    text_blocks: list[dict] = []
    for b in blocks:
        blk_type = b[4] if isinstance(b[4], int) else (b[6] if len(b) > 6 else 0)
        if isinstance(blk_type, int) and blk_type != 0:
            continue
        x0, y0, x1, y1 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
        text = str(b[4] if isinstance(b[4], str) else b[5] if len(b) > 5 else "").strip()
        if not text:
            continue
        text_blocks.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": text})

    if len(text_blocks) < 6:
        return page.get_text("text")

    page_width = page.rect.width
    x0_np = np.array([b["x0"] for b in text_blocks], dtype=float)
    x1_np = np.array([b["x1"] for b in text_blocks], dtype=float)

    if page_width > 0:
        k, labels = _assign_columns(x0_np / page_width, x1_np / page_width, 1.0)
    else:
        k, labels = _assign_columns(x0_np, x1_np, page_width)

    if k == 1:
        return page.get_text("text")

    # Sort: column (left->right), then y0 (top->bottom)
    for i, b in enumerate(text_blocks):
        b["col"] = int(labels[i])
    text_blocks.sort(key=lambda b: (b["col"], b["y0"]))

    result = "\n".join(b["text"] for b in text_blocks)
    logger.debug(f"Reordered page with {k} columns ({len(text_blocks)} blocks)")
    return result


def detect_layout_stats(page: "fitz.Page") -> dict:
    """Return layout diagnostics: detected columns, text block count, etc."""

    blocks = page.get_text("blocks")
    text_blocks = []
    for b in blocks:
        blk_type = b[4] if isinstance(b[4], int) else (b[6] if len(b) > 6 else 0)
        if isinstance(blk_type, int) and blk_type != 0:
            continue
        text = str(b[4] if isinstance(b[4], str) else b[5] if len(b) > 5 else "").strip()
        if text and len(text) >= 3:
            text_blocks.append(b)

    if len(text_blocks) < 6:
        return {"columns": 1, "blocks": len(blocks), "text_blocks": len(text_blocks), "multicolumn": False}

    x0 = np.array([b[0] for b in text_blocks], dtype=float)
    x1 = np.array([b[2] for b in text_blocks], dtype=float)
    page_width = page.rect.width
    if page_width > 0:
        k, _ = _assign_columns(x0 / page_width, x1 / page_width, 1.0)
    else:
        k, _ = _assign_columns(x0, x1, page_width)

    return {
        "columns": int(k),
        "blocks": len(blocks),
        "text_blocks": len(text_blocks),
        "multicolumn": k > 1,
    }
