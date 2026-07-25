# Polymarket Calendar Paper Sim

订单簿仿真盘：GitHub Actions 定时扫盘，Vercel 只负责展示。

## 架构（免费）

| 角色 | 做什么 | 费用 |
|------|--------|------|
| **GitHub Actions** | 每 15 分钟拉 Polymarket 订单簿、模拟开平仓，提交 `data/sim-state.json` | 免费额度内通常够用 |
| **Vercel** | 托管仪表盘，读取仓库里的状态并标记未实现盈亏 | Hobby 免费 |
| **Upstash / Vercel Cron** | **不需要** | — |

```
Polymarket API → GitHub Actions (scan) → commit data/sim-state.json
                                              ↓
                                    Vercel Dashboard (read + mark)
```

## 策略

- 进场：可成交 edge **> 4¢**
- 出场：可成交 edge **≤ 1¢**
- by：买远端 YES（吃 ask）+ 卖近端 YES（吃 bid）
- 滑点 = 成交均价 − 盘口最优价

## 1) 推到 GitHub

```bash
cd polymarket-calendar-sim
git add -A
git commit -m "feat: paper sim with GitHub Actions scanner"
git remote add origin https://github.com/<YOU>/<REPO>.git
git branch -M main
git push -u origin main
```

然后到仓库 **Settings → Actions → General**，确认 Actions 已启用；  
若 push 被拒，给 `github-actions` 写权限：Workflow permissions → **Read and write**.

手动跑一次：Actions → **Paper scan** → Run workflow。

## 2) 部署 Vercel（只展示）

1. Vercel Import 该 GitHub 仓库  
2. 环境变量（可选，一般不用）：

| 变量 | 何时需要 |
|------|----------|
| `SIM_STATE_URL` | 自动拼 raw URL 失败时，手动填 `https://raw.githubusercontent.com/<YOU>/<REPO>/main/data/sim-state.json` |
| `SIM_REPO_OWNER` / `SIM_REPO_NAME` | 同上，辅助拼 URL |

3. Deploy 后打开域名即可。页面会读最新的 `sim-state.json`，并对持仓用实时盘口算未实现盈亏。

> 不需要 Vercel Cron，也不需要 Upstash。

## 本地

```bash
npm install
npm run scan    # 跑一轮并写入 data/sim-state.json
npm run dev     # http://localhost:3000
```

## API

- `GET /api/state` — 仪表盘（只读状态 + 标记未实现）
- `POST /api/scan` — 本地/调试用；生产以 GitHub Actions 为准
- `POST /api/reset` — 重置（需 `CRON_SECRET`，可选）

## 注意

- GitHub 的 `*/15 * * * *` 可能有数分钟延迟，属正常  
- 每次扫描会 commit 一次状态文件（历史会变长，可接受）  
- 模拟盘 ≠ 真实下单  
