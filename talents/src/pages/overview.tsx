// 总体规划：Talents 未来总体规划的介绍（原稿 carddemo/overview.html，正文在 src/overview/，配色改用 Talents 主题）。
// 从右上角的书本图标进入。正文里的目录和交叉引用是 #<id> 锚点，会和 #/<page> 路由冲突，所以在这里拦下来改为滚动到对应位置。
import { useEffect, useRef, type MouseEvent } from 'react';
import { Tag } from 'antd';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useT } from '../i18n.tsx';
import doc from '../overview/overview.html';
import '../overview/overview.css';

export function Overview() {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  // 正文只在挂载时写入一次，不交给 React 渲染：路由连续更新时 React 可能重写 innerHTML，目录高亮就挂到了旧节点上。
  // 目录高亮当前读到的一节：取顶端已滚过的最后一节。
  useEffect(() => {
    const root = ref.current!, scroller = root.closest('.page-scroll')!;
    root.innerHTML = doc;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.rail a[href^="#"]')];
    const targets = links.map(a => document.getElementById(a.getAttribute('href')!.slice(1)));
    const spy = () => {
      const top = scroller.getBoundingClientRect().top + 24;
      let current = 0;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= top) current = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === current));
    };
    spy();
    scroller.addEventListener('scroll', spy, { passive: true });
    return () => scroller.removeEventListener('scroll', spy);
  }, []);
  const follow = (e: MouseEvent) => {
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    const target = href?.startsWith('#') && !href.startsWith('#/') ? document.getElementById(href.slice(1)) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <div className="page-stack">
    <PageHeader title={t('tov.pageTitle')} description={t('tov.pageDescription')}
      actions={<span className="actions"><Tag color="purple">v3.0</Tag><Tag>{t('tov.lite')}</Tag><span className="caption">{t('tov.lastUpdated', { date: '2026-10-28' })}</span></span>} />
    <div ref={ref} className="overview-doc" onClick={follow} />
  </div>;
}
