/** Read-only health of the native session's local trajectory log. */
export type TrajectoryHealthState = 'healthy' | 'degraded' | 'unknown' | 'recovering';
export type TrajectoryHealthReason =
  | 'not_started'
  | 'empty'
  | 'corrupt_tail'
  | 'too_large'
  | 'permission'
  | 'lease_held'
  | 'schema_too_new'
  | 'activation_failed'
  | 'stale'
  | 'upstream_degraded'
  | 'unreadable';

export interface TrajectoryHealth {
  state: TrajectoryHealthState;
  reason?: TrajectoryHealthReason;
  sessionId: string;
  eventCount: number | null;
  lastEventAt: string | null;
  bytes: number | null;
  checkedAt: string;
  source: 'icode-health' | 'events-file' | 'none';
  diagnostic?: string;
}
