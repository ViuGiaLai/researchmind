#!/usr/bin/env node
/**
 * CSS Hardcoded Color Audit Script
 * 
 * Scans all CSS files in apps/desktop/src/styles/ and reports
 * hex color values that should be replaced with CSS variables.
 * 
 * Usage:
 *   node scripts/audit-css-colors.js
 *   node scripts/audit-css-colors.js --json       (JSON output)
 *   node scripts/audit-css-colors.js --fixable     (only fixable ones, excluding intentional colors)
 */

const fs = require("fs");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────

const STYLES_DIR = path.resolve(__dirname, "..", "apps/desktop/src/styles");
const EXCLUDE_DIRS = [];  // no exclusions, scan everything

// Hex patterns that are explicitly EXCLUDED from being flagged
const EXCLUDED_HEX = new Set([
  "#fff", "#ffffff", "#000", "#000000", "#fff!important",
]);

// CSS variable definitions in variables.css that ARE intentional
const INTENTIONAL_DEFS = ["variables.css"];

// Known CSS variables that should be used instead of hardcoded colors
const KNOWN_VARIABLES = {
  // Semantic colors
  "#f87171": "--color-error (dark)", "#dc2626": "--color-error (light)",
  "#ef4444": "--color-error",
  "#4ade80": "--color-success (dark)", "#16a34a": "--color-success (light)",
  "#22c55e": "--color-success",
  "#fbbf24": "--color-warning (dark)", "#ca8a04": "--color-warning (light)",
  "#f59e0b": "--color-warning",
  "#2dd4bf": "--color-primary (dark)", "#0d9488": "--color-primary (light)",
  "#14b8a6": "--color-primary",
  "#6366f1": "--color-primary (was indigo)",
  "#5eead4": "--color-primary-hover (dark)", "#0f766e": "--color-primary-hover (light)",
  "#ecf3f4": "--color-text (dark)", "#1a2e2e": "--color-text (light)",
  "#a8b4b8": "--color-text-secondary (dark)", "#4a6363": "--color-text-secondary (light)",
  "#7a8a90": "--color-text-muted (dark)", "#7a9292": "--color-text-muted (light)",
  "#94a3b8": "--color-text-muted",
  "#64748b": "--color-text-muted",
  "#8e8e93": "--color-text-muted (light fallback)",
  "#52525b": "--color-text-secondary (light fallback)",
  "#09090b": "--color-text (light fallback)",
  "#e2e8f0": "--color-text (fallback)",
  "#1e293b": "--color-surface (fallback)",
  "#111618": "--color-bg (dark)", "#f2f6f6": "--color-bg (light)",
  "#1a2124": "--color-surface (dark)", "#ffffff": "--color-surface (light)",
  "#232b2f": "--color-surface-hover (dark)", "#f0f5f5": "--color-surface-hover (light)",
  "#2f3a3e": "--color-border (dark)", "#d8e4e4": "--color-border (light)",
  "#252e32": "--color-border-subtle (dark)", "#e6eeee": "--color-border-subtle (light)",
  "#3d4a50": "--color-border-strong (dark)", "#b8cbcb": "--color-border-strong (light)",
  "#042f2e": "--color-on-primary (dark)",
  "#eaf3f3": "--color-highlight (dark)", "#f0f4ff": "--color-highlight (light)",
  "#e8f0f0": "--color-inset (light)", "#0e1315": "--color-inset (dark)",
  "#151b1e": "--color-bg-subtle (dark)", "#f8fafa": "--color-bg-subtle (light)",
  // Brand accent colors (intentional in some contexts)
  "#a78bfa": "badge-s2 brand accent",
  "#34d399": "badge-cr brand accent",
  "#fbbf24": "badge-year brand accent",
  "#eab308": "warning/star brand accent",
  "#d97706": "warning dark fallback",
  "#fca5a5": "error light tint",
  "#d5aa2f": "annotation yellow",
  "#4d9b66": "annotation green",
  "#4f91bf": "annotation blue",
  "#bd6589": "annotation pink",
  "#e8c968": "highlight yellow",
  "#75b88a": "highlight green",
  "#70a8cf": "highlight blue",
  "#cf8eaa": "highlight pink",
};

// Colors that appear only in variable definitions (intentional)
function isVariableDefinition(line) {
  return /^\s*--[\w-]+:\s*#/.test(line);
}

function isInsideVarFunction(line, hexStr) {
  // Check if hex is inside var(..., #XXXX) — these are fallbacks
  const varPattern = new RegExp(`var\\([^)]*${escapeRegex(hexStr)}[^)]*\\)`);
  return varPattern.test(line);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExcludedColor(hex) {
  const lower = hex.toLowerCase();
  if (EXCLUDED_HEX.has(lower)) return true;
  // Exclude standard white/black variants
  if (lower === "#fff" || lower === "#ffffff" || lower === "#000" || lower === "#000000") return true;
  return false;
}

function isInsideCSSFunction(line, hexStr) {
  // Check if hex is inside color-mix, gradient, etc.
  const funcs = ["color-mix", "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient"];
  for (const fn of funcs) {
    if (line.includes(fn) && line.includes(hexStr)) return true;
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results = [];
  const relativePath = path.relative(STYLES_DIR, filePath);

  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("//")) continue;

    // Skip variable definitions (--var-name: #XXXX)
    if (isVariableDefinition(line)) continue;

    // Find all hex colors in this line
    const matches = [];
    let match;
    while ((match = hexRegex.exec(line)) !== null) {
      matches.push(match[0]);
    }

    // For each hex found, check if it's in a var() fallback
    const uniqueMatches = [...new Set(matches)];
    for (const hex of uniqueMatches) {
      if (isExcludedColor(hex)) continue;
      if (isInsideVarFunction(line, hex)) continue;
      if (isInsideCSSFunction(line, hex)) continue;

      results.push({
        line: lineNum,
        hex: hex,
        context: line.trim().substring(0, 120),
        suggestion: KNOWN_VARIABLES[hex.toLowerCase()] || KNOWN_VARIABLES[hex] || "--color-?",
      });
    }
  }

  return { file: relativePath, issues: results };
}

function main() {
  const args = process.argv.slice(2);
  const formatJson = args.includes("--json");
  const fixableOnly = args.includes("--fixable");

  if (!fs.existsSync(STYLES_DIR)) {
    console.error(`❌ Styles directory not found: ${STYLES_DIR}`);
    process.exit(1);
  }

  const cssFiles = fs.readdirSync(STYLES_DIR).filter(f => f.endsWith(".css"));
  let allIssues = [];
  let totalFiles = 0;
  let cleanFiles = 0;

  for (const file of cssFiles) {
    const filePath = path.join(STYLES_DIR, file);
    if (!fs.statSync(filePath).isFile()) continue;

    // Skip variables.css — it DEFINES the variables
    if (file === "variables.css") continue;

    // Skip utilities.css — intentionally clean
    if (file === "utilities.css") continue;

    totalFiles++;
    const { issues } = scanFile(filePath);

    if (issues.length === 0) {
      cleanFiles++;
      if (!formatJson) {
        console.log(`  ✅ ${file} — clean`);
      }
    } else {
      // Filter fixable-only if requested
      const filtered = fixableOnly
        ? issues.filter(i => i.suggestion.startsWith("--") && !i.suggestion.includes("was") && !i.suggestion.includes("brand") && !i.suggestion.includes("annotation") && !i.suggestion.includes("highlight"))
        : issues;

      if (filtered.length > 0) {
        allIssues.push({ file, issues: filtered });
      } else if (!formatJson) {
        console.log(`  ✅ ${file} — all remaining colors are intentional`);
      }
    }
  }

  if (formatJson) {
    console.log(JSON.stringify({ scanned: totalFiles, clean: cleanFiles, files: allIssues }, null, 2));
    return;
  }

  // Pretty output
  console.log(`\n📊 CSS Color Audit Report\n`);
  console.log(`Scanned: ${totalFiles} files · Clean: ${cleanFiles} files · Issues: ${allIssues.reduce((s, f) => s + f.issues.length, 0)}\n`);

  for (const { file, issues } of allIssues) {
    console.log(`  ⚠️  ${file} — ${issues.length} issue(s)`);
    for (const issue of issues) {
      const suggestion = issue.suggestion;
      console.log(`      L${issue.line.toString().padEnd(4)} ${issue.hex.padEnd(10)} → ${suggestion.padEnd(40)} ${issue.context.substring(0, 60)}`);
    }
    console.log();
  }

  if (allIssues.length === 0) {
    console.log("  🎉 No issues found! All hardcoded colors have been fixed.\n");
  } else {
    const total = allIssues.reduce((s, f) => s + f.issues.length, 0);
    console.log(`  💡 Run with --fixable to see only colors with known variable mappings.\n`);
    console.log(`  💡 ${total} hardcoded colors remaining across ${allIssues.length} files.\n`);
  }

  console.log("─── Legend ───");
  console.log("  ✅ = No issues found");
  console.log("  ⚠️  = Hardcoded hex color found");
  console.log("  → = Suggested CSS variable replacement");
  console.log("  (light fallback) = Color used in light mode var() fallback, safe to keep");
  console.log();
}

main();
