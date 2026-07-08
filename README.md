# AI 需求情报看板（Demand Radar）

一条 **AI 自主运转的用户需求情报流水线**：自动从公开平台采集"用户希望 AI 帮他们做什么"的场景与研报，由 AI 完成相关性预过滤、初筛评分、优先级判定和深度分析；人通过网页看板观察 AI 的工作状态、进行轻量干预，并可随时投递自己的创意进入同一条流水线。

> 核心理念：**人不参与流水线的执行，只做三件事——看、干预、投喂创意。**

## 功能

- **三个采集来源（V1）**：Reddit（公开 JSON / 官方 OAuth 双模式）、研报文章搜索（Claude 联网搜索）、人工创意投递（一句话即可）
- **AI 流水线**：采集 → 去重 → 相关性预过滤 → 初筛（标题/摘要/标签/评分/结论）→「值得做」自动深度分析（五章节报告，联网查竞品）
- **需求类型体系**：区分「已有需求」（用户已表达、调研可发现）与「✨创造需求」（AI 能力催生的全新场景，如用亲人声音定制生日歌、给孩子做定制童书），评分与分析逻辑分别适配
- **用户视角的需求定义**：卡片标题强制为"谁 + 在什么场景 + 想让 AI 做什么"，拒绝资讯式标题
- **看板**：流程看板（按生命周期五列）+ 列表审阅（密集表格批量审阅）双视图；来源/优先级/分类/需求类型/状态多维筛选；分类标签由 AI 动态自拟扩充
- **人工干预**：改优先级 / 改结论 / 改需求类型 / 强制推进回退状态 / 重新初筛 / 重新深析 / 归档 / 采纳，全部写入卡片时间线（pipeline log）
- **运行与成本**：每日定时采集（可配时间）+ 手动"立即运行"；每日入库上限与 AI 调用上限双护栏，超限自动暂停并在看板报警
- **访问保护**：单一访问密码，无需账号体系（内部小团队工具）

## 技术栈

Next.js 16（App Router）· TypeScript · SQLite（better-sqlite3）· node-cron · Anthropic API（@anthropic-ai/sdk，结构化输出 + Web Search 工具）· Tailwind CSS 4

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填写配置，见下表
npm run dev                  # http://localhost:3000
```

### 环境变量（`.env.local`）

| 变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_PASSWORD` | ✅ | 看板访问密码 |
| `ANTHROPIC_API_KEY` | ✅ | Claude API 密钥（初筛/分析/研报搜索都依赖它） |
| `APP_PROXY_URL` | ❌ | 出站代理（如 `http://127.0.0.1:7890`）。本机网络无法直连 Reddit / Anthropic 时必填；海外服务器部署时**留空** |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | ❌ | Reddit 官方 OAuth 凭证（[reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) 创建 script 应用）。不填则走公开 JSON 接口，部分网络/IP 下会被 Reddit 风控拦截 |

其余配置（定时时间、入库上限、AI 调用上限、subreddit 列表、搜索关键词、平台契合度描述、模型选择）都在看板**设置页**在线修改，即时生效。

### 模型配置

设置页可分别配置两个模型（下拉选择或自定义模型 ID）：

- **初筛 / 预过滤 / 研报搜索**：默认 `claude-sonnet-5`（换 `claude-haiku-4-5` 可再省约 2/3 成本）
- **深度分析**：默认 `claude-opus-4-8`（质量优先）

默认配置下每天 50 条采集 + 若干深度分析约消耗几美元。

## 新增采集渠道

采集器为插件式架构，新增渠道不动主干：

1. 在 `src/lib/collectors/` 新建文件，实现 `Collector` 接口（见 `types.ts`）：核心是 `collect(settings): Promise<RawItem[]>`
2. 在 `src/lib/collectors/index.ts` 的注册表数组中追加
3. （可选）在设置页增加该渠道的开关与配置项

去重、预过滤、初筛、深析由流水线自动复用。低成本技巧：参考 `research.ts`，用 Claude 联网搜索定向采集任意平台的公开内容，无需平台 API。

## 部署到 Zeabur

1. Zeabur 控制台 → New Project → Deploy from GitHub，选择本仓库（自动识别 Next.js）
2. 配置环境变量：`ACCESS_PASSWORD`、`ANTHROPIC_API_KEY`、`TZ=Asia/Shanghai`（让"每日采集时间"按北京时间理解）；**不要**设置 `APP_PROXY_URL`
3. **挂载持久卷**到 `/app/data`（SQLite 数据库所在目录）——否则每次重新部署数据会丢失
4. 部署完成后访问域名，登录后在设置页完成渠道与模型配置

定时采集依赖常驻进程，Zeabur 的常驻服务天然满足；本地开发时服务关闭则退化为手动触发。

## 目录结构

```
src/
├── proxy.ts                  # 访问密码校验（Next 16 proxy）
├── instrumentation.ts        # 启动时注册定时任务
├── app/
│   ├── (main)/               # 看板主页 / 运行日志 / 设置
│   ├── login/
│   └── api/                  # cards / runs / settings / stats / auth
├── components/               # 状态条 / 卡片 / 详情抽屉 / 列表表格 / 投递弹窗
└── lib/
    ├── db.ts                 # SQLite schema 与迁移
    ├── settings.ts           # 全部可配置项（kv 存储）
    ├── pipeline.ts           # 流水线主干（采集→初筛→深析→干预）
    ├── scheduler.ts          # node-cron 定时
    ├── collectors/           # 插件式采集器（reddit / research / …）
    └── ai/                   # prompts 集中管理 + 初筛/预过滤/分析 + 成本护栏
```

## License

内部工具，未设开源许可。
