import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../src/domain.js';
import { readSkillCatalog } from './skill-packages.js';
import { root, workspace, origin, talentOrigin } from './config.js';
export function headers(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.headers.origin === origin) {
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Token, X-Demo-Request');
  }
}
export async function bodyJson(request: IncomingMessage, maxBytes = 65536) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new DomainError('请求过大', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, any>; } catch { throw new DomainError('JSON 请求无效', 400); }
}
export async function staticFile(path: string, app: 'teams', response: ServerResponse) {
  if (!['/', '/' + app, '/main.js', '/main.css', '/main.js.map', '/main.css.map'].includes(path)) return false;
  const name = path.startsWith('/main.') ? path.slice(1) : 'index.html';
  let content = await readFile(join(root, 'dist', name));
  if (name === 'index.html') {
    const runtime = JSON.stringify({ app, teamsOrigin: origin, talentOrigin, defaultLocale: process.env.DEMO_LOCALE === 'en' ? 'en' : 'zh' }).replaceAll('<', '\\u003c');
    content = Buffer.from(content.toString().replace('<script type="module"', `<script type="application/json" id="demo-system-runtime">${runtime}</script><script type="module"`));
  }
  const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.map') ? 'application/json' : 'text/html';
  response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-cache' }); response.end(content); return true;
}
export async function readFixtures() {
  const [presentation, baseline, teamsProject] = await Promise.all(['fixtures/presentation.json', 'teams-baseline.json', 'fixtures/teams-project.json'].map(path => readFile(join(root, path), 'utf8').then(JSON.parse)));
  const skills = presentation.skills.map((skill: { name: string }) => ({ ...skill, path: join(workspace, '.agents', 'skills', skill.name, 'SKILL.md') }));
  const catalog = await readSkillCatalog();
  return { ...presentation, ...catalog, skills, baseline, teamsProject, localPaths: { collaborationSkill: join(root, 'skills/teams-demo-collaboration/SKILL.md'), cli: join(root, 'scripts/teams-demo.mjs') } };
}
