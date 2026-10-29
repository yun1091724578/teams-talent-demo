import { useState } from 'react';
import { Button, Empty, Form, Input, List, Modal, Select, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { canLinkTaskSession, collectTaskSessions, mainTask, taskAutomation } from '../task-automation.js';
import { projectDeliveryTasks } from '../project-delivery-tasks.js';
export function TaskSessions({ node, readonly = false,scope=mainTask }: { node?: 'develop' | 'verify'; readonly?: boolean; scope?:typeof mainTask }) {
  const { state, role, busy, update } = useDemo();
  const t = useT();
  const [open,setOpen]=useState(false);const [form]=Form.useForm();
  if (role === 'member' && !projectDeliveryTasks(state, scope.projectId, role).some(task => task.id === scope.taskId)) return null;
  const sessions=collectTaskSessions(state,scope).filter(session=>!node||session.nodeIds.includes(node)),collection=taskAutomation(state,scope)?.collection;
  const canLink=!readonly && !!node && canLinkTaskSession(state,role,scope,node);
  const collectionStatus = (status: string) => t(({ queued: 'st.queued', running: 'st.running', collected: 'st.collected', empty: 'st.empty', failed: 'st.failed' } as const)[status as 'queued' | 'running' | 'collected' | 'empty' | 'failed']);
  const reported = (status?: string) => status === 'reported' ? (collection!.reporting!.receipt?.id.startsWith('SHARED-') ? t('ts.reportedShared') : collection!.reporting!.receipt?.id.startsWith('TALENT-INBOX-') ? t('ts.reportedTalent') : t('ts.reportedReceipt')) : status === 'failed' ? t('ts.reportFailed') : status === 'uploading' ? t('ts.reportUploading') : collectionStatus(collection!.status);
  return <FrameworkCard title={t('ts.cardTitle')} action={<Tag>{t('ts.count', { count: sessions.length })}</Tag>}>
    <List size="small" dataSource={sessions} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ts.empty')}/>}} renderItem={item=><List.Item><div><strong>{item.tool} · {item.sessionId}</strong><p className="muted">{item.nodeIds.map(node=>node==='develop'?t('phase.developing'):t('phase.verifying')).join(' / ')} · {item.sources.join(t('common.listSeparator'))}</p></div></List.Item>}/>
    {canLink && <Button aria-label={t('ts.linkAria')} onClick={()=>{form.resetFields();setOpen(true);}}>{t('ts.linkSession')}</Button>}
    <p className="muted">{t('ts.footer')}</p>
    {collection && <p>{t('ts.collectionPrefix')}{reported(collection.reporting?.status)} · {t('ts.count', { count: collection.sessions.length })}{collection.finishedAt?' · '+new Date(collection.finishedAt).toLocaleString('zh-CN'):''}</p>}
    <Modal title={t('ts.modalTitle')} open={open && canLink} onCancel={()=>setOpen(false)} okText={t('ts.link')} cancelText={t('common.cancel')} confirmLoading={busy} okButtonProps={{'aria-label':t('ts.saveAria'),disabled:busy}} cancelButtonProps={{disabled:busy}} closable={!busy} maskClosable={!busy} onOk={()=>form.submit()}><Form form={form} layout="vertical" initialValues={{tool:'icode',sessionId:''}} disabled={busy} onFinish={async values=>{if(!canLink)return;if(await update('session.link',{...scope,nodeId:node,...values}))setOpen(false);}}><Form.Item name="tool" label={t('ts.tool')}><Select aria-label={t('ts.toolAria')} options={[{value:'icode',label:'iCode'},{value:'opencode',label:'OpenCode'}]}/></Form.Item><Form.Item name="sessionId" label={t('ts.sessionId')} rules={[{required:true,whitespace:true}]}><Input aria-label={t('ts.sessionIdAria')} maxLength={200}/></Form.Item></Form><p className="muted">{t('ts.modalNote')}</p></Modal>
  </FrameworkCard>;
}
