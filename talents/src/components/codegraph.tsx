import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Segmented, Select, Space, Spin, Tag } from 'antd';
import ForceGraph, { type LinkObject } from 'force-graph';
import { forceCollide, forceX, forceY } from 'd3-force-3d';
import type { GraphHit, GraphLevel, GraphPage, NodeDetail, ViewNode, ViewOptions } from '../../../shared/codegraph.ts';
import { paintLabel, paintNode, paintSelection, palette, readTheme, rgba } from './codegraph-paint.ts';
import { InfoTip } from './ui.tsx';
import { when } from '../demo/format.ts';
import './codegraph.css';

type CanvasLink = LinkObject<ViewNode> & { kind: string; count: number };
const EDGE = '#82999e';
const idOf = (end: CanvasLink['source']) => typeof end === 'object' ? end.id as string : end as string;
type Source = { filePath: string; startLine: number; endLine: number; content: string };
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error ?? '读取失败', response.status);
  return data;
}
const LEVELS: { value: GraphLevel; label: string }[] = [{ value: 'dir', label: '目录结构' }, { value: 'file', label: '文件关系' }, { value: 'symbol', label: '符号关系' }];
const GROUP_LABEL: Record<string, string> = { dir: '目录', file: '文件' };
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** The code graph of a repository, read from its CodeGraph index when opened (or refreshed). The service sends one view
 *  at a time (server/codegraph-query.ts): the directories, files or symbols under a scope, or a symbol's neighbourhood,
 *  limited to what draws smoothly.
 *  onLoaded: the index was read (the artifact's figures may change). */
export function CodeGraphView({ projectId, sourceId, onLoaded }: { projectId: string; sourceId: string; onLoaded?(): void }) {
  const [page, setPage] = useState<GraphPage>(), [failure, setFailure] = useState(''), [loading, setLoading] = useState(false);
  // wanted: the view asked for (the service fills in the rest); reopen: read the index again.
  const [wanted, setWanted] = useState<Partial<ViewOptions>>({}), [reopen, setReopen] = useState(0);
  const snapshot = useRef<string | null>(null), opened = useRef(-1);
  // The request the drawn view answers.
  const [drawnFor, setDrawnFor] = useState('');
  const [query, setQuery] = useState(''), [hits, setHits] = useState<GraphHit[]>(), [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<NodeDetail>(), [source, setSource] = useState<Source>(), [sourceError, setSourceError] = useState('');
  const host = useRef<HTMLDivElement>(null), instance = useRef<ForceGraph<ViewNode, CanvasLink>>(undefined);
  const selectedRef = useRef(''), syncRef = useRef<() => void>(undefined), centerRef = useRef(''); selectedRef.current = selected;
  const api = (part: string, params: Record<string, string | undefined>) => {
    const search = new URLSearchParams({ source: sourceId });
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, value);
    return `/api/codegraph/${encodeURIComponent(projectId)}${part}?${search}`;
  };
  const wantedKey = JSON.stringify(wanted);
  useEffect(() => {
    const controller = new AbortController(), fresh = opened.current !== reopen;
    const load = async (open: boolean): Promise<void> => {
      setLoading(true);
      try {
        const next = await get<GraphPage>(api('', { level: wanted.level, scope: wanted.scope, tests: wanted.tests === undefined ? undefined : wanted.tests ? '1' : '0',
          kinds: wanted.kinds?.join(','), relation: wanted.relation, focus: wanted.focus, hops: wanted.hops ? String(wanted.hops) : undefined,
          snapshot: open ? undefined : snapshot.current ?? undefined }), controller.signal);
        snapshot.current = next.metadata.snapshotId; opened.current = reopen;
        // A notice is about the graph that was opened: later views of it keep it.
        setPage(previous => open ? next : { ...next, notice: previous?.notice }); setDrawnFor(wantedKey); setFailure('');
        if (open) onLoaded?.();
      } catch (e) {
        if (controller.signal.aborted) return;
        // The graph was generated again (another page opened it after the index changed): open it again.
        if (e instanceof RequestError && e.status === 409 && !open) return load(true);
        setFailure((e as Error).message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(fresh || !snapshot.current);
    return () => controller.abort();
  }, [wantedKey, reopen, projectId, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = page?.options, level = options?.level ?? 'symbol';
  const colors = useMemo(() => new Map((page?.groups ?? []).map((g, i) => [g, palette[i % palette.length]])), [page?.groups]);
  const show = (next: Partial<ViewOptions>, select = '') => { setWanted({ ...options, ...next }); setSelected(select); centerRef.current = select; setQuery(''); };
  const selectedNode = page?.nodes.find(n => n.id === selected);

  // Search looks at the whole graph, not only what is drawn.
  useEffect(() => {
    setHits(undefined);
    if (!query.trim() || !page) return;
    const controller = new AbortController();
    const timer = setTimeout(() => get<GraphHit[]>(api('/search', { q: query.trim(), tests: options!.tests ? '1' : '0', snapshot: page.metadata.snapshotId }), controller.signal)
      .then(setHits, () => undefined), 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page?.metadata.snapshotId, options?.tests]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (hit: GraphHit) => hit.kind === 'file'
    ? show({ level: 'file', scope: parent(hit.filePath), focus: '', tests: options!.tests || hit.test }, hit.filePath)
    : show({ level: 'symbol', focus: hit.id, scope: '', tests: options!.tests || hit.test }, hit.id);

  useEffect(() => {
    if (!host.current || !page) return;
    const container = host.current, view = page;
    const neighbours = new Map(view.nodes.map(n => [n.id, new Set<string>()]));
    for (const l of view.links) { neighbours.get(l.source)!.add(l.target); neighbours.get(l.target)!.add(l.source); }
    const degree = (n: ViewNode) => neighbours.get(n.id)!.size;
    const dirs = level === 'dir', big = view.nodes.length > 800 || view.links.length > 1500;
    const radius = new Map(view.nodes.map(n => [n.id, dirs ? Math.min(26, 5 + Math.log2(n.members + 1) * 1.8)
      : level === 'file' ? Math.min(14, 3 + Math.sqrt(degree(n)) * 1.2) : Math.min(10, 2 + Math.sqrt(degree(n)))]));
    // The best-connected nodes keep their labels when zoomed out (every one in a directory view); the rest appear on zooming in.
    const labelled = new Set([...view.nodes].sort((a, b) => degree(b) - degree(a)).slice(0, dirs ? undefined : 15).map(n => n.id));
    const groupOf = new Map(view.nodes.map(n => [n.id, n.group]));
    const focused = !!options?.focus && neighbours.has(options.focus);
    const nodes = view.nodes.map(n => ({ ...n })), byId = new Map(nodes.map(n => [n.id, n]));
    if (focused) Object.assign(byId.get(options!.focus)!, { fx: 0, fy: 0 });
    // Hover wins over selection; both light the node and its neighbours and dim everything else.
    let hovered = '', active = '', lit: Set<string> | undefined, ticks = 0, fitted = false;
    const linked = (l: CanvasLink) => !!active && (idOf(l.source) === active || idOf(l.target) === active);
    let theme = readTheme(container);
    const center = () => {
      const target = byId.get(centerRef.current);
      if (!target) return chart.zoomToFit(600, 40);
      centerRef.current = '';
      chart.centerAt(target.x ?? 0, target.y ?? 0, 600); chart.zoom(level === 'symbol' ? 2.6 : 1.8, 600);
    };
    const chart = new ForceGraph<ViewNode, CanvasLink>(container).height(Math.max(1, container.clientHeight))
      .nodeRelSize(1).nodeVal(n => radius.get(n.id)! ** 2).nodeColor(n => colors.get(n.group)!)
      .nodeLabel(n => {
        const tip = document.createElement('div'), title = tip.appendChild(document.createElement('strong'));
        title.textContent = level === 'symbol' ? n.name : n.id;
        tip.append(document.createElement('br'), `${GROUP_LABEL[n.kind] ?? n.kind} · ${degree(n)} 个关联${level === 'symbol' ? '' : ` · ${n.members.toLocaleString()} 个符号`}`);
        return tip;
      })
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((n, ctx) => paintNode(ctx, n.x!, n.y!, radius.get(n.id)!, colors.get(n.group)!, !!lit && !lit.has(n.id)))
      // Straight links draw much faster when there are many.
      .linkCurvature(big ? 0 : dirs ? .2 : .18)
      // Links stay grey until their node is lit, then take the colour of the node they start from.
      .linkColor(l => linked(l) ? rgba(colors.get(groupOf.get(idOf(l.source))!)!, .85) : rgba(EDGE, lit ? .06 : dirs ? .5 : .35))
      .linkWidth(l => (linked(l) ? 2.2 : 1) * Math.min(dirs ? 6 : 2.5, .6 + Math.log2(l.count + 1) * (dirs ? .7 : .35)))
      .linkDirectionalArrowLength(l => (level === 'symbol' || big) && !linked(l) ? 0 : 4).linkDirectionalArrowRelPos(1)
      .linkDirectionalParticleWidth(dirs ? 4 : 2.5).linkDirectionalParticleSpeed(.008).linkDirectionalParticleColor(l => colors.get(groupOf.get(idOf(l.source))!)!)
      .linkLabel(e => level === 'symbol' ? `${e.kind} × ${e.count}` : `${e.count.toLocaleString()} 条关系（主要为 ${e.kind}）`)
      .onRenderFramePost((ctx, scale) => {
        const chosen = byId.get(selectedRef.current);
        if (chosen) paintSelection(ctx, chosen.x!, chosen.y!, radius.get(chosen.id)!, scale, theme);
        const size = (dirs ? 12 : 11) / scale, low = chart.screen2GraphCoords(0, 0), high = chart.screen2GraphCoords(chart.width(), chart.height());
        ctx.font = `500 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const n of nodes) {
          const r = radius.get(n.id)!;
          if (n.x! < low.x || n.x! > high.x || n.y! < low.y || n.y! > high.y) continue;
          if (lit ? !lit.has(n.id) : !labelled.has(n.id) && r * scale < 7) continue;
          paintLabel(ctx, n.name, n.x!, n.y! + r + 3 / scale, scale, n.id === active, theme);
        }
      })
      .onNodeHover(n => { hovered = n?.id ?? ''; sync(); })
      .onNodeClick(n => setSelected(n.id)).onBackgroundClick(() => setSelected(''))
      // A large view settles mostly before it is first drawn, and stops sooner.
      .warmupTicks(0).d3VelocityDecay(.35).cooldownTicks(big ? 100 : 220)
      .onEngineTick(() => { if (++ticks === 70 && !centerRef.current) chart.zoomToFit(900, 40); })
      .onEngineStop(() => { if (!fitted) center(); fitted = true; });
    chart.d3Force('charge')!.strength(dirs ? -420 : focused ? -160 : level === 'file' ? -45 : -22).distanceMax(dirs ? Infinity : 320);
    chart.d3Force('link')!.distance(dirs ? 110 : focused ? 70 : level === 'file' ? 34 : 20);
    chart.d3Force('collide', forceCollide<ViewNode>(n => radius.get(n.id)! + (dirs ? 10 : 1.5)));
    // A weak pull to the centre keeps unlinked nodes from drifting off.
    chart.d3Force('x', focused ? null : forceX<ViewNode>(0).strength(dirs ? .08 : .04));
    chart.d3Force('y', focused ? null : forceY<ViewNode>(0).strength(dirs ? .08 : .04));
    const redraw = () => chart.nodeColor(chart.nodeColor()); // re-setting a styling prop requests a redraw
    // Particles run only on the lit links, so an idle graph stops redrawing.
    const sync = () => {
      active = hovered || selectedRef.current;
      lit = neighbours.has(active) ? new Set([active, ...neighbours.get(active)!]) : undefined;
      chart.linkDirectionalParticles(l => linked(l) && !big ? 2 : 0);
      redraw();
    };
    const themeWatch = new MutationObserver(() => { theme = readTheme(container); redraw(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    instance.current = chart; syncRef.current = sync;
    const observer = new ResizeObserver(([entry]) => chart.width(Math.max(1, entry.contentRect.width)).height(Math.max(1, entry.contentRect.height)));
    observer.observe(container);
    chart.graphData({ nodes, links: view.links.map(e => ({ ...e })) });
    sync();
    return () => { observer.disconnect(); themeWatch.disconnect(); chart._destructor(); instance.current = undefined; syncRef.current = undefined; };
  }, [page, colors]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => syncRef.current?.(), [selected]);

  // Details and source of the graph node the selection stands for (a symbol, or a file's file node).
  const detailNode = selectedNode?.node;
  useEffect(() => {
    setDetail(undefined); setSource(undefined); setSourceError('');
    if (!detailNode || !page) return;
    const controller = new AbortController(), at = page.metadata.snapshotId;
    get<NodeDetail>(api('/node', { id: detailNode, snapshot: at }), controller.signal).then(setDetail, () => undefined);
    get<Source>(api('/source', { id: detailNode, snapshot: at }), controller.signal).then(setSource).catch(e => { if (!controller.signal.aborted) setSourceError(e.message); });
    return () => controller.abort();
  }, [detailNode, page?.metadata.snapshotId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failure && !page) return <Alert type="error" title="无法读取代码图谱" description={failure} action={<Button onClick={() => setReopen(n => n + 1)}>重试</Button>} />;
  if (!page || !options) return <Spin tip="正在读取代码仓的 CodeGraph 索引…"><div style={{ height: 160 }} /></Spin>;
  const m = page.metadata, node = detail?.node;
  // The controls show what was asked for until it is drawn, then what was drawn (the service may adjust it).
  const asked: ViewOptions = drawnFor !== wantedKey ? { ...options, ...wanted } : options;
  const crumbs = options.scope ? options.scope.split('/') : [];
  const limited = page.total.nodes > page.nodes.length || page.total.links > page.links.length;
  return <div className="codegraph-view">
    <div className="cg-stats">{[['文件', m.files], ['节点', m.nodes], ['关系', m.edges]].map(([label, value]) => <div key={label}><strong>{Number(value).toLocaleString()}</strong><span>{label}</span></div>)}
      <p className="caption cg-indexed">索引更新于 {when(m.indexedAt)}{m.revision && ' · 提交 ' + m.revision.slice(0, 7)}<Button size="small" type="link" onClick={() => setReopen(n => n + 1)}>刷新</Button></p></div>
    {page.notice && <Alert type="warning" showIcon title={page.notice} />}
    {failure && <Alert type="error" showIcon title={failure} />}
    <div className="cg-toolbar">
      <Segmented aria-label="图谱层级" value={asked.level} onChange={v => show({ level: v as GraphLevel, focus: '' })} options={LEVELS} />
      <Select aria-label="关系筛选" value={asked.relation} onChange={relation => show({ relation }, selected)} options={[{ value: '', label: '全部关系' }, ...Object.keys(m.edgeKinds).map(value => ({ value, label: value }))]} />
      {level === 'symbol' && <><Select mode="multiple" aria-label="符号类型" placeholder="类 / 接口 / 方法 / 函数 / 路由" value={asked.kinds} onChange={kinds => show({ kinds }, selected)} options={Object.keys(m.nodeKinds).map(value => ({ value, label: value }))} />
        {options.focus && <Select aria-label="邻域深度" value={asked.hops} onChange={hops => show({ hops }, selected)} options={[{ value: 1, label: '1 跳邻域' }, { value: 2, label: '2 跳邻域' }]} />}</>}
      <Checkbox checked={asked.tests} onChange={e => show({ tests: e.target.checked }, selected)}>包含测试</Checkbox>
      <Button onClick={() => { setSelected(''); instance.current?.zoomToFit(350, 35); }}>重置视图</Button>
      {loading && <Spin size="small" />}
    </div>
    <div className="cg-scope">
      {options.focus ? <><span>邻域：</span><Tag closable onClose={e => { e.preventDefault(); show({ focus: '' }); }}>{page.nodes.find(n => n.id === options.focus)?.name ?? options.focus}</Tag></>
        : <><a onClick={() => show({ scope: '' })}>全部</a>{crumbs.map((part, i) => <span key={i}> / {i === crumbs.length - 1 ? part : <a onClick={() => show({ scope: crumbs.slice(0, i + 1).join('/') })}>{part}</a>}</span>)}</>}
      {limited && <span className="caption cg-limited">只画出关联最多的 {page.nodes.length.toLocaleString()} / {page.total.nodes.toLocaleString()} 个节点、{page.links.length.toLocaleString()} / {page.total.links.toLocaleString()} 条连线；进入下一级或搜索可查看其余</span>}
    </div>
    <div className="cg-layout">
      <section className="cg-canvas-section">
        <div ref={host} className="cg-canvas" aria-label="代码关系图" />
        <div className="cg-search"><Input.Search aria-label="搜索图谱" placeholder="搜索整个代码仓的文件、类或方法" allowClear value={query} onChange={e => setQuery(e.target.value)} /><span className="caption" data-testid="graph-counts">{page.nodes.length} 节点 · {page.links.length} 连线</span></div>
        {query && hits && <div className="cg-results" aria-label="搜索结果">{hits.map(h => <button key={h.id} onClick={() => choose(h)}>{h.name}<small>{h.kind} · {h.filePath}{h.test ? ' · 测试' : ''}</small></button>)}{!hits.length && <p>没有匹配结果</p>}{hits.length === 30 && <p>只显示前 30 项，请输入更完整的名称。</p>}</div>}
        {!page.nodes.length && <p className="cg-empty">当前范围没有节点，请调整筛选条件。</p>}
        <div className="cg-legend">
          {page.groups.filter(g => page.nodes.some(n => n.group === g)).map(g => <span key={g}><i style={{ background: colors.get(g) }} />{level === 'dir' ? GROUP_LABEL[g] : g}</span>)}
          <InfoTip>拖动节点调整布局，滚轮缩放，悬停高亮关联节点，点击查看详情。箭头和流动光点由 source 指向 target；目录和文件之间的连线合并了它们的全部关系，越粗关系越多。</InfoTip>
        </div>
      </section>
      <aside className="cg-detail">
        {!selectedNode ? <p className="cg-placeholder">选择节点查看详情</p> : <>
          <Tag>{GROUP_LABEL[selectedNode.kind] ?? selectedNode.kind}</Tag><h3>{level === 'symbol' ? selectedNode.name : selectedNode.id}</h3>
          {level !== 'symbol' && <p>{selectedNode.members.toLocaleString()} 个符号</p>}
          <Space wrap>
            {selectedNode.kind === 'dir' && <><Button onClick={() => show({ level: 'dir', scope: selectedNode.id, focus: '' })}>展开目录</Button><Button onClick={() => show({ level: 'file', scope: selectedNode.id, focus: '' })}>查看文件</Button></>}
            {selectedNode.kind === 'file' && <Button onClick={() => show({ level: 'symbol', scope: selectedNode.id, focus: '' })}>查看文件内符号</Button>}
            {level === 'symbol' && (options.focus === selectedNode.id ? <Button onClick={() => show({ focus: '' })}>取消聚焦</Button> : <Button onClick={() => show({ focus: selectedNode.id }, selectedNode.id)}>聚焦邻域</Button>)}
          </Space>
          {node && <><p className="path">{node.filePath}:{node.startLine}–{node.endLine}</p>{node.signature && <pre>{node.signature}</pre>}
            <h4>关联 <span className="section-count">{detail!.total}</span></h4>
            <div className="cg-connections">{detail!.connections.map(c => <button key={c.id + (c.incoming ? '<' : '>')} onClick={() => show({ level: 'symbol', focus: c.other.id, kinds: [], relation: '', tests: options.tests || c.other.test }, c.other.id)}>
              {c.incoming ? '←' : '→'} {c.kind} · {c.other.name}<small>{c.provenance ?? '来源未标注'}{c.line ? ` · L${c.line}` : ''}</small>
            </button>)}{detail!.total > detail!.connections.length && <p className="caption">只列出前 {detail!.connections.length} 项</p>}</div>
            <h4>源码{source && ` · L${source.startLine}–${source.endLine}`}</h4>{sourceError ? <Alert type="error" title={sourceError} /> : source ? <pre className="cg-source">{source.content.split('\n').map((line, i) => <span key={i} className={source.startLine + i >= node.startLine && source.startLine + i <= node.endLine ? 'cg-source-selected' : ''}><em>{source.startLine + i}</em>{line}{'\n'}</span>)}</pre> : <Spin />}
            {source && source.endLine < node.endLine && <p className="caption">仅预览前 300 行</p>}</>}
        </>}
      </aside>
    </div>
  </div>;
}
