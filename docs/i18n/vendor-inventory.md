# vendor 中文文案盘点（P0 交付）

日期 2026-10-29 · 脚本 `node scripts/i18n-vendor.mjs --json` · 明细 `i18n-vendor.json`（gitignore）

---

## 结论

`teams/src/vendor/` 与 `talents/src/vendor/` 共 **202 条**中文，其中：

> **能靠 props 注入解决的只有 2 条（1.0%）。**

原方案 D7「props 注入为主」不成立。vendor 不是一组展示型组件，而是**自带文案生成逻辑的模块**——`agent-management` 用字符串拼 DOM，`framework-sidebar` 把文案写在 JSX 里。要国际化只能改文件，因此必须建立**补丁清单机制**。

---

## 分类结果

| 类别 | 条数 | 占比 | 含义 |
|---|---:|---:|---|
| `other`（函数内字符串 / DOM 模板） | 166 | 82.2% | 文案在渲染逻辑内部，props 注入无效 |
| `jsx`（JSX 文本与属性） | 34 | 16.8% | 同上，需改 JSX |
| `exported-const`（模块级导出常量） | 10 | 5.0% | 被 `framework-sidebar` 消费，可改为 props 或改文件 |
| `props-default`（解构参数默认值） | 2 | 1.0% | 唯一可直接覆盖的类别 |

> 类别有交叠计数误差，以 `i18n-vendor.json` 明细为准。

---

## 逐文件

| 文件 | 条数 | 主要形态 | 处理 |
|---|---:|---|---|
| `agent-management/configuration-editor.ts` | 62 | 状态消息、表单说明、HTML 模板 | 补丁清单 |
| `agent-management/index.ts` | 42 | `mount()` 内拼 DOM 与错误提示 | 补丁清单 |
| `agent-management/configuration-controls.ts` | 20 | 控件标签 | 补丁清单 |
| `agent-management/configuration-library.ts` | 14 | 预设名称与描述 | 补丁清单 |
| `agent-management/ui-contract.ts` | 2 | 常量 | 补丁清单 |
| `components/framework-sidebar.tsx`（teams + talents 各一份） | 15 ×2 | aria-label、连接状态、主题提示 | 补丁清单（双份同步） |
| `work/confirm-work.tsx` | 12 | 2 个 props 默认值 + JSX 长句混排 | 部分可 props，其余补丁 |
| `contracts/navigation.ts`（各一份） | 5 ×2 | 导航分组标题常量 | 改为组件 props，或补丁 |
| `resources/catalog.tsx` | 4 | 「查看详情」等 | 补丁清单 |
| `components/page-layout.tsx`（各一份） | 2 ×2 | aria-label | 补丁清单（双份同步） |
| `design-system.ts`（各一份） | 1 ×2 | 字体名/注释 | 无需翻译 |

`teams/` 与 `talents/` 各有一份 vendor 拷贝，**23 条重复**，改动必须两处同步。去重后唯一文案约 **179 条**。

---

## 三个处理方案

| 方案 | 适用 | 成本 |
|---|---|---|
| **A 补丁清单**（改 vendor 文件 + `vendor-patches.md` 记录，上游同步时重放） | 除下面两项外全部 | 179 条，约 2–3 天 |
| **B 改为 props** | `contracts/navigation.ts` 的 5 条分组标题 | 半天，但要改 `framework-sidebar` 读取方式 |
| **C 不翻译** | `design-system.ts` 的 1 条（字体名） | 0 |

### 补丁清单的形态

`docs/i18n/vendor-patches.md` 记录：

```
file: teams/src/vendor/teams/components/framework-sidebar.tsx
line: 14-15
before: '本地服务已连接' / '本地服务未连接'
after:  'Connected to local service'（由 t('vendor.sidebar.connected') 提供）
upstream-check: 同步上游后需重新确认该行仍存在
```

同步上游的流程：`git diff` 比对 → 按清单逐条重放 → 缺失项报警。这是唯一能兼顾「上游可同步」与「英文完整」的方式。

---

## 需要确认的一件事

`agent-management` 占 140 条（69%），是「Agent 管理」页的配置编辑器，由 `teams/src/components/agent-management.tsx:7-11` 挂载。

| 选项 | 后果 |
|---|---|
| 翻译 | 英文演示完整；成本 2–3 天，且补丁量最大 |
| **不翻译** | 英文模式下该页保持中文；成本 0；需要在产品文档标注为已知缺口 |

如果演示脚本不会在英文场景打开「Agent 管理」，选「不翻译」可以把 vendor 工作量从 3 天压到半天。这条需要产品确认。

---

## 对 I18N.md 的影响

- D7 由「props 注入为主」改为「补丁清单为主，props 为辅」
- P2 增加「补丁清单机制」子任务
- 风险表新增「上游同步后补丁丢失」
