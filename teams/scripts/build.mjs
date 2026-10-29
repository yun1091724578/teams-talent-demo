import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.tsx'], bundle: true, outdir: 'dist', format: 'esm', sourcemap: true, minify: true, target: ['chrome120'], define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' });
await writeFile('dist/index.html', '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>iCode Teams · Credit Card</title><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
// Remove the retired viewer from previous local builds.
await rm('dist/trace-monitor', { recursive: true, force: true });
