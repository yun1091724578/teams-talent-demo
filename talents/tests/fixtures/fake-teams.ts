// Test-only stand-in for the Teams endpoints Talents reads (shared/contracts.ts), for browser tests that start Talents alone.
// Serves the fixture snapshot with the Credit Card repository bound to its business repository; it never changes.
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { SharedTeams, TeamsSnapshot } from '../../../shared/contracts.ts';
import snapshot from './teams-snapshot.json' with { type: 'json' };

export const boundRemote = 'https://github.com/JeffyLiu003/carddemo-java-1025.git';
export async function fakeTeams(port: number): Promise<Server> {
  const served: SharedTeams = { revision: 'fake.1', snapshot: { ...(snapshot as TeamsSnapshot), projects: (snapshot as TeamsSnapshot).projects.map(p => p.id !== 'carddemo' ? p
    : { ...p, repositories: p.repositories.map(r => ({ ...r, path: '/work/carddemo-java-1025', remote: boundRemote, branch: 'develop' })) }) } };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const json = (value: unknown) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (url.pathname === '/api/shared/teams') json(served);
    else if (url.pathname === '/api/shared/teams/changes') {
      if (url.searchParams.get('after') !== served.revision) return json({ revision: served.revision });
      const timer = setTimeout(() => json({ revision: served.revision }), 25000);
      response.once('close', () => clearTimeout(timer));
    } else { response.writeHead(404); response.end(); }
  });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  return server;
}
