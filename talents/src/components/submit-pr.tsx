import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Steps } from 'antd';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { pullRequestTarget } from '../api.ts';
import type { Artifact, Submission } from '../types.ts';
import type { Suggestion } from '../demo/suggestions.ts';
import { artifact } from '../demo/model.ts';
import { now } from '../demo/format.ts';

export function SubmissionLink({ submission }: { submission: Submission }) {
  const t = useT();
  return <div className="update-note"><b>{t('ui.prCreated')}</b><a href={submission.url} target="_blank" rel="noreferrer">{t('sub.view')}</a><span className="caption">{submission.repository} · {submission.base}</span></div>;
}

/** The steps server/pull-requests.ts reports, in order. */
const STEP_KEYS = ['sub.stepReadBranch', 'sub.stepCheckFiles', 'sub.stepBuildCommit', 'sub.stepCreateBranch', 'sub.stepCreatePr'] as const;

export function SubmitDialog({ a, suggestion, onClose }: { a: Artifact; suggestion?: Suggestion; onClose(): void }) {
  const { submit, update, toast, teamsLink } = useTalents();
  const t = useT();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [step, setStep] = useState<number | null>(null);
  const [noTarget, setNoTarget] = useState('');
  const [form] = Form.useForm();
  // The origin and base branch of the code repository bound to the project in Teams; a PR submitted before keeps its target.
  useEffect(() => {
    if (a.kind === 'index' || !a.projectId || a.submission) return;
    pullRequestTarget(a.projectId).then(target => form.setFieldsValue({ repository: target.repository, base: target.base }), e => setNoTarget((e as Error).message));
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (a.kind === 'index') return <Modal open title={t('rv.enableRemoteIndex')} okText={t('sub.enable')} onCancel={onClose} onOk={() => {
    update(d => { const x = artifact(d, a.id)!; x.published = { version: (x.published?.version ?? 0) + 1, at: now(), note: t('sub.indexReady'), delivery: 'cloud', basis: x.draft?.basis }; x.draft = null; });
    onClose(); toast(t('sub.indexReady'));
  }}><p>{t('sub.indexNote')}</p></Modal>;
  return <Modal open title={suggestion ? t('traj.submitPr') : t('sub.titleKnowledge')} okText={t('sub.submit')} cancelText={t('common.cancel')} confirmLoading={busy} onCancel={busy ? undefined : onClose} cancelButtonProps={{ disabled: busy }} onOk={() => form.submit()}>
    {step !== null && <Steps className="submit-steps" size="small" progressDot current={step} status={error ? 'error' : busy ? 'process' : 'finish'} items={STEP_KEYS.map((key, i) => ({ title: busy && i === step ? t(key) + '…' : t(key) }))} />}
    {error && <Alert type="error" showIcon title={t('sub.failed')} description={error} />}
    {noTarget && !error && <Alert type="info" showIcon title={t('sub.noTarget')} description={<>{noTarget} <a href={teamsLink(a.projectId)}>{t('sub.configureInTeams')}</a></>} />}
    <Form form={form} layout="vertical" initialValues={{ repository: a.submission?.repository ?? '', base: a.submission?.base ?? 'main', note: suggestion?.title ?? a.name, skillDirectory: '.agents/skills/' + suggestion?.skill }} onFinish={async values => {
      setBusy(true); setError(''); setStep(0);
      try { await submit({ ...values, artifactId: a.id, suggestionId: suggestion?.id }, setStep); onClose(); toast(t('ui.prCreated')); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <Form.Item name="repository" label={t('sub.repo')} rules={[{ required: true, pattern: /^[\w.-]+\/[\w.-]+$/, message: t('sub.repoRequired') }]}><Input placeholder="owner/repo" /></Form.Item>
      <Form.Item name="base" label={t('sub.base')} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      {suggestion?.kind === 'skill' && <Form.Item name="skillDirectory" label={t('sub.skillDir')} rules={[{ required: true }]}><Input /></Form.Item>}
      <Form.Item name="note" label={t('sub.note')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={2} /></Form.Item>
    </Form>
  </Modal>;
}
