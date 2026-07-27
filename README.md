# Polymarket Calendar Paper Sim

订单簿仿真盘：外部定时器每 15 分钟唤醒 GitHub Actions 扫盘，Vercel 只负责展示。

## 架构（免费）

| 角色 | 做什么 | 费用 |
|------|--------|------|
| **本机 Windows 计划任务** | 每 15 分钟 `gh workflow run` 唤醒扫盘 | **免费** |
| **GitHub Actions** | 拉订单簿、模拟开平仓，提交 `data/sim-state.json` | 公开仓免费额度 |
| **Vercel** | 只托管仪表盘展示 | Hobby 免费 |
| **GitHub schedule** | 每小时备份（不准点） | 免费 |

```
Windows Task (每15分钟, 电脑醒着时)
    → gh workflow_dispatch
    → Actions 扫盘并 commit data/sim-state.json
    → Vercel Dashboard 读取展示
```

## 费用结论

**不收费。** 不需要 Upstash，也不需要付费 Cron。

## 1) 推到 GitHub

```bash
cd polymarket-calendar-sim
git add -A
git commit -m "feat: paper sim with GitHub Actions scanner"
git remote add origin https://github.com/<YOU>/<REPO>.git
git branch -M main
git push -u origin main
```

仓库 **Settings → Actions → General**：

- Actions 已启用  
- Workflow permissions → **Read and write**

## 2) 部署 Vercel（只展示）

1. Vercel Import 该 GitHub 仓库  
2. 一般不用额外环境变量；Deploy 后打开域名即可

## 3) 稳定的 15 分钟触发（已支持本机一键安装）

在本机执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-scan-task.ps1
```

会创建计划任务 `PolymarketCalendarPaperScan`：每 15 分钟触发一次 GitHub Actions。  
日志：`data/windows-scan-trigger.log`

注意：电脑休眠/关机时不会触发；那时仍有 GitHub **每小时备份** schedule。

若需要 **24/7 且电脑可关机**，再用免费的 [cron-job.org](https://cron-job.org/) + GitHub PAT 调 `workflow_dispatch`（见仓库历史说明），或走可选的 `/api/trigger-scan`。

## 本地

```bash
npm install
npm run scan    # 跑一轮并写入 data/sim-state.json
npm run dev     # http://localhost:3000
```

## API

- `GET /api/state` — 仪表盘（只读状态 + 标记未实现）
- `GET|POST /api/trigger-scan` — 外部定时器唤醒 Actions（需密钥）
- `POST /api/scan` — 本地/调试用；生产以 GitHub Actions 为准
- `POST /api/reset` — 重置（需密钥）

## 策略

- 进场：可成交 edge **> 4¢**
- 出场：可成交 edge **≤ 1¢**
- by：买远端 YES（吃 ask）+ 卖近端 YES（吃 bid）
- 滑点 = 成交均价 − 盘口最优价

## 注意

- 每次扫描会 commit 一次状态文件（带 `[skip vercel]`，避免反复部署）  
- 模拟盘 ≠ 真实下单  
