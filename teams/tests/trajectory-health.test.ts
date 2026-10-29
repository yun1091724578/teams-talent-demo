import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTrajectoryHealth } from '../server/trajectory-health.js';

const sessionId = '11111111-2222-4333-8444-555555555555';
const at = '2026-10-29T00:00:00.000Z';
const event = (sequence: number) => JSON.stringify({ session_id: sessionId, event_id: 'e' + sequence, sequence, occurred_at: at, event_type: 'turn.started', payload: {} }) + '\n';

test('trajectory health covers missing, empty, healthy, corrupt and upstream-declared states', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trajectory-health-'));
  try {
    assert.equal((await readTrajectoryHealth(join(dir, 'missing'), sessionId)).state, 'unknown');
    await mkdir(join(dir, 'session', 'trajectory'), { recursive: true });
    assert.equal((await readTrajectoryHealth(join(dir, 'session'), sessionId)).state, 'unknown');
    await writeFile(join(dir, 'session', 'trajectory', 'events.jsonl'), '');
    assert.equal((await readTrajectoryHealth(join(dir, 'session'), sessionId)).state, 'unknown');
    await writeFile(join(dir, 'session', 'trajectory', 'events.jsonl'), event(1) + event(2));
    const healthy = await readTrajectoryHealth(join(dir, 'session'), sessionId);
    assert.equal(healthy.state, 'healthy'); assert.equal(healthy.eventCount, 2); assert.equal(healthy.lastEventAt, at);
    await writeFile(join(dir, 'session', 'session.json'), '{}');
    const old = new Date(Date.now() - 20 * 60 * 1000);
    await utimes(join(dir, 'session', 'trajectory', 'events.jsonl'), old, old);
    const stale = await readTrajectoryHealth(join(dir, 'session'), sessionId);
    assert.equal(stale.state, 'degraded'); assert.equal(stale.reason, 'stale');
    await appendFile(join(dir, 'session', 'trajectory', 'events.jsonl'), '\n');
    const corrupt = await readTrajectoryHealth(join(dir, 'session'), sessionId);
    assert.equal(corrupt.state, 'degraded'); assert.equal(corrupt.reason, 'corrupt_tail');
    await writeFile(join(dir, 'session', 'trajectory', 'health.json'), JSON.stringify({ schemaVersion: 1, sessionId, state: 'degraded', reason: 'lease_held', detail: 'writer 仍被占用', updatedAt: at }));
    const upstream = await readTrajectoryHealth(join(dir, 'session'), sessionId);
    assert.equal(upstream.state, 'degraded'); assert.equal(upstream.reason, 'lease_held'); assert.equal(upstream.source, 'icode-health'); assert.match(upstream.diagnostic!, /writer/);
    await writeFile(join(dir, 'session', 'trajectory', 'health.json'), '{not json');
    const invalid = await readTrajectoryHealth(join(dir, 'session'), sessionId);
    assert.equal(invalid.state, 'degraded'); assert.equal(invalid.reason, 'unreadable');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
