// Builds the page into dist/: bundles content/ for previews, then src/main.tsx with esbuild (as teams/scripts/build.mjs does).
// Usage: npm run build
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';

execFileSync(process.execPath, ['tools/bundle-content.mjs'], { stdio: 'inherit' });
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.tsx'], bundle: true, outdir: 'dist', format: 'esm', loader: { '.html': 'text' }, sourcemap: true, minify: true, target: ['chrome120'], define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' });
// Served at /talents/, so the asset paths stay relative.
const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%239470c4'/%3E%3Ctext x='16' y='22' font-size='17' font-family='Arial' font-weight='700' fill='white' text-anchor='middle'%3ET%3C/text%3E%3C/svg%3E";
await writeFile('dist/index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>iCode Talents</title><link rel="icon" href="${icon}"><link rel="stylesheet" href="main.css"></head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>`);
