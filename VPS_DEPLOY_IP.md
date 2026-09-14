# Financial Ledger — VPS 纯 HTTP 部署任务书

> 本文档面向运行在 VPS 上的 Codex。请直接按本文档执行部署；只有需要用户介入（例如端口未放行、端口冲突、GHCR 权限问题）时再停止并报告。
>
> Financial Ledger 本身 **只提供 HTTP 服务**，不再内置 Caddy、TLS 或 HTTPS。默认通过 `http://<VPS_IP>:7001` 访问。
>
> 若用户使用宝塔/Nginx/Cloudflare，请由外层代理负责 HTTPS，并反向代理到 `http://127.0.0.1:<PORT>`。
>
> **不要擅自修改 VPS 防火墙、安全组或云厂商防火墙规则。** 如果端口没有放行，只完成本机部署并向用户报告。

---

## 1. 部署目标

仓库：

```text
https://github.com/IAMI315/Financial.git
```

容器镜像：

```text
ghcr.io/iami315/financial:latest
```

推荐目录：

```text
/opt/financial
```

默认端口：

```text
7001/tcp
```

项目端口只有一个配置入口：`.env` 中的：

```text
PORT=7001
```

若用户需要自定义端口，只修改这一行，例如：

```text
PORT=8123
```

应用监听、Docker 端口映射和健康检查都会自动使用该端口，不要再修改其他文件中的端口配置。

默认访问地址：

```text
http://<VPS_PUBLIC_IP>:7001
```

宝塔/Nginx 反向代理目标：

```text
http://127.0.0.1:7001
```

---

## 2. 执行原则

1. 不删除已有数据库、备份或未知业务数据。
2. 不执行 `docker system prune -a`、`docker compose down -v` 等高破坏性命令。
3. 不修改 UFW、firewalld、iptables、nftables 或云厂商安全组。
4. 不把 `.env`、数据库、管理员密码、GitHub Token 提交到 Git。
5. 已有部署优先无损升级。
6. 如果 tracked 工作区有用户修改，不执行 `git reset --hard`，停止并报告。
7. GHCR 拉取出现 `unauthorized` 时，不打印 Token；报告用户配置 `read:packages` 权限或将 Package 设为公开。
8. 部署结束前必须验证容器状态、HTTP `/healthz` 和首页。
9. 最终必须明确报告实际端口和防火墙状态。

---

## 3. 环境检查

```bash
id
uname -a
cat /etc/os-release
command -v git || true
command -v curl || true
command -v openssl || true
command -v docker || true
docker compose version || true
```

设置 sudo：

```bash
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "ERROR: 当前用户不是 root，且系统没有 sudo。"
  exit 1
fi
```

如果 Debian/Ubuntu 缺少基础工具：

```bash
$SUDO apt-get update
$SUDO apt-get install -y git curl ca-certificates openssl
```

如果 Docker 未安装，Debian/Ubuntu 使用 Docker 官方源安装。非 Debian/Ubuntu 不要猜测命令，应报告系统信息。

---

## 4. 准备代码

```bash
$SUDO mkdir -p /opt/financial
$SUDO chown "$(id -u):$(id -g)" /opt/financial
cd /opt/financial
```

首次部署：

```bash
git clone https://github.com/IAMI315/Financial.git .
```

已有仓库：

```bash
git status --short
git diff --quiet && git diff --cached --quiet
```

若 tracked 文件有修改，停止更新并报告；否则：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

记录版本：

```bash
FULL_SHA="$(git rev-parse HEAD)"
echo "FULL_SHA=$FULL_SHA"
```

---

## 5. 配置端口

首次部署默认：

```bash
PORT=7001
```

已有 `.env` 时优先读取已有值：

```bash
if [ -f .env ]; then
  CONFIGURED_PORT="$(sed -n 's/^PORT=//p' .env | tail -n 1)"
  if [ -n "$CONFIGURED_PORT" ]; then
    PORT="$CONFIGURED_PORT"
  fi
fi

echo "PORT=$PORT"
```

检查端口：

```bash
if ss -ltnH | awk '{print $4}' | grep -Eq "(^|:)${PORT}$"; then
  echo "ERROR: ${PORT}/tcp 已被其他服务占用。"
  exit 1
fi
```

如果端口被占用，不关闭其他服务，也不自动换端口。向用户报告；用户只需在 `.env` 中修改 `PORT=`。

---

## 6. 检查防火墙（只检查，不修改）

目标端口为 `$PORT/tcp`。

UFW：

```bash
if command -v ufw >/dev/null 2>&1; then
  $SUDO ufw status verbose || true
fi
```

firewalld：

```bash
if command -v firewall-cmd >/dev/null 2>&1; then
  $SUDO firewall-cmd --state || true
  $SUDO firewall-cmd --list-ports || true
  $SUDO firewall-cmd --list-services || true
fi
```

nftables / iptables：

```bash
if command -v nft >/dev/null 2>&1; then
  $SUDO nft list ruleset || true
fi
if command -v iptables >/dev/null 2>&1; then
  $SUDO iptables -S || true
fi
```

记录为：

```text
FIREWALL_PORT_STATUS=OPEN
FIREWALL_PORT_STATUS=BLOCKED_OR_NOT_ALLOWED
FIREWALL_PORT_STATUS=UNCERTAIN
```

不要执行放行命令。若未明确开放，继续完成本机部署，最终报告用户需要开放的 TCP 端口。

---

## 7. 创建或升级 `.env`

### 首次部署

```bash
APP_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n' | tr '/+' '_-')"
```

创建 `.env`：

```bash
cat > .env <<EOF
# Project port: custom deployments only need to change this one line.
PORT=${PORT}

NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=/data/ledger.db
BACKUP_DIR=/data/backups
APP_SECRET=${APP_SECRET}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
REGISTRATION_OPEN=true
COOKIE_SECURE=false
PUBLIC_URL=http://127.0.0.1:${PORT}
APP_VERSION=0.1.0
LEDGER_IMAGE=ghcr.io/iami315/financial:latest
EOF
chmod 600 .env
```

保存生成的管理员密码，并在最终报告中仅首次显示一次。

### 已有部署

不要覆盖已有 `APP_SECRET`、管理员初始化信息和数据库。

确保存在：

```text
PORT=7001
COOKIE_SECURE=false
LEDGER_IMAGE=ghcr.io/iami315/financial:latest
```

如果旧部署没有 `COOKIE_SECURE`：

```bash
grep -q '^COOKIE_SECURE=' .env || echo 'COOKIE_SECURE=false' >> .env
```

如果旧部署仍使用 SHA 镜像，可迁移为 `latest`：

```bash
sed -i 's#^LEDGER_IMAGE=.*#LEDGER_IMAGE=ghcr.io/iami315/financial:latest#' .env
```

如果存在旧的 `ACCESS_PORT=`，它已经废弃，可以删除：

```bash
sed -i '/^ACCESS_PORT=/d' .env
```

`COOKIE_SECURE=false` 是为了保证 `http://IP:PORT` 可以正常登录。若未来应用只允许通过 HTTPS 域名访问且不再允许 HTTP 直连，可自行改为 `true`。

---

## 8. 持久化数据目录

```bash
mkdir -p data/backups
$SUDO chown -R 1000:1000 data
```

绝对不要删除：

```text
data/ledger.db
data/backups/
```

---

## 9. 从旧 Caddy 部署迁移（已有旧部署时执行一次）

如果 `/opt/financial` 中存在旧的 `compose.ip.yaml` / `Caddyfile.ip`，或当前运行容器包含 `caddy`，先停止旧栈但不要删除 volume：

```bash
if [ -f compose.ip.yaml ]; then
  $SUDO docker compose --env-file .env -f compose.ip.yaml down
fi
```

禁止添加 `-v`。

旧的本地文件已经不再使用，可以在确认新版本代码已拉取后删除：

```bash
rm -f compose.ip.yaml Caddyfile.ip
```

仓库自带的 `Caddyfile` 已被项目删除。今后只使用仓库根目录的：

```text
compose.yaml
.env
```

---

## 10. 验证 Compose

```bash
$SUDO docker compose --env-file .env -f compose.yaml config >/tmp/financial-compose-rendered.yaml
```

确认渲染结果中只有 `app` 服务，并且端口映射为当前 `$PORT`。

---

## 11. 拉取并启动

```bash
$SUDO docker compose --env-file .env -f compose.yaml pull
$SUDO docker compose --env-file .env -f compose.yaml up -d
$SUDO docker compose --env-file .env -f compose.yaml ps
```

预期只有一个主要业务容器 `app`，最终状态为 `running` 且 `healthy`。

如果未健康：

```bash
$SUDO docker compose --env-file .env -f compose.yaml logs --tail=200 app
```

如果问题涉及删除数据库或重建数据，停止并报告用户。

---

## 12. 部署后验证

监听端口：

```bash
ss -ltnp | grep ":${PORT} " || ss -ltnp | grep ":${PORT}$" || true
```

HTTP 健康检查：

```bash
curl -fsS "http://127.0.0.1:${PORT}/healthz"
```

期望：

```json
{"status":"ok","service":"financial-ledger-api"}
```

首页：

```bash
curl -I "http://127.0.0.1:${PORT}/"
```

如果能获取公网 IPv4，再验证：

```bash
curl -fsS "http://${VPS_IP}:${PORT}/healthz" || true
```

外部访问地址：

```text
http://<VPS_IP>:<PORT>
```

---

## 13. 宝塔 / Nginx / Cloudflare

Financial 源站只提供 HTTP。宝塔反向代理应填写：

```text
http://127.0.0.1:<PORT>
```

默认即：

```text
http://127.0.0.1:7001
```

不要再填写：

```text
https://127.0.0.1:7001
```

TLS/HTTPS 由宝塔、Nginx 或 Cloudflare 外层处理。Financial 容器无需证书。

若使用 Cloudflare + 宝塔 HTTPS，推荐链路：

```text
浏览器 HTTPS
  -> Cloudflare
  -> 宝塔/Nginx HTTPS
  -> http://127.0.0.1:7001
  -> Financial
```

---

## 14. 日常更新

以后 `latest` 构建成功后：

```bash
cd /opt/financial
$SUDO docker compose --env-file .env -f compose.yaml pull
$SUDO docker compose --env-file .env -f compose.yaml up -d
$SUDO docker compose --env-file .env -f compose.yaml ps
curl -fsS "http://127.0.0.1:${PORT}/healthz"
```

通常不需要在 VPS 上 `docker build`。

如果 `compose.yaml`、部署文档或环境变量模板发生变化，再执行：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

更新过程中禁止删除 `data/`。

---

## 15. 常用命令

状态：

```bash
$SUDO docker compose --env-file .env -f compose.yaml ps
```

日志：

```bash
$SUDO docker compose --env-file .env -f compose.yaml logs -f app
```

重启：

```bash
$SUDO docker compose --env-file .env -f compose.yaml restart app
```

停止但保留数据：

```bash
$SUDO docker compose --env-file .env -f compose.yaml down
```

启动：

```bash
$SUDO docker compose --env-file .env -f compose.yaml up -d
```

禁止：

```bash
rm -rf data
docker compose down -v
docker system prune -a --volumes
```

---

## 16. 最终成功标准

- [ ] Docker Engine 正常
- [ ] Docker Compose Plugin 正常
- [ ] GitHub 代码更新成功
- [ ] GHCR `latest` 拉取成功
- [ ] `.env` 权限为 600
- [ ] `.env` 使用单一 `PORT=` 配置
- [ ] `COOKIE_SECURE=false`，HTTP 直连可登录
- [ ] `data/` 持久化目录完整
- [ ] 不再运行 Caddy 容器
- [ ] `app` running + healthy
- [ ] 宿主机监听 `$PORT/tcp`
- [ ] `http://127.0.0.1:$PORT/healthz` 成功
- [ ] 首页返回成功 HTTP 响应
- [ ] 防火墙只检查，没有擅自修改

---

## 17. 最终报告模板

### 成功

```text
Financial Ledger 已部署完成。

部署目录：/opt/financial
Git Commit：<FULL_SHA>
Docker 镜像：ghcr.io/iami315/financial:latest
协议：HTTP
端口：<PORT>/tcp
应用容器：healthy
健康检查：通过

直接访问：http://<VPS_IP>:<PORT>
宝塔反代：http://127.0.0.1:<PORT>

防火墙状态：<OPEN / BLOCKED_OR_NOT_ALLOWED / UNCERTAIN>
```

首次部署时再附管理员初始密码。

若端口未放行：

```text
程序已经在 VPS 本机正常运行。
需要你手动开放 TCP <PORT> 入站端口。
我没有修改 VPS 防火墙。
如果本机防火墙已放行但外部仍无法访问，请检查云厂商安全组。
```

### 失败

```text
部署未完成。
失败阶段：<Docker / Git / GHCR / 配置 / 容器启动 / 健康检查 / 其他>
直接错误：<关键错误摘要>
数据目录是否保持完整：是/否/无法确认
需要用户执行的动作：<明确动作>
```

未通过健康检查时禁止报告“部署成功”。