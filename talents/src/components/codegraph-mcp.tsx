// "应用" on a code graph: gives iCode's Code Agent the codegraph MCP server (server/icode-agent.ts).
import { useEffect, useState } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { applyCodegraphMcp, codegraphMcp, type CodegraphMcp } from '../api.ts';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';

// Every button on the page shows the same state once one of them applies.
const shown = new Set<(status: CodegraphMcp) => void>();

export function ApplyMcp({ size }: { size?: 'small' }) {
  const { toast } = useTalents();
  const t = useT();
  const [status, setStatus] = useState<CodegraphMcp | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    shown.add(setStatus);
    codegraphMcp().then(s => { if (live) setStatus(s); }, () => undefined);
    return () => { live = false; shown.delete(setStatus); };
  }, []);
  if (!status) return null;
  if (status.configured) return <Tooltip title={t('mcp.configuredAt', { path: status.path })}><Tag color="success">{t('mcp.applied')}</Tag></Tooltip>;
  const apply = async () => {
    setBusy(true);
    try {
      const next = await applyCodegraphMcp();
      shown.forEach(set => set(next));
      toast(t(next.created ? 'mcp.createdAndApplied' : 'mcp.appliedTo'));
    } catch (e) { toast(t('mcp.applyFailed', { error: (e as Error).message })); }
    finally { setBusy(false); }
  };
  return <Tooltip title={t('mcp.applyHint', { path: status.path })}><Button size={size} type="primary" loading={busy} onClick={apply}>{t('mcp.apply')}</Button></Tooltip>;
}
