# Vercel 网站与云服务器资料处理

网站继续由 GitHub → Vercel 发布。云服务器只运行 worker 和 ClamAV，不需要域名、TLS 证书或新增公网端口。Supabase 继续保存账号、资料、处理队列和会话；百炼提供翻译和向量模型。

## 上传路径

1. 登录用户提交文件名、大小和 SHA-256。网站核验编辑权限，由用户会话申请仅针对该文件路径的上传签名。
2. 浏览器直接上传到 Supabase 私有桶，避免经过 Vercel 的函数请求体大小限制。文件上限仍为 20 MiB；不向浏览器提供服务端密钥。
3. 完成接口核验所属空间、上传人、对象大小和类型，再入队。重复提交完成请求不会重复入队；网络中断后重新选择同一文件可继续。签名禁止覆盖已有对象。
4. worker 下载后再次检查实际大小、SHA-256、文件头，完成病毒扫描、解析/OCR、翻译和索引，进入待审核。人工确认发布后才参与问答。

## 部署文件

服务器目录建议使用 `/opt/cpv-library`。每次发布保留独立的 `releases/<版本>` 目录，`current` 指向当前版本。发布目录包含 `compose.worker.yaml`、`deploy/clamd.conf` 和 worker 源码。凭据单独放在 `/opt/cpv-library/.env.worker`，权限为 600，并在发布目录建立对应符号链接。

从 `deploy/worker.env.example` 准备配置，只复制后台所需的 Supabase 服务密钥、百炼密钥和模型配置。不要复制其他项目的环境文件。

```bash
cd /opt/cpv-library/current
docker compose -f compose.worker.yaml config --quiet
docker compose -f compose.worker.yaml up -d --no-build --pull never
docker compose -f compose.worker.yaml ps
docker compose -f compose.worker.yaml logs --tail 30 worker
```

部署使用经过校验的本地镜像；在发布目录 `.env` 中记录 `CPV_WORKER_IMAGE` 和 `CPV_CLAMAV_IMAGE` 的不可变镜像 ID 或摘要。更新网页代码不会自动更新云服务器 worker，修改 worker 后须重新构建并更新这个发布目录。

## 共享小型服务器

此 Compose 是单人、低频上传的配置：同时处理一份文件，worker 限 512 MiB/0.75 CPU，扫描器限 1 GiB/0.5 CPU，并设置日志轮换。扫描器加载完整病毒库需要额外内存，本配置依赖至少 2 GiB 的交换空间；它不能在没有 swap 的 4 GiB 共享服务器上直接套用。大文件/OCR可能更慢或达到资源限制，失败时不会跳过扫描。

扫描器关闭并行病毒库重载，以降低峰值内存；重载期间短暂等待扫描。保留 FreshClam 病毒库验证。新增 swap 应保存原 `/etc/fstab`，设置文件权限 600，并记录恢复方式。检查宿主机剩余内存、swap、磁盘及现有业务状态后再启动；高频上传应增加物理内存。

如果宿主机 `vm.swappiness=0`，cgroup 内存达到上限时可能仍无法使用 swap。此次共享服务器配置使用 `vm.swappiness=10`，写入 `/etc/sysctl.d/90-cpv-worker-memory.conf`；原值为 0。撤回后台部署时，可先停止 CPV 容器，在有足够可用内存时关闭 CPV 的 swap，再移除对应 fstab 条目和 sysctl 配置、恢复原值。不要直接覆盖整份 fstab，以免覆盖其他后续改动。

## 验收、状态和恢复

检查两容器 healthy、重启次数、OOM 状态以及一份超过 4.5 MB 的小文本 PDF 的完整处理。初次加载病毒库可能需要数分钟。worker 健康检查要求最近 10 分钟成功领取队列或续租；ClamAV 健康检查验证扫描服务响应。

资料处理失败会显示错误码，原文件和已完成的翻译/索引缓存保留。可在资料详情重试；中断的任务租约过期后会恢复，最多三次。上线验收用的文件应归档，避免混入日常问答。

回滚时将 `current` 指回上一发布目录，使用其中固定的镜像重新执行 `up -d --no-build --pull never`。不要执行 `down -v`，不要清理其他业务的容器或镜像。密钥不写日志、不打入镜像、不提交 Git。
