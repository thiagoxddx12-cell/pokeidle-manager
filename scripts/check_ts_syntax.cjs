/* Independent syntax-only validation. For complete type checking run npm ci && npm run check. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', 'src');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
  }
}
walk(root);
let bad = 0;
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const diag of src.parseDiagnostics) {
    bad++;
    process.stderr.write(`${path.relative(root,file)}: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}\n`);
  }
}
console.log(`Projeto atual: ${files.length} arquivos TypeScript/TSX; erros sintaticos: ${bad}`);
if (!files.length || bad) process.exit(1);
