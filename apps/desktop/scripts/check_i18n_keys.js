const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const LOCALE_DIR = path.join(SRC_DIR, 'locales');

// 1. Extract all t("key") calls from source code
function extractTCalls(dir) {
  const keys = new Set();
  const files = getAllFiles(dir);
  for (const file of files) {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
    if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
    const content = fs.readFileSync(file, 'utf8');
    // Match t("namespace.key") or t("namespace.key", { ... })
    const regex = /t\(["']([a-zA-Z_][a-zA-Z0-9_.]*)["']/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function getAllFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.vite') continue;
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// 2. Extract all keys from a locale JSON object (recursively)
function extractLocaleKeys(obj, prefix = '') {
  const keys = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const subKeys = extractLocaleKeys(v, fullKey);
      subKeys.forEach(sk => keys.add(sk));
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

// 3. Main comparison
function main() {
  // Get all t() calls from source
  const codeKeys = extractTCalls(SRC_DIR);
  console.log(`\n=== Found ${codeKeys.size} unique t() key references in source code ===\n`);

  // Get keys from each locale file
  const locales = ['en', 'vi', 'ja'];
  const localeKeys = {};
  let allLocaleKeys = new Set();

  for (const lang of locales) {
    const filePath = path.join(LOCALE_DIR, lang, 'common.json');
    if (!fs.existsSync(filePath)) {
      console.error(`Missing locale file: ${filePath}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const keys = extractLocaleKeys(data);
    localeKeys[lang] = keys;
    keys.forEach(k => allLocaleKeys.add(k));
    console.log(`${lang}: ${keys.size} keys`);
  }

  console.log(`\nTotal unique keys across all locales: ${allLocaleKeys.size}\n`);

  // Find keys in code but missing from each locale
  let hasMissing = false;
  for (const lang of locales) {
    const missing = [...codeKeys].filter(k => !localeKeys[lang].has(k));
    if (missing.length > 0) {
      hasMissing = true;
      console.log(`\n⚠️  ${missing.length} keys used in code but MISSING from ${lang}/common.json:`);
      missing.sort().forEach(k => console.log(`   - ${k}`));
    }
  }

  // Find keys in locale but NOT used in code (orphaned keys)
  for (const lang of locales) {
    const orphaned = [...localeKeys[lang]].filter(k => !codeKeys.has(k));
    if (orphaned.length > 0) {
      console.log(`\n📦 ${orphaned.length} keys in ${lang}/common.json but NOT used in code:`);
      orphaned.sort().forEach(k => console.log(`   - ${k}`));
    }
  }

  if (!hasMissing) {
    console.log('\n✅ All t() keys in source code exist in all 3 locale files!');
  }
}

main();
