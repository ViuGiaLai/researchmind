export function formatDate(
  iso: string,
  locale: string = "en-US",
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...options,
    });
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso: string, locale: string = "en"): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return locale.startsWith("vi") ? "Vừa xong" : "Just now";
    if (minutes < 60)
      return locale.startsWith("vi") ? `${minutes} phút trước` : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
      return locale.startsWith("vi") ? `${hours} giờ trước` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30)
      return locale.startsWith("vi") ? `${days} ngày trước` : `${days}d ago`;
    return formatDate(iso, locale);
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function generateId(prefix: string = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export function generateWorkspaceId(): string {
  return generateId("ws");
}

export function generateReportId(): string {
  return generateId("rpt");
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function reportPublicUrl(baseUrl: string, reportId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r/${reportId}`;
}
