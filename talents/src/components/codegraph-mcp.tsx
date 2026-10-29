// "应用" on a code graph: gives iCode's Code Agent the codegraph MCP server (server/icode-agent.ts).
import { useEffect, useState } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { applyCodegraphMcp, codegraphMcp, type CodegraphMcp } from '../api.ts';
import { useTalents } from '../store.tsx';

// Every button on the page shows the same state once one of them applies.
const shown = new Set<(status: CodegraphMcp) => void>();

export function ApplyMcp({ size }: { size?: 'small' }) {
  const { toast } = useTalents();
  const [status, setStatus] = useState<CodegraphMcp | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    shown.add(setStatus);
    codegraphMcp().then(s => { if (live) setStatus(s); }, () => undefined);
    return () => { live = false; shown.delete(setStatus); };
  }, []);
  if (!status) return null;
  if (status.configured) return <Tooltip title={status.path + ' 中已配置 codegraph MCP。在已构建索引的代码仓中新开 iCode 会话即可查询。'}><Tag color="success">已应用到 Code Agent</Tag></Tooltip>;
  const apply = async () => {
    setBusy(true);
    try {
      const next = await applyCodegraphMcp();
      shown.forEach(set => set(next));
      toast((next.created ? '已创建 Code Agent 配置并配上' : '已为 Code Agent 配上') + ' codegraph MCP，新开的 iCode 会话生效');
    } catch (e) { toast('应用失败：' + (e as Error).message); }
    finally { setBusy(false); }
  };
  return <Tooltip title={'在 ' + status.path + ' 中为 Code Agent 配上 codegraph MCP'}><Button size={size} type="primary" loading={busy} onClick={apply}>应用</Button></Tooltip>;
}
