// 个人设置：从侧边栏左下角的头像进入（与 iCode Teams 一致）。演示数据的重置放在这里，不在顶栏露出，演示时看不到。
import { Button, Popconfirm } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { FrameworkCard, PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { home } from '../navigation.ts';
import { useTalents } from '../store.tsx';

export function Account() {
  const { role, go, reset, toast } = useTalents();
  const resetDemo = () => reset().then(() => { go('#/' + home[role]); toast('已恢复初始数据'); }, e => toast('重置失败：' + (e as Error).message));
  return <div className="page-stack">
    <PageHeader title="个人设置" description="维护本地演示数据。" />
    <FrameworkCard title="数据维护">
      <p>重置会清除新登记的本地文档来源、任务、修订和提交记录，恢复到初始状态。</p>
      <p className="muted">团队、成员和项目来自 iCode Teams，不受影响。</p>
      <Popconfirm title="重置数据？" description="新登记的本地文档来源、任务、修订和提交记录会被清除，恢复到初始状态。此操作无法撤销。" okText="确认重置" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={resetDemo}>
        <Button danger icon={<ReloadOutlined />}>重置数据</Button>
      </Popconfirm>
    </FrameworkCard>
  </div>;
}
