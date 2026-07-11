const fs = require('fs');

function flatten(obj, prefix = '') {
  const result = {};
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(result, flatten(obj[key], fullKey));
    } else {
      result[fullKey] = obj[key];
    }
  }
  return result;
}

const vi = flatten(JSON.parse(fs.readFileSync('apps/desktop/src/locales/vi/common.json', 'utf8')));
const en = flatten(JSON.parse(fs.readFileSync('apps/desktop/src/locales/en/common.json', 'utf8')));
const ja = flatten(JSON.parse(fs.readFileSync('apps/desktop/src/locales/ja/common.json', 'utf8')));

// Find strings where JA is significantly longer than both VI and EN
console.log('=== STRINGS WHERE JA IS 5+ CHARS LONGER THAN BOTH VI AND EN ===');
console.log('');

let count = 0;
for (const key of Object.keys(ja)) {
  const jStr = String(ja[key] || '');
  const vStr = String(vi[key] || '');
  const eStr = String(en[key] || '');
  
  const jLen = jStr.length;
  const vLen = vStr.length;
  const eLen = eStr.length;
  
  // Skip very long strings (AI prompts, etc.)
  if (jLen > 80) continue;
  // Skip template strings with placeholders
  if (jStr.includes('{') && jStr.includes('}')) continue;
  
  if (jLen > vLen + 4 && jLen > eLen + 4) {
    count++;
    console.log(`[${key}]`);
    console.log(`  VI (${vLen}): ${vStr}`);
    console.log(`  EN (${eLen}): ${eStr}`);
    console.log(`  JA (${jLen}): ${jStr}`);
    console.log('');
  }
}

console.log(`Total: ${count} strings where JA is significantly longer`);
console.log('');

// Also find the top 20 longest JA strings under 80 chars
console.log('=== TOP 30 LONGEST JA STRINGS (under 80 chars) ===');
const entries = Object.entries(ja)
  .filter(([k, v]) => typeof v === 'string' && v.length < 80 && !v.includes('{'))
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 30);

for (const [key, val] of entries) {
  console.log(`  [${key}] (${val.length}): ${val}`);
}
