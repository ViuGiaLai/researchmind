/**
 * Safe paper title/author display helpers.
 * Mirrors backend ingestion/metadata_quality.py for already-loaded data
 * and as a belt-and-suspenders guard when API payloads are stale.
 */

const UUID_PREFIX_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[_\s-]+)?/i;
const UUID_ONLY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JUNK_TITLE_RE =
  /\b(logo|watermark|copyright|all\s+rights\s+reserved|h[ìi]nh\s*\d+|figure\s*\d+|fig\.?\s*\d+|untitled|microsoft\s+word|adobe\s+acrobat|t[ốo]i\s+gi[ảa]n|hi[ệe]n\s+[đd][ạa]i|v[àa]ng\s+[đd]en)\b/i;
const DEVICE_AUTHOR_RE =
  /^(unknown(?:\s*[:\-].*)?|anonymous|n\/?a|none|null|user|admin|acer|asus|dell|hp|lenovo|canon|epson|brother|windows\s*user|mac\s*user|author)$/i;

function stripUuidPrefix(value: string): string {
  const cleaned = value.replace(UUID_PREFIX_RE, "").trim().replace(/^[_-\s]+/, "");
  return cleaned || value.trim();
}

function humanizeFilename(filename?: string | null): string {
  if (!filename) return "";
  const base = filename.split(/[/\\]/).pop() || filename;
  let stem = stripUuidPrefix(base);
  stem = stem.replace(/\.[^.]+$/, "");
  stem = stripUuidPrefix(stem);
  return stem.replace(/[_\-+]+/g, " ").replace(/\s+/g, " ").trim();
}

function isUuidLike(value: string): boolean {
  const t = value.trim();
  return UUID_ONLY_RE.test(t) || /^[0-9a-f]{16,}$/i.test(t);
}

function isPoorTitle(value?: string | null): boolean {
  if (!value) return true;
  const text = value.trim();
  if (!text || text.length < 4) return true;
  if (isUuidLike(text)) return true;
  if (JUNK_TITLE_RE.test(text)) return true;
  const alpha = [...text].filter((c) => /\p{L}/u.test(c)).length;
  if (alpha / Math.max(text.length, 1) < 0.35) return true;
  return false;
}

/** Prefer clean title; fall back to humanized filename; never show raw UUID. */
export function paperDisplayTitle(
  title?: string | null,
  filename?: string | null,
  fallback = "Untitled document",
): string {
  if (title && !isPoorTitle(title)) {
    const cleaned = stripUuidPrefix(title);
    if (cleaned && !isPoorTitle(cleaned)) return cleaned;
  }
  if (title) {
    const stripped = stripUuidPrefix(title);
    if (stripped && !isPoorTitle(stripped) && !isUuidLike(stripped)) return stripped;
  }
  const fromFile = humanizeFilename(filename);
  if (fromFile && !isUuidLike(fromFile) && !isPoorTitle(fromFile)) return fromFile;
  if (fromFile && !isUuidLike(fromFile)) return fromFile;
  return fallback;
}

/** Parse authors JSON or comma list; drop scanner/device placeholders. */
export function paperDisplayAuthors(authors?: string | null): string[] {
  if (!authors || authors === "[]") return [];
  let parts: string[] = [];
  try {
    const parsed = JSON.parse(authors);
    if (Array.isArray(parsed)) parts = parsed.map(String);
  } catch {
    parts = authors
      .replace(/[\[\]"']/g, "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return parts.filter((a) => a && !DEVICE_AUTHOR_RE.test(a.trim()) && !a.includes("@"));
}

/**
 * Merge common OCR syllable splits in Vietnamese display text
 * (e.g. "thiế t bị" → "thiết bị", "ngườ i" → "người").
 */
export function repairVietnameseDisplayText(text: string): string {
  if (!text) return text;
  // Tone-marked Vietnamese letters (precomposed). Keep outside character-class
  // ranges so engines don't reject ambiguous Unicode ranges under the `u` flag.
  const tone =
    "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ";
  const boundary = "(?=\\s|[.,;:!?()\\[\\]\"']|$)";
  const splitRe = new RegExp(
    `([A-Za-zĐđ]*[${tone}])\\s+([a-zđ]{1,2})${boundary}`,
    "gu",
  );
  const finalRe = new RegExp(
    `([A-Za-zĐđ]*[${tone}])\\s+([ptcngmyiuđ]{1,2})${boundary}`,
    "giu",
  );
  const trailRe = new RegExp(
    `([A-Za-zĐđ]{2,8})\\s+([${tone}][a-zđ]?)${boundary}`,
    "gu",
  );

  let result = text;
  for (let i = 0; i < 4; i++) {
    const prev = result;
    result = result.replace(splitRe, "$1$2").replace(finalRe, "$1$2").replace(trailRe, "$1$2");
    result = result.replace(/[^\S\n]{2,}/g, " ");
    if (result === prev) break;
  }
  return result;
}
