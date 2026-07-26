export function pluralize(n: number, one: string, many?: string) {
  return n === 1 ? one : many || `${one}s`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}
