// Code graphs from a CodeGraph index (server/codegraph-export.ts) and the views, search and details the page asks for
// (server/codegraph-query.ts), on a small made-up repository (tests/fixtures/codegraph-repo.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphPage, isTestPath, nodeDetail, searchGraph } from '../server/codegraph-query.ts';
import { exportSnapshot } from '../server/codegraph-export.ts';
import { readSnapshot } from '../server/codegraph-view.ts';
import type { ViewOptions } from '../../shared/codegraph.ts';
import { codegraphRepository, FIXTURE } from './fixtures/codegraph-repo.ts';

const directory = await mkdtemp(join(tmpdir(), 'codegraph-'));
const repository = await codegraphRepository(join(directory, 'shop'));
await exportSnapshot({ repository, projectId: 'carddemo', output: join(directory, 'graph'), root: repository });
const graph = readSnapshot(join(directory, 'graph'), 'carddemo')!;
const options: ViewOptions = { level: 'symbol', scope: '', tests: true, kinds: [], relation: '', focus: '', hops: 1 };
const place = graph.nodes.find(n => n.name === 'place' && n.filePath.endsWith('/OrderService.java'))!;

test('an index exports with valid endpoints, the sources it was made from and their source locations', () => {
  assert.deepEqual([graph.metadata.files, graph.metadata.nodes - graph.metadata.files], [FIXTURE.files, FIXTURE.symbols]);
  const ids = new Set(graph.nodes.map(n => n.id));
  assert.equal(ids.size, graph.metadata.nodes);
  assert.equal(graph.edges.length, graph.metadata.edges);
  for (const edge of graph.edges) { assert.ok(ids.has(edge.source)); assert.ok(ids.has(edge.target)); }
  const digest = createHash('sha256');
  for (const [path, source] of Object.entries(graph.sources).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    digest.update(path).update('\0').update(createHash('sha256').update(source).digest('hex')).update('\0');
  }
  assert.equal(digest.digest('hex'), graph.metadata.sourceDigest);
  assert.ok(graph.sources[place.filePath].split('\n')[place.startLine - 1].includes('place'));
  assert.ok(graph.edges.some(e => e.source === place.id && e.kind === 'calls'));
});

test('a source changed since indexing is not attached; an index being built is not exported', async () => {
  const changed = await codegraphRepository(join(directory, 'changed'));
  await writeFile(join(changed, place.filePath), '// edited after indexing\n');
  await exportSnapshot({ repository: changed, projectId: 'carddemo', output: join(directory, 'changed-graph'), root: changed });
  const shown = readSnapshot(join(directory, 'changed-graph'), 'carddemo')!;
  assert.equal(shown.sources[place.filePath], undefined);
  assert.equal(Object.keys(shown.sources).length, FIXTURE.files - 1);
  const building = await codegraphRepository(join(directory, 'building'), 'indexing');
  await assert.rejects(exportSnapshot({ repository: building, projectId: 'carddemo', output: join(directory, 'building-graph'), root: building }), /incomplete/);
});

test('test code is recognised by the usual directory and file name conventions', () => {
  for (const path of ['services/a/src/test/java/AT.java', 'tests/app/x.py', 'pkg/test_x.py', 'pkg/x_test.go', 'web/__tests__/a.ts', 'web/a.spec.tsx', 'web/a.test.mjs', 'src/FooTest.java', 'conftest.py'])
    assert.ok(isTestPath(path), path);
  for (const path of ['src/testing_utils.py', 'src/contest.py', 'src/attest/x.py', 'src/Latest.java', 'docs/testplan.md']) assert.ok(!isTestPath(path), path);
});

test('views filter tests and relations; files merge their edges, coloured by language; symbols coloured by kind', () => {
  const before = JSON.stringify(graph);
  const files = graphPage(graph, { ...options, level: 'file', tests: false });
  assert.ok(files.nodes.every(n => n.kind === 'file' && !isTestPath(n.id)));
  assert.ok(files.nodes.every(n => n.group === graph.nodes.find(x => x.filePath === n.id)!.language && files.groups.includes(n.group)));
  const kept = new Map(graph.nodes.filter(n => !isTestPath(n.filePath)).map(n => [n.id, n.filePath]));
  const expected = graph.edges.filter(e => kept.has(e.source) && kept.has(e.target) && kept.get(e.source) !== kept.get(e.target)).length;
  assert.equal(files.links.reduce((n, e) => n + e.count, 0), expected, 'merged links count every edge between two files');
  const calls = graphPage(graph, { ...options, relation: 'calls' });
  assert.ok(calls.links.length && calls.links.every(e => e.kind === 'calls'));
  assert.ok(calls.nodes.every(n => n.group === n.kind && ['class', 'interface', 'enum', 'method', 'function', 'route'].includes(n.kind)));
  assert.equal(JSON.stringify(graph), before, 'views must not change the stored snapshot');
});

test('a graph opens on its symbols when they can all be drawn, else on its directories; without tests unless asked', () => {
  const opened = graphPage(graph, {});
  assert.deepEqual([opened.options.level, opened.options.tests], ['symbol', false]);
  assert.ok(opened.nodes.every(n => !isTestPath(graph.nodes.find(x => x.id === n.id)!.filePath)));
  const small = graphPage(graph, {}, { nodes: 10, links: 300, dirGroups: 30 });
  assert.equal(small.options.level, 'dir');
  assert.ok(small.nodes.length <= 30 && small.nodes.every(n => ['dir', 'file'].includes(n.kind)));
  const symbols = graphPage(graph, { level: 'symbol' }).nodes.length;
  assert.equal(small.nodes.reduce((n, v) => n + v.members, 0), graph.nodes.filter(n => !isTestPath(n.filePath)).length, 'directories stand for every symbol under them');
  assert.ok(symbols > 0);
});

test('a directory view opens level by level within a scope; a file scope shows its symbols', () => {
  const top = graphPage(graph, { level: 'dir' }, { nodes: 2000, links: 6000, dirGroups: 4 });
  const service = top.nodes.find(n => n.kind === 'dir' && n.id.includes('orders'))!;
  const inner = graphPage(graph, { level: 'dir', scope: service.id });
  assert.ok(inner.nodes.length > 1 && inner.nodes.every(n => n.id.startsWith(service.id + '/')));
  assert.equal(inner.nodes.reduce((n, v) => n + v.members, 0), service.members);
  const file = inner.nodes.find(n => n.kind === 'file')!;
  assert.ok(file.node, 'a file shows its file node');
  const symbols = graphPage(graph, { level: 'dir', scope: file.id });
  assert.equal(symbols.options.level, 'symbol');
  assert.ok(symbols.nodes.length && symbols.nodes.every(n => graph.nodes.find(x => x.id === n.id)!.filePath === file.id));
});

test('a neighbourhood is induced by the selected relation; a view too large is limited to its best connected part', () => {
  const center = place;
  const view = graphPage(graph, { ...options, relation: 'calls', focus: center.id });
  assert.ok(view.nodes.some(n => n.id === center.id) && view.nodes.length > 1);
  for (const node of view.nodes) assert.ok(node.id === center.id || graph.edges.some(e => e.kind === 'calls'
    && ((e.source === center.id && e.target === node.id) || (e.target === center.id && e.source === node.id))));
  assert.ok(view.links.every(e => e.kind === 'calls'));
  const limited = graphPage(graph, { ...options, focus: center.id, hops: 2 }, { nodes: 10, links: 12, dirGroups: 30 });
  assert.equal(limited.nodes.length, 10);
  assert.ok(limited.total.nodes > 10 && limited.links.length <= 12);
  assert.ok(limited.nodes.some(n => n.id === center.id), 'the focus is always drawn');
  const kept = new Set(limited.nodes.map(n => n.id));
  assert.ok(limited.links.every(l => kept.has(l.source) && kept.has(l.target)));
});

test('search looks at the whole graph; details list the connections of a node', () => {
  const hits = searchGraph(graph, 'OrderServ', false);
  assert.deepEqual(hits.map(h => h.name), ['OrderService', 'OrderService.java'], 'names first, then file paths; tests left out');
  assert.ok(searchGraph(graph, 'Test', false).every(h => !h.test));
  assert.ok(searchGraph(graph, 'Test', true).some(h => h.test));
  const detail = nodeDetail(graph, hits[0].id)!;
  assert.equal(detail.node.name, 'OrderService');
  assert.equal(detail.total, graph.edges.filter(e => e.source === hits[0].id || e.target === hits[0].id).length);
  assert.ok(detail.connections.length <= 40);
  for (const c of detail.connections) {
    const edge = graph.edges.find(e => e.id === c.id)!;
    assert.equal(c.incoming ? edge.source : edge.target, c.other.id, 'the other end of each connection');
  }
});
