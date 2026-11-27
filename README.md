# Claude Token Board

给 Claude 桌面客户端（Code 标签页）和 Claude Code 补上上下文与 Token 用量看板。

## 功能

- **输入框上方横条**：一整张白色分段卡片，显示上下文占用、5 小时与本周额度及重置时间、本会话费用、今日 Token 与费用，最右一段点击打开看板（按下有高亮反馈）。用量偏高时标签旁亮橙点或红点。
- **侧边面板「Token 用量看板」**：
  - 当前会话：上下文进度条、剩余空间、各额度进度条、会话费用
  - 汇总：今日、近 7 天、近 30 天、全部的总量、输入、输出、缓存读、缓存写和费用
  - 近 14 天每日费用柱状图
  - 按模型统计（近 30 天）
  - 活跃热力图（按周，带月份刻度）
- 面板底部「立即刷新」按钮手动重新扫描，平时每分钟自动刷新。
- **命令** `/token-board`：打开面板。

历史数据读取本机 `~/.claude/projects` 下的会话日志（含子代理），按消息 ID 去重，增量扫描，每分钟和每轮对话结束时更新。

费用按 Anthropic API 标价估算（Fable、Opus、Sonnet、Haiku 各系列），不是订阅的实际扣费。

## 安装

在终端里的 Claude Code 会话中输入：

```
/plugin install token-board --marketplace prettylove520/claude-token-board
```

提示 `Add marketplace?` 时输入 `y`，然后按 Enter 选择 user 范围。

在命令行中：

```
claude plugin install token-board --marketplace prettylove520/claude-token-board
```

在桌面客户端中（`/plugin` 不可用时）：点输入框旁的 **+**，选 **Plugins**，**Add marketplace** 填 `prettylove520/claude-token-board`，再 **Add plugin**。

以 user 范围安装后，桌面客户端 Code 标签页的本地会话也会加载它。

## 看板不显示？

看板由会话的后台进程画出，只在正在运行的 Code 会话里出现：

- 普通 Chat 对话不运行 Claude Code，没有看板。
- 客户端重启或更新后，没有重新打开的旧会话不会运行；闲置太久的会话也可能被停掉。这些会话里看板会消失。
- 在那个会话里发一条消息，会话运行起来后看板就会回来。上下文数字要等第一轮回复结束后才显示，之前是「—」。
- 更新插件后，已打开的会话要新开或重启客户端才会用上新版本。
- 输入框上方弹出评价问卷时，看板会让位，问卷关掉后恢复；点横条右侧的 `[-]` 会把它折叠，再点一次展开。

## 许可证

MIT
