# vendor 补丁清单

`teams/src/vendor/teams/**` 与 `talents/src/vendor/teams/**` 是从上游整段拷贝的代码。国际化只能改文件，因此每次改动登记在这里；同步上游后按清单重放，并检查锚点是否还存在。

补丁机制：vendor 内的文案统一走 `vendor/teams/i18n.ts` 的 `vt(key, vars)`，locale 由应用层的 `LocaleProvider` 写入。不直接 import 应用的词表。

---

## teams/src/vendor/teams

### 新增文件（非补丁）

| 文件 | 作用 |
|---|---|
| `i18n.ts` | 转出 `currentT as vt`，指向 `shared/i18n` 的 ambient locale（由 `LocaleProvider` 写入） |

### `components/framework-sidebar.tsx`

| 锚点（grep） | 原文 | 现在 |
|---|---|---|
| `connectionLabel =` | `'本地服务已连接' / '本地服务未连接'` | `vt('sidebar.connectionOnline' / 'sidebar.connectionOffline')` |
| `themeLabel =` | `'切换到浅色模式' / '切换到深色模式'` | `vt('sidebar.themeToLight' / 'sidebar.themeToDark')` |
| `<nav aria-label=` | `应用导航` | `vt('sidebar.navigation')` |
| `className="nav-group" aria-label=` | `` `折叠${group.title}` `` | `vt('sidebar.collapseGroup', { name: groupTitle })` |
| `group.title`（分组标题渲染） | `group.title` | `vt(group.titleKey)` |
| `className="project-expand" aria-label=` | `` `展开或收起${page.title}目录` `` | `vt('sidebar.togglePage', { name: page.title })` |
| `'emptyMessage' in group` | `group.emptyMessage` | `'emptyKey' in group` → `vt(group.emptyKey)` |
| `Tooltip title=`（头像） | `个人信息与设置` | `vt('sidebar.profile')` |
| `account?.nickname ??` | `个人信息` | `vt('sidebar.profileShort')` |
| `menu={{ items:` | `个人信息` / `客户端设置` | `vt('sidebar.profileShort')` / `vt('sidebar.clientSettings')` |
| `sidebar-profile-menu` Button `aria-label` | `打开个人信息与设置菜单` | `vt('sidebar.profileMenu')` |
| `sidebar-resize-handle` `aria-label` | `调整导航宽度` | `vt('sidebar.resize')` |
| `onDoubleClick={() => onResize(220)}` 下一行 `title=` | `拖动调整导航宽度，双击恢复默认宽度` | `vt('sidebar.resizeHint')` |

### `components/page-layout.tsx`

| 锚点 | 原文 | 现在 |
|---|---|---|
| `PageToolbar` `aria-label` | `页面工具栏` | `vt('layout.pageToolbar')` |
| `SettingsLayout` `aria-label` | `个人信息导航` | `vt('layout.profileNavigation')` |

### `contracts/navigation.ts`

| 字段 | 原文 | 现在 |
|---|---|---|
| `title`（4 个分组） | `个人空间` / `团队空间` / `共享能力` / `自定义` | `titleKey`，由 `framework-sidebar` 渲染时翻译 |
| `emptyMessage` | `暂无独立扩展页面` | `emptyKey` |

`NavigationGroupId` 仍由 `id` 推导，未受影响。

---

### `agent-management/`（2026-10-29）

| 文件 | 改动 | 条数 |
|---|---|---:|
| `index.ts` | 挂载模板的 aria-label / 标题 / 按钮，以及 `draw()`、`refresh()` 的全部状态消息 → `vt('am.page.*' / 'am.msg.*')` | 42 |
| `configuration-controls.ts` | 集合控件标签、按钮、校验消息 → `vt('am.collection.*')` | 20 |
| `configuration-library.ts` | 13 条错误消息 → `vt('am.library.*')` | 14 |
| `ui-contract.ts` | `confirmAction` 默认按钮 → `vt('common.cancel' / 'common.confirm')` | 2 |
| `configuration-editor.ts` | 挂载模板的全部按钮/aria/占位、列表与弹窗状态消息、资源库提示、校验文案 → `vt('am.cfg.*')` | 62 |

`am.*` 词条放在 `shared/i18n/messages/`，vendor 侧只通过 `vt()` 读取，不 import 应用词表。

### `resources/catalog.tsx`（2026-10-29）

| 锚点（grep） | 原文 | 现在 |
|---|---|---|
| `查看详情` | 资源卡片/列表行的详情入口 | `vt('res.viewDetail')` |
| `项目已选择` | 卡片状态行 | `vt('res.card.*')` |

---

## `work/confirm-work.tsx`（2026-10-29，teams）

| 锚点（grep） | 原文 | 现在 |
|---|---|---|
| `将开始「` | 启动确认卡的说明 | `vt('wl.confirmIntro')` |
| `角色：` | 实例/目录/角色/模型一行 | `vt('wl.confirmScope')` |
| `启动结果待核对：` | 启动失败提示 | `vt('wl.startPending')` |
| `重试原启动请求` | 重试按钮与 aria | `vt('wl.retryStart')` |

`confirmLabel` / `pendingLabel` 的默认值也改为 `vt('wl.startWork')` / `vt('wl.launching')`（调用方本来就会覆盖）。

---

## talents 侧 vendor 拷贝（已同步，2026-10-29）

`talents` 有一份独立的 `src/vendor/teams` 拷贝，本次已按同样的方式打补丁，两端补丁必须保持一致：

| 文件 | 改动 |
|---|---|
| `src/vendor/teams/i18n.ts` | **新增**，`export { currentT as vt }`，与 teams 一致 |
| `components/framework-sidebar.tsx` | 连接/主题/导航 aria、个人信息菜单、宽度调整提示 → `vt('sidebar.*')` |
| `contracts/navigation.ts` | 分组标题改为 `titleKey`（`nav.group.*`），`emptyMessage` → `emptyKey` |
| `components/page-layout.tsx` | `页面工具栏` / `个人信息导航` → `vt('layout.*')` |

`design-system.ts` 里的中文是 CSS 注释（两端各 1 处），不是界面文案，不处理。

---

## 同步上游的检查方法

```bash
# 每个锚点仍应存在
grep -n "sidebar.connectionOnline" teams/src/vendor/teams/components/framework-sidebar.tsx
grep -n "layout.pageToolbar" teams/src/vendor/teams/components/page-layout.tsx
grep -n "titleKey" teams/src/vendor/teams/contracts/navigation.ts
```

缺失即说明上游重写了该文件，需要重新评估补丁。
