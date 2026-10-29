// 知识能力：按四类展示 Talents 提供的知识生成能力，点开卡片在右侧抽屉看一种能力的详细介绍和定义（engine.yaml）。
// 从这里新建任务时，在表单中选择任务属于团队还是哪个项目。也可以导入自定义能力：选择一个定义包，校验声明后
// 加入所选分类。演示只读取和校验声明，不执行其中的命令；CodeGraph 例外：卡片和详情中检测本机是否已安装，未安装时可以安装。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, App, Button, Collapse, Drawer, Select, Spin, Tag, Tooltip, Upload } from 'antd';
import { CheckCircleFilled, ImportOutlined, InboxOutlined } from '@ant-design/icons';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { currentT } from '../../../shared/i18n/index.ts';
import { levelHash } from '../navigation.ts';
import { CapIcon, CardGrid, Fields, InfoTip, ItemCard, Section } from '../components/ui.tsx';
import type { Capability } from '../types.ts';
import { capabilityOf, engineOf, engineText, EXAMPLE, guessCategory, operationText, outputText, readEngine, sourceKind, type EngineDecl } from '../demo/engine.ts';
import { TaskForm } from './tasks.tsx';
import { CodegraphInstall, CodegraphInstallDetail } from '../components/codegraph-install.tsx';

export function Capabilities() {
  const { state: st, go, toast } = useTalents();
  const t = useT();
  const [creating, setCreating] = useState<string | null>(null), [opened, setOpened] = useState<string | null>(null), [importing, setImporting] = useState(false);
  const cap = opened ? st.capabilities.find(c => c.id === opened) : undefined;
  return <div className="page-stack">
    <PageHeader title={t('tnav.capabilities')}
      actions={<Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>{t('cap.import')}</Button>} />
    {st.categories.map(cat => <Section key={cat.id} title={cat.name} info={cat.desc}>
      <CardGrid>{st.capabilities.filter(c => c.cat === cat.id).map(c =>
        <ItemCard key={c.id} icon={<CapIcon cap={c} />} title={c.name} subtitle={c.desc} onClick={() => setOpened(c.id)} extra={<CapTags c={c} />}
          actions={<>{c.id === 'codegraph' && <CodegraphInstall />}<Button size="small" onClick={() => setCreating(c.id)}>{t('tk.newTask')}</Button></>}>
          <Fields rows={[[t('cap.input'), c.inputLabel], [t('cap.output'), c.output]]} />
        </ItemCard>)}</CardGrid>
    </Section>)}
    {cap && <CapabilityDetail cap={cap} onClose={() => setOpened(null)} onCreate={() => { setOpened(null); setCreating(cap.id); }} />}
    {importing && <ImportCapability onClose={() => setImporting(false)} onImported={id => { setImporting(false); setOpened(id); }} />}
    {creating && <TaskForm preset={{ cap: creating }} onClose={() => setCreating(null)} onCreated={(id, started, level) => {
      setCreating(null);
      go(levelHash(level, 'tasks', started ? { open: id } : {}));
      if (!started) toast(t('tk.created'));
    }} />}
  </div>;
}

/** 增量更新 when the capability declares an update (its rule in the tooltip); 已导入 for an imported one. */
const CapTags = ({ c }: { c: Capability }) => {
  const t = useT();
  return <span className="tags">
    {c.update && <Tooltip title={c.update}><Tag color="processing">{t('cap.incremental')}</Tag></Tooltip>}{c.custom && <Tag>{t('cap.imported')}</Tag>}</span>;
};

// ---------- Definition ----------
/** What engine.yaml declares: how the capability is built, updated and checked, and where it writes. */
function Definition({ e, text, builtin }: { e: EngineDecl; text: string; builtin?: boolean }) {
  const t = useT();
  const op = (o: EngineDecl['build'] | undefined) => o && <code className="cmd">{operationText(o)}</code>;
  return <div className="field"><span className="label">{t('cap.definition')}</span>
    <Fields rows={[
      ['ID', <code>{e.id}</code>], [t('rv.version'), <>{e.definitionVersion ?? '—'}{builtin && <Tag className="inline-tag">{t('cap.builtin')}</Tag>}</>],
      [t('cap.execution'), e.build.skill ? 'iCode Skill' : t('cap.command')],
      [t('cap.build'), op(e.build)], [t('cap.update'), e.update ? op(e.update) : '—'],
      !!e.check && [t('cap.check'), op(e.check)],
      [t('cap.outputDir'), outputText(e)], !!e.applications?.length && [t('cap.apps'), e.applications!.map(a => a.name + '（MCP：' + [a.command, ...(a.args ?? [])].join(' ') + '）').join(t('common.listSeparator'))],
    ]} />
    <Collapse size="small" items={[{ key: 'yaml', label: t('cap.viewYaml'), children: <pre className="log yaml">{text}</pre> }]} />
  </div>;
}

// ---------- Detail ----------
function CapabilityDetail({ cap, onClose, onCreate }: { cap: Capability; onClose(): void; onCreate(): void }) {
  const { state: st, update, toast } = useTalents();
  const { modal } = App.useApp();
  const t = useT();
  const e = engineOf(cap), text = engineText(cap);
  const used = st.tasks.some(t => t.cap === cap.id) || st.artifacts.some(a => a.cap === cap.id);
  const remove = () => modal.confirm({ title: t('cap.removeTitle', { name: cap.name }), okText: t('src.removeOk'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
    content: t('cap.removeBody'),
    onOk: () => { update(d => { d.capabilities = d.capabilities.filter(c => c.id !== cap.id); }); onClose(); toast(t('cap.removed')); } });
  return <Drawer open width={600} onClose={onClose} title={<div><div className="caption">{st.categories.find(c => c.id === cap.cat)?.name}</div><div className="title-row">{cap.name}<CapTags c={cap} /></div></div>}
    footer={<div className="drawer-foot">
      {cap.custom && <Tooltip title={used ? t('cap.inUse') : ''}><Button danger disabled={used} onClick={remove}>{t('cap.remove')}</Button></Tooltip>}
      <span className="spacer" />
      <Button type="primary" onClick={onCreate}>{t('tk.newTask')}</Button>
    </div>}>
    <div className="form-body">
      <p className="lead">{cap.desc}</p>
      <div className="field"><span className="label">{t('cap.input')}</span><p>{cap.detail.input}</p></div>
      {cap.detail.abilities.length > 0 && <div className="field"><span className="label">{t('cap.coreAbilities')}</span>
        <div className="cap-abilities">{cap.detail.abilities.map(([name, text], i) => <div key={name} className="cap-ability">
          <span className="cap-ability-index">{i + 1}</span><div><b>{name}</b><div className="caption">{text}</div></div>
        </div>)}</div>
      </div>}
      <div className="field"><span className="label">{t('cap.output')}</span><p>{cap.detail.output}</p></div>
      <div className="field"><span className="label">输出</span><p>{cap.detail.output}</p></div>
      {cap.id === 'codegraph' && <CodegraphInstallDetail />}
      {e && text && <Definition e={e} text={text} builtin={!cap.custom} />}
    </div>
  </Drawer>;
}

// ---------- Import ----------
interface Picked { name: string; files: string[]; text: string | null }
/** Checks a definition package like Talents' registration: only engine.yaml, README.md, scripts/ and skills/ at the
 *  root, a valid declaration, and an id not taken; stops at the first problem. */
function check(st: { capabilities: Capability[] }, p: Picked): { engine?: EngineDecl; error?: string; checks: string[] } {
  const checks: string[] = [];
  const odd = p.files.map(f => f.split('/')[0]).find(top => !['engine.yaml', 'README.md', 'scripts', 'skills', '.DS_Store'].includes(top));
  if (odd) return { checks, error: currentT('cap.errRootFiles', { name: odd }) };
  if (p.text == null) return { checks, error: currentT('cap.errNoEngine') };
  checks.push(currentT('cap.checkStructure'));
  const read = readEngine(p.text);
  if ('error' in read) return { checks, error: read.error };
  checks.push(currentT('cap.checkEngine'));
  const e = read.engine;
  const refs = [e.build, e.update, e.install, e.uninstall, e.check].flatMap(o => (o?.args ?? []).filter(a => a.startsWith('${package.root}/')).map(a => a.slice('${package.root}/'.length)));
  const missing = p.files.length > 1 ? refs.find(r => !p.files.includes(r)) : undefined;
  if (missing) return { checks, error: currentT('cap.errMissingRef', { path: missing }) };
  if (refs.length) checks.push(currentT('cap.checkRefs'));
  if (st.capabilities.some(c => c.id === e.id)) return { checks, error: currentT('cap.errDuplicateId', { id: e.id }) };
  checks.push(currentT('cap.checkId'));
  if (!sourceKind(e)) return { checks, error: currentT('cap.errSourceKind') };
  return { engine: e, checks };
}

function ImportCapability({ onClose, onImported }: { onClose(): void; onImported(id: string): void }) {
  const { state: st, update, toast } = useTalents();
  const t = useT();
  const [picked, setPicked] = useState<Picked | null>(null), [checking, setChecking] = useState(false), [cat, setCat] = useState<string | null>(null);
  const result = useMemo(() => picked && !checking ? check(st, picked) : null, [picked, checking, st]), e = result?.engine;
  useEffect(() => { setCat(result?.engine ? guessCategory(result.engine) : null); }, [result]);
  const pick = (p: Picked) => { setPicked(p); setChecking(true); setTimeout(() => setChecking(false), 1100); };
  // A folder (every file, engine.yaml at its root) or engine.yaml alone.
  const readFiles = async (files: File[]) => {
    const rel = files.map(f => ({ f, path: (f.webkitRelativePath || f.name).split('/').slice(f.webkitRelativePath ? 1 : 0).join('/') }));
    const yaml = rel.find(x => x.path === 'engine.yaml' || x.path === 'engine.yml');
    pick({ name: files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : files[0].name, files: rel.map(x => x.path), text: yaml ? await yaml.f.text() : null });
  };
  const confirm = () => {
    const c = capabilityOf(e!, picked!.text!, cat!);
    update(d => { d.capabilities.push(c); });
    toast(t('cap.importedToast', { name: c.name }));
    onImported(c.id);
  };
  const batch = useRef<File[]>([]);
  const uploadProps = (directory: boolean) => ({
    showUploadList: false, multiple: directory, directory, accept: directory ? undefined : '.yaml,.yml',
    beforeUpload: (file: File, list: File[]) => {
      // Upload calls this once per file; read the whole selection once.
      if (batch.current !== list) { batch.current = list; void readFiles(list); }
      return false;
    },
  });
  let body: ReactNode;
  if (!picked) body = <>
    <Upload.Dragger {...uploadProps(true)} className="import-drop">
      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
      <p>{t('cap.dropFolder')}</p>
    </Upload.Dragger>
    <div className="import-alt"><Upload {...uploadProps(false)}><Button size="small">{t('cap.chooseYaml')}</Button></Upload>
      <Button size="small" type="link" onClick={() => pick({ name: EXAMPLE.folder, files: EXAMPLE.files, text: EXAMPLE.text() })}>{t('cap.useExample')}</Button></div>
  </>;
  else body = <>
    <div className="pick-summary"><span><b>{picked.name}</b> <span className="section-count">{t('cap.fileCount', { count: picked.files.length })}</span></span><Button size="small" onClick={() => setPicked(null)}>{t('tk.reselect')}</Button></div>
    {checking ? <Spin size="small" /> : <>
      <ul className="check-list">{result!.checks.map(c => <li key={c}><CheckCircleFilled /> {c}</li>)}</ul>
      {result!.error && <Alert type="error" showIcon title={result!.error} />}
      {e && <>
        <div><h3 className="block-title">{e.name}</h3>{e.description && <p className="lead">{e.description}</p>}</div>
        <div className="field"><span className="label">{t('cap.category')}</span><Select value={cat} onChange={setCat} options={st.categories.map(c => ({ value: c.id, label: c.name }))} /></div>
        <Definition e={e} text={picked.text!} />
        <Alert type="warning" showIcon title={<>{t('cap.trustWarning')} <InfoTip>{t('cap.trustTip')}</InfoTip></>} />
      </>}
    </>}
  </>;
  return <Drawer open width={600} onClose={onClose} title={<>{t('cap.import')} <InfoTip>{t('cap.importTip')}</InfoTip></>}
    footer={<div className="drawer-foot"><span className="spacer" />
      <Button onClick={onClose}>{t('common.cancel')}</Button><Button type="primary" disabled={!e || !cat} onClick={confirm}>{t('cap.doImport')}</Button></div>}>
    <div className="form-body">
      {body}
    </div>
  </Drawer>;
}
