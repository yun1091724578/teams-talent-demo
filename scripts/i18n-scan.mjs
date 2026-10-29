// Scans source for Chinese user-facing text and classifies each occurrence by the
// refactor it needs. Read-only; nothing here is imported by the apps.
//
//   node scripts/i18n-scan.mjs                summary
//   node scripts/i18n-scan.mjs --write        also write i18n-report.json
//   node scripts/i18n-scan.mjs --baseline     record today's debt as i18n-baseline.json
//   node scripts/i18n-scan.mjs --check        fail when new Chinese text is added (CI gate)
//
// Categories:
//   jsx-text      <div>中文</div>                 mechanical: wrap in t()
//   jsx-attr      aria-label="中文"               mechanical: t() expression
//   object-literal [{ title: '成员' }]            mechanical: t() expression
//   template-static  `中文`                       mechanical
//   template-dynamic `${n} 个`                    manual: needs ICU message
//   type-literal  type X = '未使用' | ...         NOT translation: semantic key, refactor to ASCII
//   other         message: '请填写…' in calls     review: mostly mechanical
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = process.cwd();
const require = createRequire(join(root, 'teams', 'package.json'));
const ts = require('typescript');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f]/;
const TECHNICAL_ATTRS = new Set(['className', 'id', 'key', 'href', 'src', 'type', 'role', 'name', 'htmlFor', 'data-testid', 'to', 'path', 'dir', 'lang', 'rel', 'target', 'value', 'mode', 'size', 'variant', 'status', 'placement', 'direction', 'shape', 'icon']);
const ROOTS = ['teams/src', 'teams/server', 'talents/src', 'talents/server', 'shared'];
// Translation tables: their keys are the Chinese source text, so they are not "hardcoded Chinese".
const SKIP = /node_modules|src\/generated|\/dist\/|[\\/]\.runtime[\\/]|shared\/i18n\/messages[\\/]|task-labels-en\.ts$|catalog-en\.ts$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.test(path.replaceAll('\\', '/'))) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (['.ts', '.tsx'].includes(extname(path))) out.push(path);
  }
  return out;
}

function bucket(path) {
  const p = path.replaceAll('\\', '/');
  if (p.includes('/vendor/')) return 'vendor(上游拷贝, 只注入不改写)';
  if (p.startsWith('shared/')) return 'shared';
  return p.split('/').slice(0, 2).join('/');
}

function classify(node, source) {
  const text = node.getText(source);
  const parent = node.parent;
  const chain = [];
  for (let p = parent; p; p = p.parent) chain.push(p.kind);
  const kind = node.kind;

  if (chain.some(k => k === ts.SyntaxKind.UnionType || k === ts.SyntaxKind.LiteralType) && kind === ts.SyntaxKind.StringLiteral) return 'type-literal';

  if (kind === ts.SyntaxKind.JsxText) return 'jsx-text';

  if (kind === ts.SyntaxKind.TemplateExpression) return 'template-dynamic';

  if (kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    return parent && parent.kind === ts.SyntaxKind.JsxAttribute ? 'jsx-attr' : 'template-static';
  }

  if (kind === ts.SyntaxKind.StringLiteral || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    if (parent?.kind === ts.SyntaxKind.JsxAttribute) {
      const attr = parent.name?.getText(source) ?? '';
      return TECHNICAL_ATTRS.has(attr) ? 'jsx-attr-technical' : 'jsx-attr';
    }
    if (parent?.kind === ts.SyntaxKind.PropertyAssignment || parent?.kind === ts.SyntaxKind.ShorthandPropertyAssignment) return 'object-literal';
    if (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression) return 'object-literal';
    if (chain.slice(0, 3).includes(ts.SyntaxKind.JsxExpression)) return 'jsx-expr';
    return 'other';
  }

  if (kind === ts.SyntaxKind.TemplateHead || kind === ts.SyntaxKind.TemplateMiddle || kind === ts.SyntaxKind.TemplateTail) return 'template-dynamic';
  return null;
}

const MECHANICAL = new Set(['jsx-text', 'jsx-attr', 'object-literal', 'template-static', 'jsx-expr', 'other']);
const items = [];

for (const dir of ROOTS) {
  for (const file of walk(join(root, dir))) {
    const text = readFileSync(file, 'utf8');
    if (!CJK.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      if (node.kind === ts.SyntaxKind.JsxText) {
        const value = node.getText(source).trim();
        if (CJK.test(value)) items.push(record(file, node, value, 'jsx-text'));
      } else if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === ts.SyntaxKind.TemplateExpression) {
        const raw = node.getText(source);
        const value = node.kind === ts.SyntaxKind.TemplateExpression ? raw : (node.text ?? raw);
        if (CJK.test(value)) { const category = classify(node, source); if (category) items.push(record(file, node, value, category)); }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

function record(file, node, value, category) {
  const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart(node.getSourceFile()));
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 60);
  return { file: relative(root, file).replaceAll('\\', '/'), line: line + 1, category, text: clean, id: createHash('sha1').update(relative(root, file) + ':' + clean).digest('hex').slice(0, 12) };
}

const counts = {};
for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
const byFile = {};
for (const item of items) byFile[item.file] = (byFile[item.file] ?? 0) + 1;
const byBucket = {};
for (const item of items) { const b = bucket(item.file); byBucket[b] = (byBucket[b] ?? 0) + 1; }

const mechanical = items.filter(i => MECHANICAL.has(i.category)).length;
const semantic = items.filter(i => i.category === 'type-literal').length;
const dynamic = items.filter(i => i.category === 'template-dynamic').length;

const args = new Set(process.argv.slice(2));

if (args.has('--baseline')) {
  const baseline = [...new Set(items.map(i => i.id))].sort();
  writeFileSync(join(root, 'i18n-baseline.json'), JSON.stringify({ at: new Date().toISOString(), count: baseline.length, ids: baseline }, null, 2) + '\n');
  console.log(`baseline 写入 i18n-baseline.json：${baseline.length} 条唯一文案（原始出现 ${items.length} 次）`);
} else if (args.has('--check')) {
  const file = join(root, 'i18n-baseline.json');
  if (!existsSync(file)) { console.error('缺少 i18n-baseline.json，先执行 node scripts/i18n-scan.mjs --baseline'); process.exit(2); }
  const known = new Set(JSON.parse(readFileSync(file, 'utf8')).ids);
  const added = items.filter(i => !known.has(i.id));
  if (added.length) {
    console.error(`新增 ${added.length} 条硬编码中文：`);
    for (const item of added.slice(0, 40)) console.error(`  ${item.file}:${item.line}  [${item.category}]  ${item.text}`);
    process.exit(1);
  }
  console.log(`通过：未新增硬编码中文（基线 ${known.size} 条，仅可减少）`);
} else {
  console.log(`\n按目录`);
  for (const [name, count] of Object.entries(byBucket).sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${name}`);
  console.log(`\n按类型`);
  for (const [name, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const note = name === 'type-literal' ? '语义键，重构而非翻译' : name === 'template-dynamic' ? '需 ICU 消息，人工' : '可机械改写';
    console.log(`  ${String(count).padStart(5)}  ${name.padEnd(18)} ${note}`);
  }
  console.log(`\n合计 ${items.length} 条 · 可机械改写 ${mechanical} (${(mechanical / items.length * 100).toFixed(1)}%) · 需人工 ${dynamic + semantic} · 文件 ${Object.keys(byFile).length}`);
  console.log(`\n最密集的 15 个文件`);
  for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${file}`);
  if (args.has('--write')) {
    writeFileSync(join(root, 'i18n-report.json'), JSON.stringify({ at: new Date().toISOString(), total: items.length, counts, byFile, items }, null, 2) + '\n');
    console.log('\n明细写入 i18n-report.json');
  }
}
