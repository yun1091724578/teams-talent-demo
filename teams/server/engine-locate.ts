import { join } from 'node:path';
import { nativeConfigRoot, nativeSessionsRoot, selectICodeBinary, type PlatformPathOptions } from './icode-binary.js';
import { nativePlatformEnvironment } from './native-skill-reader.js';

/** Same read-only shape as iCode-teams' `chrys.engine.locate` response. */
export interface ChrysEngineLocation {
  state: 'ready' | 'none' | 'failed';
  entry?: string;
  version?: string;
  environment?: Record<string, string>;
  config?: string;
  sessionRoot?: string;
  reason?: string;
  notes?: string[];
}

export interface LocateEngineOptions extends PlatformPathOptions {
  materialRoot: string;
  probe?: (entry: string) => Promise<string>;
  environment?: () => Promise<{ configDirectory: string; sessionRoot?: string }>;
}

/**
 * Read-only engine location. It never changes the selected installation or triggers
 * install/upgrade. A missing explicit override is a failure (never silently fall back);
 * a missing launcher is `none`; a launcher that never answers `--version` is `failed`.
 */
export async function locateChrysEngine(options: LocateEngineOptions): Promise<{ engine: ChrysEngineLocation }> {
  const selection = await selectICodeBinary(options);
  const notes = [...selection.notes];
  if (selection.status === 'ready' && selection.path && selection.version) {
    let config = nativeConfigRoot(options);
    let sessionRoot = nativeSessionsRoot(options);
    try {
      const environment = await (options.environment ?? nativePlatformEnvironment)();
      config = environment.configDirectory;
      sessionRoot = environment.sessionRoot ?? join(config, 'sessions');
    } catch (error) {
      notes.push('无法读取 iCode 原生配置目录，使用平台默认位置：' + (error as Error).message);
    }
    return { engine: { state: 'ready', entry: selection.path, version: selection.version, config, sessionRoot, notes } };
  }
  if (selection.status === 'none') return { engine: { state: 'none', reason: selection.reason, notes } };
  return { engine: { state: 'failed', entry: selection.path, reason: selection.reason, notes } };
}
