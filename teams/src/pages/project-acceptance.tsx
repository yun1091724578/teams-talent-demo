import { useState } from 'react';
import { Alert, Button, Input, Modal, Space, Table, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { ActionButton, MiniStat, StatusLine } from '../components/common.js';
import { runCashbackChecks } from '../cashback.js';
export function ProjectAcceptance() {
  const { state, role, perform, busy, showEvidence, navigate } = useDemo();
  const t = useT();
  const [returning, setReturning] = useState(false), [reason, setReason] = useState('');
  const submitted = state.stage === 'submitted', accepted = state.stage === 'accepted';
  const cases = runCashbackChecks();
  const reward = state.transactions.reduce((sum, item) => sum + item.reward, 0);
  return <div className="page-stack">
    {accepted ? <Alert type="success" showIcon title={t('acc.accepted')} description={t('acc.acceptedBody')} action={<Button onClick={() => navigate('trace')}>{t('acc.viewTrace')}</Button>} /> : !submitted && <Alert type="info" showIcon title={t('acc.awaitingSubmit')} />}
    <div className="acceptance-layout"><FrameworkCard title={t('acc.cardTitle')}><div className="bank-card"><div><span>CardDemo</span><Tag>{t('acc.cardTier')}</Tag></div><div className="bank-chip" /><strong>••••  ••••  ••••  9900</strong><small>{t('acc.holder')}</small></div><div className="campaign"><Tag color="purple">{t('acc.exclusive')}</Tag><h2>{t('acc.campaignTitle')}</h2><div className="cashback-number">0.5<span>{t('acc.extraCashback')}</span></div><p>{t('acc.campaignNote')}</p><Button size="small" onClick={() => showEvidence('E1')}>{t('acc.viewRuleBasis')}</Button></div></FrameworkCard>
    <div className="page-stack"><FrameworkCard title={t('acc.txTitle')}><div className="business-stats"><MiniStat label={t('acc.balance')} value={'¥' + state.balance.toFixed(2)} /><MiniStat label={t('acc.reward')} value={'¥' + reward.toFixed(2)} /></div><div className="acceptance-actions"><ActionButton action="purchase" role="owner" disabled={!submitted || state.transactions.length > 0}>{t('acc.purchase')}</ActionButton><ActionButton action="deduplicate" role="owner" disabled={!submitted || !state.transactions.length || state.duplicateChecked} primary={false}>{t('acc.verifyDuplicate')}</ActionButton></div>{state.transactions.length > 0 && <div className="reward-record"><CheckCircleOutlined /><div><strong>{t('acc.rewardRecord', { amount: reward.toFixed(2) })}</strong><small>{t('acc.sameTx')}</small></div><Tag color="green">{t('acc.oneRecord')}</Tag></div>}{state.duplicateChecked && <Alert type="success" title={t('acc.noDuplicate')} description={t('acc.noDuplicateBody')} />}<p className="muted">{t('acc.isolated')}</p></FrameworkCard>
    <FrameworkCard title={t('acc.progressTitle')}><StatusLine complete={!!state.transactions.length}>{t('acc.step1')}</StatusLine><StatusLine complete={state.duplicateChecked}>{t('acc.step2')}</StatusLine><StatusLine complete={state.uat}>{t('acc.step3')}</StatusLine></FrameworkCard></div></div>
    <FrameworkCard title={t('acc.rulesTitle')}><Table size="small" pagination={false} rowKey="id" dataSource={cases} columns={[{ title: t('acc.colScenario'), dataIndex: 'label' }, { title: t('acc.colExpected'), dataIndex: 'expected' }, { title: t('acc.colResult'), render: (_, row) => state.uat ? <Tag color={row.passed ? 'green' : 'red'}>{row.passed ? t('acc.passes') : t('acc.pending')}</Tag> : <Tag>{t('acc.unverified')}</Tag> }]} /><div className="card-actions"><ActionButton action="uat" role="owner" disabled={!submitted || !state.duplicateChecked || state.uat}>{t('acc.verifyAll')}</ActionButton><Button onClick={() => showEvidence('E2')}>{t('acc.viewRuleNote')}</Button></div></FrameworkCard>
    <FrameworkCard title={t('acc.conclusionTitle')}><p>{t('acc.conclusion')}</p><Space wrap><ActionButton action="accept" role="owner" disabled={!submitted || !state.uat || state.checks !== 'passed'}>{accepted ? t('acc.acceptedAction') : t('acc.acceptAction')}</ActionButton><Button disabled={!submitted || role !== 'owner'} onClick={() => setReturning(true)}>{t('acc.returnAction')}</Button></Space></FrameworkCard>
    <Modal open={returning} title={t('acc.returnTitle')} okText={t('acc.returnOk')} confirmLoading={busy} okButtonProps={{ disabled: !reason.trim() }} onCancel={() => setReturning(false)} onOk={async () => { if (await perform('return', reason)) { setReturning(false); setReason(''); } }}><p>{t('acc.returnBody')}</p><Input.TextArea aria-label={t('acc.returnReasonAria')} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={4} placeholder={t('acc.returnPlaceholder')} /></Modal>
  </div>;
}
