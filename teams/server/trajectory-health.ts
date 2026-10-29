import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrajectoryHealth, TrajectoryHealthReason, TrajectoryHealthState } from '../src/trajectory-health.js';

const HEALTH_MAX_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;
const reasons = new Set<TrajectoryHealthReason>(['not_started', 'empty', 'corrupt_tail', 'too_large', 'permission', 'lease_held', 'schema_too_new', 'activation_failed', 'stale', 'upstream_degraded', 'unreadable']);
const STALE_MS = 10 * 60 * 1000;
const now = () => new Date().toISOString();
const unknown = (sessionId: string, diagnostic?: string): TrajectoryHealth => ({ state: 'unknown', reason: 'not_started', sessionId, eventCount: null, lastEventAt: null, bytes: null, checkedAt: now(), source: 'none', ...(diagnostic ? { diagnostic } : {}) });

/** Read a bounded suffix so health probes never load a large trajectory into the API process. */
async function tail(path: string, max: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    const length = Math.min(info.size, max), buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const result = await handle.read(buffer, read, length - read, info.size - length + read);
      if (!result.bytesRead) break;
      read += result.bytesRead;
    }
    return buffer.subarray(0, read).toString('utf8');
  } finally { await handle.close(); }
}

function eventHealth(text: string, sessionId: string, bytes: number, checkedAt: string, truncated = false): TrajectoryHealth {
  const lines = text.split('\n'), terminated = lines.at(-1) === '';
  if (terminated) lines.pop();
  // A suffix probe can start in the middle of a JSON line; that first fragment
  // is not evidence of corruption.
  if (truncated && lines.length) lines.shift();
  let valid = 0, invalid = 0, lastEventAt: string | null = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) { invalid++; continue; }
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row.session_id !== sessionId || typeof row.occurred_at !== 'string' || !Number.isFinite(Date.parse(row.occurred_at))) { invalid++; continue; }
      valid++; lastEventAt = row.occurred_at;
    } catch {
      // A writer may be appending the final line right now. Anything else is damage.
      if (index === lines.length - 1 && !terminated) continue;
      invalid++;
    }
  }
  if (invalid) return { state: 'degraded', reason: 'corrupt_tail', sessionId, eventCount: valid, lastEventAt, bytes, checkedAt, source: 'events-file', diagnostic: '原生轨迹存在损坏或无法识别的行；原始文件未修改，会话过程已降级为对话视图。' };
  if (!valid) return { state: 'unknown', reason: terminated ? 'empty' : 'not_started', sessionId, eventCount: 0, lastEventAt: null, bytes, checkedAt, source: 'events-file', diagnostic: '原生轨迹尚未写入事件。' };
  return { state: 'healthy', sessionId, eventCount: valid, lastEventAt, bytes, checkedAt, source: 'events-file' };
}

/**
 * iCode may publish `trajectory/health.json`; until then, inspect the
 * trajectory suffix. This never writes, truncates or repairs the log.
 */
export async function readTrajectoryHealth(sessionDir: string | null, sessionId: string): Promise<TrajectoryHealth> {
  const checkedAt = now();
  if (!sessionDir) return unknown(sessionId, '尚未定位到原生会话目录。');
  const healthPath = join(sessionDir, 'trajectory', 'health.json');
  try {
    const info = await stat(healthPath);
    if (info.isFile() && info.size <= HEALTH_MAX_BYTES) {
      const parsed = JSON.parse(await tail(healthPath, HEALTH_MAX_BYTES)) as Record<string, unknown>;
      if (parsed.sessionId === sessionId && ['healthy', 'degraded', 'recovering'].includes(String(parsed.state))) {
        const state = parsed.state as TrajectoryHealthState;
        const reason = typeof parsed.reason === 'string' && reasons.has(parsed.reason as TrajectoryHealthReason) ? parsed.reason as TrajectoryHealthReason : state === 'degraded' ? 'upstream_degraded' : undefined;
        return {
          state, ...(reason ? { reason } : {}), sessionId,
          eventCount: Number.isSafeInteger(parsed.eventCount) ? Number(parsed.eventCount) : null,
          lastEventAt: typeof parsed.lastEventAt === 'string' && Number.isFinite(Date.parse(parsed.lastEventAt)) ? parsed.lastEventAt : null,
          bytes: Number.isSafeInteger(parsed.bytes) ? Number(parsed.bytes) : null,
          checkedAt: typeof parsed.updatedAt === 'string' && Number.isFinite(Date.parse(parsed.updatedAt)) ? parsed.updatedAt : checkedAt,
          source: 'icode-health',
          ...(typeof parsed.detail === 'string' && parsed.detail.trim() ? { diagnostic: parsed.detail.trim() } : {}),
        };
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { state: 'degraded', reason: 'unreadable', sessionId, eventCount: null, lastEventAt: null, bytes: null, checkedAt, source: 'icode-health', diagnostic: '无法读取原生轨迹健康记录：' + (error as Error).message };
  }
  const eventsPath = join(sessionDir, 'trajectory', 'events.jsonl');
  try {
    const info = await stat(eventsPath);
    if (!info.isFile()) return unknown(sessionId, '原生轨迹路径不是文件。');
    if (!info.size) return { state: 'unknown', reason: 'empty', sessionId, eventCount: 0, lastEventAt: null, bytes: 0, checkedAt, source: 'events-file', diagnostic: '原生轨迹尚未写入事件。' };
    if (info.size > 64 * 1024 * 1024) return { state: 'degraded', reason: 'too_large', sessionId, eventCount: null, lastEventAt: null, bytes: info.size, checkedAt, source: 'events-file', diagnostic: '原生轨迹超过可读取范围（64 MiB），会话过程已降级。' };
    const result = eventHealth(await tail(eventsPath, TAIL_BYTES), sessionId, info.size, checkedAt, info.size > TAIL_BYTES);
    try {
      const sessionInfo = await stat(join(sessionDir, 'session.json'));
      if (result.state !== 'degraded' && sessionInfo.isFile() && sessionInfo.mtimeMs - info.mtimeMs > STALE_MS) return { ...result, state: 'degraded', reason: 'stale', diagnostic: '会话正文已更新，但本地轨迹超过 10 分钟未写入；可能已降级。原始文件未修改。' };
    } catch {}
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return unknown(sessionId, '原生轨迹尚未创建。');
    return { state: 'degraded', reason: 'permission', sessionId, eventCount: null, lastEventAt: null, bytes: null, checkedAt, source: 'events-file', diagnostic: '无法读取原生轨迹：' + (error as Error).message };
  }
}
