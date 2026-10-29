// "应用" on a code graph: the codegraph MCP server added to iCode's Code Agent (server/icode-agent.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { applyCodegraphMcp, codegraphMcpStatus, MCP_NAME } from '../server/icode-agent.ts';

const PROFILE = `name: Code
id: b011c0de0001
# kept as written
instructions: |
  Be careful.
tools:
  builtins:
  - shell
  mcp:
  - name: other
    transport: stdio
    command: other-server
`;

test('adds the codegraph server to the Code Agent once, keeping the rest of the profile and a backup', async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), 'icode-agents-')), path = join(agentsDir, 'Code.yaml');
  await writeFile(path, PROFILE);
  assert.deepEqual(await codegraphMcpStatus({ agentsDir }), { configured: false, path });
  const applied = await applyCodegraphMcp({ agentsDir });
  assert.deepEqual(applied, { configured: true, changed: true, created: false, path });
  const text = await readFile(path, 'utf8');
  assert.match(text, /# kept as written/);
  const profile = parse(text);
  assert.deepEqual(profile.tools.mcp.map((m: any) => m.name), ['other', MCP_NAME]);
  assert.deepEqual(profile.tools.mcp[1], { name: MCP_NAME, transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], enabled: true, expose_instructions: true, tool_name_prefix: 'cg' });
  assert.equal(await readFile(path + '.bak', 'utf8'), PROFILE);
  assert.equal((await codegraphMcpStatus({ agentsDir })).configured, true);
  assert.equal((await applyCodegraphMcp({ agentsDir })).changed, false, 'applying again changes nothing');
  assert.equal(await readFile(path, 'utf8'), text);
});

test('a codegraph server added by hand under another name counts as configured', async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), 'icode-agents-')), path = join(agentsDir, 'Code.yaml');
  await writeFile(path, 'name: Code\ntools:\n  mcp:\n  - name: cg\n    command: codegraph\n    args: [serve, --mcp]\n');
  assert.equal((await codegraphMcpStatus({ agentsDir })).configured, true);
  assert.equal((await applyCodegraphMcp({ agentsDir })).changed, false);
  assert.equal(existsSync(path + '.bak'), false);
});

test('without a Code.yaml the built-in profile is copied first; a profile that is not a mapping is refused', async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), 'icode-agents-')), path = join(agentsDir, 'Code.yaml');
  const applied = await applyCodegraphMcp({ agentsDir, builtinProfile: async () => 'name: Code\nid: b011c0de0001\ntools:\n  builtins:\n    - shell\n' });
  assert.equal(applied.created, true);
  const profile = parse(await readFile(path, 'utf8'));
  assert.equal(profile.id, 'b011c0de0001');
  assert.deepEqual(profile.tools.builtins, ['shell']);
  assert.equal(profile.tools.mcp[0].name, MCP_NAME);

  const broken = await mkdtemp(join(tmpdir(), 'icode-agents-'));
  await writeFile(join(broken, 'Code.yaml'), '- just\n- a list\n');
  await assert.rejects(applyCodegraphMcp({ agentsDir: broken }), (e: any) => e.status === 422);
});
