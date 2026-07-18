const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
const extensions = new Set([".ts", ".tsx"]);
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (extensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
      inspect(fullPath);
    }
  }
}

function inspect(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use[A-Z0-9]/.test(node.expression.text)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${path.relative(sourceRoot, filePath)}:${position.line + 1}:${position.character + 1} ${node.expression.text}()`,
      );
    }

    ts.forEachChild(node, visit);
  }

  sourceFile.statements.forEach(visit);
}

walk(sourceRoot);

if (violations.length > 0) {
  console.error("React hooks must not be called at module scope:");
  violations.forEach((violation) => console.error(`  - ${violation}`));
  process.exit(1);
}

console.log("Module-scope hook check passed.");
