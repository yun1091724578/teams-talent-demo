import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Steps } from 'antd';
import { useTalents } from '../store.tsx';
import { pullRequestTarget } from '../api.ts';
import type { Artifact, Submission } from '../types.ts';
import type { Suggestion } from '../demo/suggestions.ts';
import { artifact } from '../demo/model.ts';
import { now } from '../demo/format.ts';

export function SubmissionLink({ submission }: { submission: Submission }) {
  return <div className="update-note"><b>PR 已创建</b><a href={submission.url} target="_blank" rel="noreferrer">查看 PR</a><span className="caption">{submission.repository} · {submission.base}</span></div>;
}

/** The steps server/pull-requests.ts reports, in order. */
const STEPS = ['读取分支', '核对文件', '生成提交', '创建分支', '创建 PR'];

export function SubmitDialog({ a, suggestion, onClose }: { a: Artifact; suggestion?: Suggestion; onClose(): void }) {
  const { submit, update, toast, teamsLink } = useTalents();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [step, setStep] = useState<number | null>(null);
  const [noTarget, setNoTarget] = useState('');
  const [form] = Form.useForm();
  // The origin and base branch of the code repository bound to the project in Teams; a PR submitted before keeps its target.
  useEffect(() => {
    if (a.kind === 'index' || !a.projectId || a.submission) return;
    pullRequestTarget(a.projectId).then(t => form.setFieldsValue({ repository: t.repository, base: t.base }), e => setNoTarget((e as Error).message));
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (a.kind === 'index') return <Modal open title="启用远端索引" okText="启用" onCancel={onClose} onOk={() => {
    update(d => { const x = artifact(d, a.id)!; x.published = { version: (x.published?.version ?? 0) + 1, at: now(), note: '远端索引已就绪', delivery: 'cloud', basis: x.draft?.basis }; x.draft = null; });
    onClose(); toast('远端索引已就绪');
  }}><p>索引保留在远端，可通过 MCP 在线查询。</p></Modal>;
  return <Modal open title={suggestion ? '提交改进 PR' : '提交知识 PR'} okText="提交 PR" cancelText="取消" confirmLoading={busy} onCancel={busy ? undefined : onClose} cancelButtonProps={{ disabled: busy }} onOk={() => form.submit()}>
    {step !== null && <Steps className="submit-steps" size="small" progressDot current={step} status={error ? 'error' : busy ? 'process' : 'finish'} items={STEPS.map((title, i) => ({ title: busy && i === step ? title + '…' : title }))} />}
    {error && <Alert type="error" showIcon title="提交失败" description={error} />}
    {noTarget && !error && <Alert type="info" showIcon title="没有默认的目标仓库" description={<>{noTarget} <a href={teamsLink(a.projectId)}>去 iCode Teams 配置</a></>} />}
    <Form form={form} layout="vertical" initialValues={{ repository: a.submission?.repository ?? '', base: a.submission?.base ?? 'main', note: suggestion?.title ?? a.name, skillDirectory: '.agents/skills/' + suggestion?.skill }} onFinish={async values => {
      setBusy(true); setError(''); setStep(0);
      try { await submit({ ...values, artifactId: a.id, suggestionId: suggestion?.id }, setStep); onClose(); toast('PR 已创建'); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <Form.Item name="repository" label="GitHub 仓库" rules={[{ required: true, pattern: /^[\w.-]+\/[\w.-]+$/, message: '请输入 owner/repo' }]}><Input placeholder="owner/repo" /></Form.Item>
      <Form.Item name="base" label="目标分支" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      {suggestion?.kind === 'skill' && <Form.Item name="skillDirectory" label="仓内 Skill 目录" rules={[{ required: true }]}><Input /></Form.Item>}
      <Form.Item name="note" label="提交说明" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={2} /></Form.Item>
    </Form>
  </Modal>;
}
