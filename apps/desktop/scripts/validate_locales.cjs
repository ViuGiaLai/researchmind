#!/usr/bin/env node
/**
 * validate_locales.js
 *
 * Validates JSON syntax for all locale files (en, vi, ja).
 * Run: node scripts/validate_locales.js
 * Or:  pnpm validate:locales
 */

const fs = require('fs');
const path = require('path');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const FILES = [
  { lang: 'en', file: 'src/locales/en/common.json' },
  { lang: 'vi', file: 'src/locales/vi/common.json' },
  { lang: 'ja', file: 'src/locales/ja/common.json' },
];

/**
 * Get context lines around a specific position in text.
 */
function getErrorContext(text, pos, linesBefore = 2, linesAfter = 2) {
  const lines = text.slice(0, pos).split('\n');
  const errorLine = lines.length; // 1-based line number
  const errorCol = lines[lines.length - 1].length + 1;
  const allLines = text.split('\n');
  const start = Math.max(0, errorLine - 1 - linesBefore);
  const end = Math.min(allLines.length, errorLine + linesAfter);

  let context = '';
  for (let i = start; i < end; i++) {
    const lineNum = String(i + 1).padStart(4, ' ');
    const marker = i === errorLine - 1 ? '>' : ' ';
    context += `  ${marker} ${lineNum} | ${allLines[i]}\n`;
    if (i === errorLine - 1) {
      context += `  ${' '.repeat(6)} ${' '.repeat(errorCol - 1)}${colors.red}^${colors.reset}\n`;
    }
  }
  return { line: errorLine, column: errorCol, context };
}

/**
 * Count total keys in a parsed JSON object (recursive, top-level only).
 */
function countTopLevelKeys(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}

/**
 * Validate a single JSON file. Returns { valid, report }.
 */
function validateFile(lang, relativePath) {
  const fullPath = path.join(__dirname, '..', relativePath);
  const displayPath = relativePath.replace(/\\/g, '/');

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(content);

    // Basic stats
    const bytes = Buffer.byteLength(content, 'utf8');
    const lines = content.split('\n').length;
    const topLevelKeys = countTopLevelKeys(parsed);
    const namespaces = Object.keys(parsed);

    return {
      valid: true,
      lang,
      displayPath,
      bytes,
      lines,
      topLevelKeys,
      namespaces,
    };
  } catch (e) {
    let errorContext = 'Unable to read file for context.';
    let errorLine = 0;
    let errorCol = 0;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const ctx = getErrorContext(content, e.pos || 0);
      errorContext = ctx.context;
      errorLine = ctx.line;
      errorCol = ctx.column;
    } catch (_) {
      // File may not exist or be unreadable
    }
    return {
      valid: false,
      lang,
      displayPath,
      error: e.message.split('\n')[0],
      line: errorLine,
      column: errorCol,
      context: errorContext,
    };
  }
}

/**
 * Format file size for human readability.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main ──────────────────────────────────────────────────────

console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}   Locale JSON Validation Report${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════${colors.reset}\n`);

const results = FILES.map(f => validateFile(f.lang, f.file));

let allValid = true;
let totalKeys = 0;

for (const r of results) {
  if (r.valid) {
    totalKeys += r.topLevelKeys;
    console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}${r.lang}${colors.reset}  ${colors.dim}${r.displayPath}${colors.reset}`);
    console.log(`      ${r.topLevelKeys} namespaces · ${r.lines} lines · ${formatBytes(r.bytes)}`);
  } else {
    allValid = false;
    console.log(`  ${colors.red}✗${colors.reset} ${colors.bright}${r.lang}${colors.reset}  ${colors.dim}${r.displayPath}${colors.reset}`);
    console.log(`      ${colors.red}${r.error}${colors.reset}`);
    console.log(`      at line ${r.line}, column ${r.column}`);
    console.log(`\n${colors.yellow}Error context:${colors.reset}`);
    console.log(r.context);
  }
}

console.log(`\n${colors.bright}${colors.cyan}──────────────────────────────────────${colors.reset}`);
console.log(`${colors.bright}Summary:${colors.reset}`);
console.log(`  Files:     ${results.length} (${results.filter(r => r.valid).length} valid, ${results.filter(r => !r.valid).length} invalid)`);
console.log(`  Keys:      ~${totalKeys}+ total across all namespaces`);

if (allValid) {
  console.log(`  Status:    ${colors.green}${colors.bright}ALL VALID${colors.reset} ${colors.green}✓${colors.reset}`);
  process.exit(0);
} else {
  console.log(`  Status:    ${colors.red}${colors.bright}ERRORS FOUND${colors.reset} ${colors.red}✗${colors.reset}`);
  console.log(`\n${colors.yellow}Fix the errors above and re-run the validator.${colors.reset}`);
  process.exit(1);
}
