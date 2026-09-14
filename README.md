# 轻账本 / Financial Ledger

一个自托管、多用户隔离的个人收支记账应用。V1 使用 React + Vite、Fastify、SQLite、Drizzle，并以 Docker Compose + Caddy 部署。

## 本地开发

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

前端默认位于 `http://127.0.0.1:5173`，API 位于 `http://127.0.0.1:3000`。Vite 会代理 `/api` 与 `/healthz`。

完整质量门禁：

```bash
pnpm check
```

## 首次生产部署

1. 将 `env.example` 复制为 `.env`。
2. 生成至少 32 字符的随机 `APP_SECRET`。
3. 设置初始 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。管理员首次创建后，`.env` 中的初始密码不再决定真实登录密码。
4. 将 `SITE_HOST` 设置为已经解析到 VPS 的域名。
5. 将 `LEDGER_IMAGE` 固定到已发布的版本标签或镜像 digest。
6. 创建持久化目录并允许容器中的非 root 用户写入：`mkdir -p data && chown 1000:1000 data`。
7. 运行 `docker compose pull && docker compose up -d`。
8. 访问 `/healthz`，再登录管理员账号核对系统状态。

## GitHub Actions

仓库已经启用 `.github/workflows/ci.yml`。推送到 `main` 后会先执行 `pnpm check`，通过后使用 Docker Buildx 构建镜像并推送到 GHCR；`ci.workflow.yml` 保留为同内容的便携模板。

## 数据、备份与迁移

运行数据库位于 `/data/ledger.db`，系统使用 SQLite WAL。不要在应用运行时仅复制主数据库文件作为备份；请使用管理后台生成的一致性数据备份。

网页数据备份只包含业务数据库，适用于产品内整库恢复。服务器迁移时还必须单独保存 `.env`、`compose.yaml`、`Caddyfile` 和 `data/`。

## PWA

网页可安装为 PWA。Service Worker 只缓存静态应用外壳；`/api` 和 `/healthz` 永远走网络，不支持离线记账或离线数据同步。
