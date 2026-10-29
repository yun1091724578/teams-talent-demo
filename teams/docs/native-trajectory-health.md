# 原生轨迹健康与恢复

iCode 的本地轨迹写入器在激活失败时会提示“轨迹记录无法启动，已为此会话禁用”。这条提示只影响该会话的本地详细轨迹，不应阻塞任务。Teams 现在把轨迹健康作为只读状态展示，并在启动/恢复时提供明确选择。

## 观测

Teams 优先读取 iCode 将来提供的 `trajectory/health.json`；旧版本回退到只读检查 `trajectory/events.jsonl` 的尾部：

| 状态 | 含义 | 任务是否继续 |
| --- | --- | --- |
| `healthy` | 轨迹文件可读，尾部事件有效 | 是 |
| `unknown` | 尚未写入或无法判断 | 是 |
| `degraded` | 损坏、权限、过大、上游声明降级等 | 是 |
| `recovering` | 上游正在恢复 | 是 |

健康检查不修改、不截断、不修复原始轨迹文件。损坏时任务页只展示 `session.json` 的可见对话，并显示“详细轨迹不可用，任务可继续”。

## 恢复阶梯

1. 同一任务已有 live TUI：优先聚焦原终端；Windows 无法定位终端时提示在原终端继续，不重复启动。
2. 没有 live TUI：
   - 默认“进入已准备会话”（同一 session，保留对话）。
   - 健康状态明确为损坏/权限/schema/过大时，启动对话框默认选中“新开会话（不保留当前对话）”。
   - 用户仍可手动选择原会话。
3. 新会话使用同一任务上下文重新启动，不携带原 `preparedSession`；原会话记录保留。
4. 任何轨迹异常都不改变任务进度、CLI 采用记录或 Owner 验收。

## 上游 iCode 契约

上游 issue：[openJiuwen-ai/iCode#135](https://github.com/openJiuwen-ai/iCode/issues/135)。

建议 iCode 在会话目录提供原子写入的 `trajectory/health.json`：

```json
{
  "schemaVersion": 1,
  "sessionId": "…",
  "pid": 1234,
  "state": "healthy | degraded | recovering",
  "reason": "lease_held | permission | corrupt_tail | schema_too_new | activation_failed | unknown",
  "detail": "…",
  "updatedAt": "…"
}
```

或在 CLI 提供 `icode session health --session <id> --json`。Teams 在文件缺失时使用现有尾部探测，因此旧版 iCode 仍可工作。

上游还应修复/增强：

- stale writer lease 的 owner 记录与死进程回收；
- 激活失败时输出结构化 reason，而不是只有 TUI 文案；
- 两进程同 session、持锁、只读、损坏尾部、schema 升级的跨平台测试；
- TUI 提示改为“详细轨迹已降级，任务可继续”，避免被误认为任务失败。

## 验证

- `node --import tsx --test tests/trajectory-health.test.ts`
- `node --import tsx --test tests/task-session-stream.test.ts`
- `node --import tsx tests/task-session-stream-http.ts`
- `node --import tsx --test tests/native-preparation.test.ts`

## 当前边界

“新开会话”是当前节点的独立运行，不会替换任务准备记录中的原 session；原 session 仍保留在任务会话列表。若新会话退出后再次进入，产品仍会先按原准备会话恢复；需要长期切换当前 session 时，应在上游 health 契约和 session ownership 完成后补充。
