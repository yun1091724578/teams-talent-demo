import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Select, Space, Spin } from 'antd';
import { applySkillApplication, getSkillApplication } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentSystemContext } from '../system-links.js';

type Plan = Awaited<ReturnType<typeof getSkillApplication>>;
type Receipt = Awaited<ReturnType<typeof applySkillApplication>>;

/** Subscription installation is separate from the task's selected and frozen inputs. */
export function SkillApplication({ resourceId, version, sha256, projectId: initialProject }: { resourceId: string; version: string; sha256: string; projectId?: string }) {
  const { state, data, role } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false), [projectId, setProjectId] = useState(initialProject ?? currentSystemContext().projectId);
  const [plan, setPlan] = useState<Plan>(), [receipt, setReceipt] = useState<Receipt>();
  const [receiptDetails, setReceiptDetails] = useState(false);
  const [loading, setLoading] = useState(false), [applying, setApplying] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const requestId = useRef('');
  const scopeKey = `${role}:${projectId}:${resourceId}:${version}:${sha256}`;
  const activeScope = useRef(scopeKey); activeScope.current = scopeKey;
  const projects = [{ value: 'carddemo', label: state.workspace.project.name }, { value: 'teams', label: data.teamsProject.project.name }, ...(state.workspace.projects ?? []).map(project => ({ value: project.id, label: project.name }))];
  const userName = state.workspace.team.members.find(item => item.id === role)?.name ?? '';
  useEffect(() => { setOpen(false); setReceipt(undefined); }, [role, resourceId, version, sha256]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setPlan(undefined); setReceipt(undefined); setReceiptDetails(false); setError(''); setLoading(true); setApplying(false); requestId.current = crypto.randomUUID();
    void getSkillApplication(role, { projectId, resourceId, version, sha256 }).then(value => { if (active) setPlan(value); }, cause => { if (active) setError((cause as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, scopeKey, retry]);
  const apply = async () => {
    if (!plan?.canApply || applying) return;
    const key = scopeKey;
    setApplying(true); setError('');
    try {
      const result = await applySkillApplication(role, { projectId, resourceId, version, sha256, planToken: plan.planToken, requestId: requestId.current });
      if (activeScope.current === key) setReceipt(result);
    } catch (cause) { if (activeScope.current === key) setError((cause as Error).message); }
    finally { if (activeScope.current === key) setApplying(false); }
  };
  return <>
    <Button size="small" data-skill-apply={resourceId} aria-label={t('res.applyAria', { name: resourceId })} onClick={() => setOpen(true)}>{t('res.apply')}</Button>
    <Modal title={t('res.applyTitle', { name: resourceId })} open={open} width={680} closable={!applying} maskClosable={!applying} onCancel={() => setOpen(false)} footer={receipt ? <Button type="primary" aria-label={t('res.done')} onClick={() => setOpen(false)}>{t('res.done')}</Button> : <Space><Button aria-label={t('common.cancel')} disabled={applying} onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="primary" data-skill-apply-confirm loading={applying} disabled={loading || !plan?.canApply} onClick={() => void apply()}>{error && plan ? t('res.applyRetry') : t('res.applyConfirm')}</Button></Space>}>
      <div className="page-stack">
        <p>{t('res.applyNote')}</p>
        <p className="muted">{t('res.applyUsersNote')}</p>
        <Select aria-label={t('res.applyProjectAria')} value={projectId} options={projects} disabled={applying || !!receipt} onChange={setProjectId} />
        {loading && <Spin tip={t('res.applyVerifying')}><div style={{ minHeight: 48 }} /></Spin>}
        {error && <Alert type="error" showIcon title={t('res.applyFailed')} description={error} action={!plan && <Button onClick={() => setRetry(value => value + 1)}>{t('res.applyReverify')}</Button>} />}
        {plan && !receipt && <><Descriptions column={1} size="small" items={[{ key: 'user', label: t('res.applyUser'), children: userName }, { key: 'version', label: t('res.applyVersion'), children: version }, { key: 'project', label: t('res.applyProject'), children: plan.projectName }, { key: 'directory', label: t('res.applyDirectory'), children: <code style={{ overflowWrap: 'anywhere' }}>{plan.targetDirectory || t('res.applyUnconfirmed')}</code> }, { key: 'skill', label: t('res.applyPath'), children: <code style={{ overflowWrap: 'anywhere' }}>{plan.skillDirectory || t('res.applyPathPending')}</code> }, { key: 'sha', label: t('res.applyHash'), children: <code style={{ overflowWrap: 'anywhere' }}>{sha256}</code> }]} />{!plan.canApply && <Alert type="warning" title={t('res.applyBlocked')} description={plan.reason} />}</>}
        {receipt && <><Alert type={receipt.discovery.status === 'discovered-and-read' ? 'success' : 'warning'} showIcon title={receipt.status === 'already-applied' ? t('res.appliedAlready') : t('res.appliedFiles')} description={receipt.note} /><Descriptions column={1} size="small" items={[{ key: 'version', label: t('res.appliedVersion'), children: receipt.version }, { key: 'directory', label: t('res.applyDirectory'), children: <code style={{ overflowWrap: 'anywhere' }}>{receipt.targetDirectory}</code> }, { key: 'path', label: t('res.skillPath'), children: <code style={{ overflowWrap: 'anywhere' }}>{receipt.skillDirectory}</code> }, { key: 'discovery', label: t('res.discovery'), children: receipt.discovery.status === 'discovered-and-read' ? t('res.discovered') : receipt.discovery.status === 'failed' ? t('res.discoveryFailed') : t('res.notVerified') }, { key: 'hash', label: t('res.applyHash'), children: <code style={{ overflowWrap: 'anywhere' }}>{receipt.sha256}</code> }]} /><Button aria-expanded={receiptDetails} onClick={() => setReceiptDetails(value => !value)}>{t('res.viewReceipt')}</Button>{receiptDetails && <pre className="evidence-console" data-skill-application-receipt style={{ maxHeight: 280, overflow: 'auto' }}>{JSON.stringify(receipt, null, 2)}</pre>}<p>{receipt.discovery.note}</p><p className="muted">{t('res.applyFooter')}</p></>}
      </div>
    </Modal>
  </>;
}
