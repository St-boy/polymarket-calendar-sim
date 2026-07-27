# Polymarket Calendar Paper Sim

订单簿仿真盘：外部定时器每 15 分钟唤醒 GitHub Actions 扫盘，Vercel 只负责展示。

## 架构（免费）

| 角色 | 做什么 | 费用 |
|------|--------|------|
| **cron-job.org** | 每 15 分钟调用 GitHub API 触发扫盘 | **完全免费** |
| **GitHub Actions** | 拉订单簿、模拟开平仓，提交 `data/sim-state.json` | 公开仓免费额度 |
| **Vercel** | 只托管仪表盘展示 | Hobby 免费 |

```
cron-job.org (每15分钟)
    → GitHub workflow_dispatch
    → Actions 扫盘并 commit data/sim-state.json
    → Vercel Dashboard 读取展示
```

> 说明：GitHub 自带的 `schedule` **不保证** 15 分钟；本项目只把它留作**每小时备份**。真正准点靠 cron-job.org。

## 费用结论

**不收费**（公开仓库 + cron-job.org 免费档 + Vercel Hobby）。  
不需要 Upstash，也不需要付费 Cron。

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

## 3) 配置稳定的 15 分钟触发（免费）

### 3.1 创建 GitHub Token（一次性）

1. 打开 [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new)  
2. Repository access：只选 `polymarket-calendar-sim`  
3. Permissions：
   - **Actions**: Read and write  
   - **Contents**: Read  
4. Generate，复制 token（只显示一次）

### 3.2 cron-job.org

1. 注册 [cron-job.org](https://cron-job.org/)（免费，可每分钟级）  
2. Create cronjob：
   - **URL**: `https://api.github.com/repos/St-boy/polymarket-calendar-sim/actions/workflows/paper-scan.yml/dispatches`
   - **Method**: POST  
   - **Schedule**: every 15 minutes  
   - **Headers**:
     - `Accept: application/vnd.github+json`
     - `Authorization: Bearer <你的PAT>`
     - `Content-Type: application/json`
     - `X-GitHub-Api-Version: 2022-11-28`
   - **Body**: `{"ref":"main"}`
3. 保存后到 GitHub → Actions，应看到 `workflow_dispatch` 触发的 Paper scan

手动试一次（把 `TOKEN` 换成你的 PAT）：

```bash
curl -X POST ^
  -H "Accept: application/vnd.github+json" ^
  -H "Authorization: Bearer TOKEN" ^
  -H "X-GitHub-Api-Version: 2022-11-28" ^
  https://api.github.com/repos/St-boy/polymarket-calendar-sim/actions/workflows/paper-scan.yml/dispatches ^
  -d "{\"ref\":\"main\"}"
```

成功时 HTTP 状态码是 **204**。

> 可选：也可用 Vercel `/api/trigger-scan` 转发（需在 Vercel 配 `CRON_SECRET` + `SIM_GITHUB_TOKEN`），不是必需。

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
