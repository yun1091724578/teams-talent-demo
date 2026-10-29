// 个人设置：从侧边栏左下角的头像进入（与 iCode Teams 一致）。演示数据的重置放在这里，不在顶栏露出，演示时看不到。
import { Button, Popconfirm } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { FrameworkCard, PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useT } from '../i18n.tsx';
import { home } from '../navigation.ts';
import { useTalents } from '../store.tsx';

export function Account() {
  const { role, go, reset, toast } = useTalents();
  const t = useT();
  const resetDemo = () => reset().then(() => { go('#/' + home[role]); toast(t('ac.resetDone')); }, e => toast(t('ac.resetFailed', { error: (e as Error).message })));
  return <div className="page-stack">
    <PageHeader title={t('ac.title')} description={t('ac.description')} />
    <FrameworkCard title={t('ac.cardTitle')}>
      <p>{t('ac.resetBody')}</p>
      <p className="muted">{t('ac.resetNote')}</p>
      <Popconfirm title={t('ac.confirmTitle')} description={t('ac.confirmBody')} okText={t('ac.confirmOk')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={resetDemo}>
        <Button danger icon={<ReloadOutlined />}>{t('ac.reset')}</Button>
      </Popconfirm>
    </FrameworkCard>
  </div>;
}
