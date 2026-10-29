// Classifies Chinese strings inside src/vendor/** by whether the app can inject them.
//   props-default  字符串是解构参数的默认值 -> 应用层传 props 即可覆盖
//   exported-const 模块级导出常量            -> 组件若收 props 可覆盖，否则需改动
//   jsx            组件渲染里的字面量        -> 硬编码，props 注入无效
//   other          函数体内局部字符串
//
//   node scripts/i18n-vendor.mjs            summary
//   node scripts/i18n-vendor.mjs --json     full list
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(join(root, 'teams', 'package.json'));
const ts = require('typescript');
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f]/;
const ROOTS = ['teams/src/vendor', 'talents/src/vendor'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (['.ts', '.tsx'].includes(extname(path))) out.push(path);
  }
  return out;
}

const has = (node, pred) => { for (let p = node.parent; p; p = p.parent) if (pred(p)) return true; return false; };

function classify(node) {
  if (has(node, p => p.kind === ts.SyntaxKind.BindingElement && p.parent?.parent?.kind === ts.SyntaxKind.Parameter)) return 'props-default';
  if (has(node, p => p.kind === ts.SyntaxKind.JsxText || p.kind === ts.SyntaxKind.JsxAttribute)) return 'jsx';
  const statement = (() => { for (let p = node.parent; p; p = p.parent) if (p.kind === ts.SyntaxKind.VariableStatement) return p; return null; })();
  if (statement?.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) return 'exported-const';
  return 'other';
}

const items = [];
for (const dir of ROOTS) {
  for (const file of walk(join(root, dir))) {
    const text = readFileSync(file, 'utf8');
    if (!CJK.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      if (node.kind === ts.SyntaxKind.JsxText) {
        const value = node.getText(source).trim();
        if (CJK.test(value)) push(file, source, node, value, 'jsx');
      } else if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        const value = node.text ?? node.getText(source);
        if (CJK.test(value)) push(file, source, node, value, classify(node));
      } else if (node.kind === ts.SyntaxKind.TemplateExpression) {
        const value = node.getText(source);
        if (CJK.test(value)) push(file, source, node, value, classify(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

function push(file, source, node, value, kind) {
  const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
  items.push({ file: relative(root, file).replaceAll('\\', '/'), line: pos.line + 1, kind, text: value.replace(/\s+/g, ' ').trim().slice(0, 70) });
}

const totals = {};
for (const i of items) totals[i.kind] = (totals[i.kind] ?? 0) + 1;
const byFile = {};
for (const i of items) byFile[i.file] = (byFile[i.file] ?? 0) + 1;

if (process.argv.includes('--json')) {
  writeFileSync(join(root, 'i18n-vendor.json'), JSON.stringify({ total: items.length, totals, items }, null, 2) + '\n');
  console.log('写入 i18n-vendor.json');
} else {
  console.log(`vendor 中文 ${items.length} 条 · ${Object.keys(byFile).length} 个文件`);
  for (const [kind, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    const note = { 'props-default': '传 props 即可', jsx: '硬编码，需改动', 'exported-const': '常量，看组件是否收 props', other: '局部字符串' }[kind];
    console.log(`  ${String(n).padStart(4)}  ${kind.padEnd(15)} ${note}`);
  }
  console.log('\n按文件');
  for (const [file, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
    const parts = Object.entries(totals).length ? '' : '';
    console.log(`  ${String(n).padStart(4)}  ${file}`);
  }
}
