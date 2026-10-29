# 知衡 · CPV 私有资料库

以本人学习为主的房地产资料库。保留中英对照、双向选句高亮和英文朗读，增加资料检索、百炼问答、来源定位和上传处理。没有订阅、收费或团队管理功能。Supabase 允许新账号注册并要求邮箱确认；资料访问仍需空间成员权限。当前网页提供登录入口，尚无自助注册表单。

## 现在能打开什么

本地预览：**http://localhost:3100**。本机已有项目可在项目目录运行：

```powershell
.\start-preview.ps1
```

本地整理过的语料包含 9 份文件、2,509 组中英对照。客户语料、原始文件和生成的 HTML **不包含在此代码仓库中**。准备好自己的语料后，可以阅读、筛选、搜索和朗读；助手面板在未连接百炼时只显示原文搜索结果，明确标注没有调用 AI。预览不会上传文件或消费模型 token。

原来的独立 HTML 仍在 `../cpv-reader/CPV中英对照学习资料.html`，可以继续离线使用。

## 从仓库开始

使用 Node.js 22+：

```powershell
git clone https://github.com/jiagnhu/Database.git
cd Database
npm ci
Copy-Item .env.example .env.local
```

上面的配置复制步骤仅用于全新安装，已有 `.env.local` 时请保留。该文件被 Git 忽略，不提交任何密钥。

在新的 Supabase 项目中，按文件名顺序通过 SQL Editor 执行 `supabase/migrations/` 下的迁移；已应用的迁移不要重复执行。创建个人空间并保存返回的 ID 到 `CPV_ORG_ID`：

```sql
insert into public.cpv_organizations(name) values ('我的 CPV 资料库') returning id;
```

本人的现有项目已初始化时，可直接沿用本地配置，不需要重复建表或建空间。现有环境已完成管理员授权、9 份中英资料导入、210 个片段的向量索引和一次真实问答联调；网页在本机连接模式下运行。全新环境仍需完成下面的配置。

## 首次连接（一次性）

1. 在 Supabase 项目的 Authentication / Users 中创建本人邮箱账号，设置自己的强密码并确认邮箱，将邮箱填写到 `CPV_OWNER_EMAIL`。按项目要求保留公开注册及邮箱确认；注册账号不会自动获得现有私有空间的资料访问权限。
2. 打开 `.env.local`，填写：
   - `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`：项目地址和公用访问键。
   - `SUPABASE_SECRET_KEY`：在 Settings → API Keys → Secret keys 获取或创建的服务端密钥，以 `sb_secret_` 开头。不要填 publishable key。
   - `DASHSCOPE_API_KEY`：阿里云百炼北京地域的 API Key。
   - 如使用业务空间专属域名，修改 `BAILIAN_BASE_URL` 为该空间的北京兼容端点。密钥地域必须与地址匹配。
3. 使用 **Node.js 22+**，在本目录依次执行：

```powershell
npm ci
npm run doctor
npm run bootstrap:owner
npm run import:corpus -- --embed
```

`doctor` 只显示配置是否存在，不打印密钥，也不消费模型 token。`bootstrap:owner` 只授权已有且已确认的本人账号，不发送邮件。`import:corpus -- --embed` 导入已经整理的中英资料并调用百炼生成向量；不会重复翻译原有内容。默认每日额度 200,000 token，超额会停止，不会无限重试。若先不使用模型，可去掉 `--embed`，只建立关键词索引。

4. 将 `APP_MODE` 改为 `connected`，运行 `start-connected.ps1`，访问 http://localhost:3100，使用刚设置的邮箱和密码登录。

启动脚本会优先使用存在的 Codex Node 运行时，否则使用系统 Node。`npm` 命令要求自己的 Node/npm 环境可用，版本为 Node 22 或更新。

### 现有资料的导入方式

`npm run prepare:corpus -- "你的中英对照HTML路径"` 从本工具原有格式的 HTML 提取对照片段和配图，输出到被 Git 忽略的 `data/`。不传路径时默认寻找同级 `cpv-reader` 目录下的原始阅读器；全新克隆的仓库不包含它。该迁移脚本针对既有的 9 份资料，带有完整性校验。导入脚本把整理结果存入数据库；原始 PPTX/PDF/DOCX 继续保留在本地，不会伪装为已上传的原文件。其他文件使用连接模式下的上传流程入库。

完成导入后，重复执行会复用已保存的相同内容与向量；先做关键词导入后可以再加 `--embed` 补齐向量。每个成功的向量批次会立即缓存，断点续做不重复调用已缓存的批次；已归档的资料不会被自动恢复。不要通过修改 JSON 后重用相同文档 ID 来覆盖历史资料。更换向量模型后重新运行 `--embed`，不能混用不同模型的向量。

## 功能与边界

| 功能 | 实现 |
|---|---|
| 阅读 | 章节选择、字体调整、中文/英文同步高亮、英文正常/慢速朗读、原配图 |
| 搜索 | 中英文关键词检索；不调用模型 |
| 问答 | 百炼 qwen-plus、关键词与向量混合检索、最多 6 个证据片段、中文解释和英文术语 |
| 引用 | 服务端校验引用 ID，点击打开资料对应位置；无依据则明确未找到 |
| 上传 | PDF / DOCX / PPTX，最大 20 MB；病毒扫描、压缩包限制、PDF OCR、翻译、索引、人工审核 |
| 历史 | 本人会话记录；资料不可访问或归档时隐藏相关历史回答 |
| 保护 | Cookie 登录、RLS、私有桶、来源检查、CSP、令牌额度、超时、有限任务重试、元数据审计 |

自动解析无法保证复杂表格、图表、文字顺序或 OCR 完全正确；新文件始终先进入待审核。PPTX 中纯图片里的文字目前不会自动识别，需查看原文件并补充可检索文本。PDF 会对文字稀少的页执行 OCR。中文为主的段落保留中文，不强行生成英文原文。

引用 ID 校验可以阻止不存在的来源，但不等于自动证明答案语义正确。回答应结合原文核对。资料内的年代和规范可能已经变化；系统不会默认联网补充现行规定。

## 技术组成

- Next.js / React / TypeScript：页面、接口与服务端权限检查。
- Supabase PostgreSQL + pgvector：资料、索引、访问控制、任务租约、额度和审计。
- Supabase Auth / 私有 Storage：本人登录和原文件保存。
- 百炼：`qwen-plus` 问答、`qwen-flash` 新文件翻译、`text-embedding-v4` 1024 维向量。
- Python worker：pypdf、python-docx、python-pptx、PDFium + Tesseract、ClamAV。
- 浏览器 Web Speech API：英文朗读，不使用付费 AI 语音。

关键资料：[百炼兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)、[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)、[pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)。

## 检查与部署

```powershell
npm run typecheck
npm test
npm run build
```

安全策略验证使用独立的本地 PostgreSQL 容器，绝不在真实项目上执行 `tests/database.sql`。完整过程见 [验证记录](docs/verification.md)。

上传处理需启动 worker 与病毒扫描服务；仅启动网页时新上传文件会停在等待处理。网站使用 Vercel 时，文件直接上传到私有存储，后台在独立云服务器处理。部署文件、资源要求与更新方式见 [云端后台部署](docs/cloud-worker.md)，备份/恢复说明见 [运维手册](docs/operations.md)。不要将本地开发服务器直接暴露到公网。
