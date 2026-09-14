# Financial Ledger — VPS IP + 端口部署任务书

> 本文档的目标读者是运行在 VPS 上的 Codex。请按本文档直接执行部署，不需要等待用户逐步确认；只有遇到明确需要用户介入的事项时再停止并报告。
>
> 当前阶段 **不使用域名**。部署完成后应能通过 `https://<VPS_IP>:<ACCESS_PORT>` 访问应用。
>
> **重要：不要擅自修改 VPS 防火墙、安全组或云厂商防火墙规则。** 如果目标端口没有放行，只完成本机部署并向用户报告需要开放的端口。

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

推荐部署目录：

```text
/opt/financial
```

默认外部访问端口：

```text
8443/tcp
```

最终访问地址：

```text
https://<VPS_PUBLIC_IP>:8443
```

如果 8443 已被占用，依次尝试：

```text
9443
10443
18443
```

选定其他端口后，最终报告中必须明确告诉用户实际端口。

### 为什么使用 HTTPS 而不是 `http://IP:PORT`

当前应用在 `NODE_ENV=production` 时会把登录 Session Cookie 标记为 `Secure`。因此生产构建若直接通过纯 HTTP 访问，登录态不能可靠工作。

本阶段使用 Caddy 的 `tls internal` 为 IP 地址提供临时 HTTPS。浏览器第一次访问时会因为证书来自 Caddy 内部 CA 而显示“不受信任”警告；这是无域名临时部署的预期行为。用户可在测试阶段手动继续访问。后续配置正式域名后再切换为公开受信任证书。

---

## 2. Codex 执行原则

执行本任务时遵循以下规则：

1. 尽可能自动完成所有可安全完成的步骤。
2. 不删除已有数据库、备份或其他未知业务数据。
3. 不执行 `docker system prune -a` 等可能删除其他项目镜像/数据的高破坏性命令。
4. 不修改 UFW、firewalld、iptables、nftables 或云厂商安全组。
5. 不把 `.env`、数据库、管理员密码、GitHub Token 提交到 Git。
6. 如果发现 `/opt/financial` 已存在旧部署，优先做无损升级；不要直接覆盖未知文件。
7. 如果仓库存在未提交的 tracked 文件修改，不要执行 `git reset --hard`，停止代码更新并报告。
8. 如果 GHCR 私有镜像无法拉取，不要在日志中打印 Token，向用户报告需要 `read:packages` 权限的 GitHub PAT。
9. 部署结束前必须验证容器健康、HTTP API 健康检查以及本机 HTTPS 访问。
10. 最后必须按本文档的“最终报告模板”向用户报告结果。

---

## 3. 检查当前系统

先记录系统信息：

```bash
id
uname -a
cat /etc/os-release
```

检查是否具备 root 权限或 sudo：

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

检查基础工具：

```bash
command -v git || true
command -v curl || true
command -v openssl || true
command -v docker || true
docker compose version || true
```

如果缺少 `git`、`curl`、`openssl`，Debian/Ubuntu 可执行：

```bash
$SUDO apt-get update
$SUDO apt-get install -y git curl ca-certificates openssl
```

---

## 4. 安装 Docker（仅在未安装时）

如果以下命令均成功：

```bash
docker --version
docker compose version
```

则跳过本节。

### Debian / Ubuntu

先确认发行版：

```bash
. /etc/os-release
echo "$ID $VERSION_CODENAME"
```

如果是 Debian 或 Ubuntu，可安装 Docker 官方软件源版本：

```bash
$SUDO install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | $SUDO tee /etc/apt/keyrings/docker.asc >/dev/null
$SUDO chmod a+r /etc/apt/keyrings/docker.asc

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"

cat <<EOF | $SUDO tee /etc/apt/sources.list.d/docker.sources >/dev/null
Types: deb
URIs: https://download.docker.com/linux/${ID}
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF

$SUDO apt-get update
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
$SUDO systemctl enable --now docker
```

重新验证：

```bash
docker --version
docker compose version
```

如果当前用户无权访问 Docker daemon，但 sudo 可用，后续 Docker 命令统一使用：

```bash
$SUDO docker ...
```

如果不是 Debian/Ubuntu 且 Docker 未安装：**不要猜测安装命令**。停止并向用户报告操作系统信息。

---

## 5. 获取公网 IP

优先从服务器外网接口获取：

```bash
VPS_IP="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
```

如果为空，再尝试：

```bash
VPS_IP="$(curl -4fsS --max-time 10 https://ifconfig.me || true)"
```

输出：

```bash
echo "VPS_IP=$VPS_IP"
```

如果仍为空，不要终止整个部署。可以继续完成本机部署，但最终报告必须注明“无法自动识别公网 IP”，并让用户自行代入 VPS 公网 IP。

---

## 6. 选择访问端口

按顺序检查：

```bash
for p in 8443 9443 10443 18443; do
  if ! ss -ltnH | awk '{print $4}' | grep -Eq "(^|:)${p}$"; then
    ACCESS_PORT="$p"
    break
  fi
done

if [ -z "${ACCESS_PORT:-}" ]; then
  echo "ERROR: 8443/9443/10443/18443 均被占用。"
  exit 1
fi

echo "ACCESS_PORT=$ACCESS_PORT"
```

不要关闭占用端口的其他服务。

---

## 7. 检查防火墙，但不要修改

目标是判断 `$ACCESS_PORT/tcp` 是否可能被 VPS 本机防火墙阻断。

### UFW

```bash
if command -v ufw >/dev/null 2>&1; then
  $SUDO ufw status verbose || true
fi
```

如果 UFW 为 `Status: active`，检查是否有 `$ACCESS_PORT/tcp` 的 ALLOW 规则。

### firewalld

```bash
if command -v firewall-cmd >/dev/null 2>&1; then
  $SUDO firewall-cmd --state || true
  $SUDO firewall-cmd --list-ports || true
  $SUDO firewall-cmd --list-services || true
fi
```

### nftables / iptables

只查看，不修改：

```bash
if command -v nft >/dev/null 2>&1; then
  $SUDO nft list ruleset || true
fi

if command -v iptables >/dev/null 2>&1; then
  $SUDO iptables -S || true
fi
```

将判断结果记录为下列之一：

```text
FIREWALL_PORT_STATUS=OPEN
FIREWALL_PORT_STATUS=BLOCKED_OR_NOT_ALLOWED
FIREWALL_PORT_STATUS=UNCERTAIN
```

如果是 `BLOCKED_OR_NOT_ALLOWED` 或 `UNCERTAIN`：

- **不要执行任何放行命令。**
- 继续完成 Docker 部署。
- 最终报告中明确告诉用户需要检查/放行 `$ACCESS_PORT/tcp`。

云厂商安全组通常无法从 VPS 内部完整判断。如果本机服务正常但外部无法访问，也应在最终报告中提醒用户检查云厂商控制台中的入站规则。

---

## 8. 准备部署目录和代码

```bash
$SUDO mkdir -p /opt/financial
$SUDO chown "$(id -u):$(id -g)" /opt/financial
cd /opt/financial
```

### 首次部署

如果目录中不存在 `.git`：

```bash
git clone https://github.com/IAMI315/Financial.git .
```

### 已部署过

如果存在 `.git`，先检查 **tracked 文件** 是否有修改：

```bash
git status --short
git diff --quiet && git diff --cached --quiet
TRACKED_DIRTY=$?
```

如果 `TRACKED_DIRTY` 非 0，停止代码更新并报告，不要覆盖。

首次部署成功后，本机还会生成 `Caddyfile.ip` 和 `compose.ip.yaml`。它们是 VPS 专用配置，不应提交 Git。确保写入本仓库本机专用忽略文件：

```bash
touch .git/info/exclude
grep -qxF 'Caddyfile.ip' .git/info/exclude || echo 'Caddyfile.ip' >> .git/info/exclude
grep -qxF 'compose.ip.yaml' .git/info/exclude || echo 'compose.ip.yaml' >> .git/info/exclude
```

`.env` 和 `data/` 已由仓库 `.gitignore` 忽略。

如果 tracked 工作区干净：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

记录当前版本：

```bash
FULL_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
echo "FULL_SHA=$FULL_SHA"
echo "SHORT_SHA=$SHORT_SHA"
```

应用镜像始终设置为 `main` 分支最近一次成功构建的 `latest`：

```bash
LEDGER_IMAGE="ghcr.io/iami315/financial:latest"
echo "LEDGER_IMAGE=$LEDGER_IMAGE"
```

`FULL_SHA` / `SHORT_SHA` 仍用于最终报告和故障定位，但不再用于日常部署镜像选择。GitHub Actions 同时保留 `sha-xxxxxxx` 标签，必要时可用于精确回滚。

---

## 9. 检查 GHCR 镜像可访问性

先尝试拉取：

```bash
$SUDO docker pull "$LEDGER_IMAGE"
```

如果成功，继续。

如果出现 `unauthorized`、`denied` 等权限错误：

1. 不要反复重试。
2. 不要把任何已有 GitHub 凭据打印到日志。
3. 向用户报告：

```text
GHCR 镜像当前需要身份认证。
请提供/配置一个 GitHub Personal Access Token (classic)，至少具有 read:packages 权限，然后执行 docker login ghcr.io。
```

用户完成登录后可执行：

```bash
read -rsp "GitHub GHCR Token: " CR_PAT
echo
printf '%s' "$CR_PAT" | $SUDO docker login ghcr.io -u IAMI315 --password-stdin
unset CR_PAT
```

然后重新执行：

```bash
$SUDO docker pull "$LEDGER_IMAGE"
```

如果 `latest` 不存在或无法拉取，先确认 GitHub `main` 对应的 Actions `CI and Container` 是否构建成功。不要擅自回退到未知旧镜像。

---

## 10. 创建部署环境变量

如果 `/opt/financial/.env` 已存在，不要覆盖其中的 `APP_SECRET` 和已经使用过的管理员初始化信息。

### 首次部署时生成密钥

```bash
APP_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n' | tr '/+' '_-')"
```

管理员用户名默认：

```text
admin
```

如果已成功获取公网 IP：

```bash
PUBLIC_URL="https://${VPS_IP}:${ACCESS_PORT}"
```

否则暂时不写 `PUBLIC_URL`。

首次部署创建 `.env`：

```bash
cat > .env <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_URL=/data/ledger.db
BACKUP_DIR=/data/backups
APP_SECRET=${APP_SECRET}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
REGISTRATION_OPEN=true
APP_VERSION=0.1.0
VPS_IP=${VPS_IP}
ACCESS_PORT=${ACCESS_PORT}
LEDGER_IMAGE=${LEDGER_IMAGE}
EOF
```

如果 `VPS_IP` 非空，再追加：

```bash
echo "PUBLIC_URL=https://${VPS_IP}:${ACCESS_PORT}" >> .env
```

限制权限：

```bash
chmod 600 .env
```

**必须保存本次生成的 `ADMIN_PASSWORD`，在最终报告中只显示一次给用户。**

注意：管理员首次成功写入数据库后，`.env` 中的 `ADMIN_PASSWORD` 只是初始化来源，之后不会持续覆盖数据库内的管理员密码。

---

## 11. 准备持久化数据目录

```bash
mkdir -p data/backups
$SUDO chown -R 1000:1000 data
```

绝对不要删除已有：

```text
data/ledger.db
data/backups/
```

---

## 12. 创建 IP 临时 HTTPS 配置

不要修改仓库自带的正式域名版 `Caddyfile` 和 `compose.yaml`。另外创建仅用于 VPS 无域名阶段的本地文件。

### `Caddyfile.ip`

```bash
cat > Caddyfile.ip <<'EOF'
https://{$VPS_IP}:{$ACCESS_PORT} {
  tls internal
  encode zstd gzip
  reverse_proxy app:3000

  header {
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy strict-origin-when-cross-origin
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
}
EOF
```

如果 `VPS_IP` 无法识别，则不能生成有效的 IP HTTPS 证书站点地址。此时停止在启动前，并向用户询问 VPS 公网 IPv4；不要把 `127.0.0.1` 当成公网地址。

### `compose.ip.yaml`

```bash
cat > compose.ip.yaml <<'EOF'
services:
  app:
    image: ${LEDGER_IMAGE:-ghcr.io/iami315/financial:latest}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      DATABASE_URL: /data/ledger.db
      BACKUP_DIR: /data/backups
    volumes:
      - ./data:/data
    networks:
      - ledger-internal
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    environment:
      VPS_IP: ${VPS_IP}
      ACCESS_PORT: ${ACCESS_PORT}
    ports:
      - "${ACCESS_PORT}:${ACCESS_PORT}/tcp"
    volumes:
      - ./Caddyfile.ip:/etc/caddy/Caddyfile:ro
      - caddy_ip_data:/data
      - caddy_ip_config:/config
    networks:
      - ledger-internal

networks:
  ledger-internal:
    driver: bridge

volumes:
  caddy_ip_data:
  caddy_ip_config:
EOF
```

验证 Compose 解析：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml config >/tmp/financial-compose-rendered.yaml
```

如果该命令失败，先修复配置，禁止带错误启动。

---

## 13. 启动服务

拉取镜像：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml pull
```

启动：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml up -d
```

查看状态：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml ps
```

应用容器应最终显示 `healthy`。

如果未健康：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml logs --tail=200 app
$SUDO docker compose --env-file .env -f compose.ip.yaml logs --tail=200 caddy
```

分析并修复可安全修复的问题。如果涉及删除数据库或重建数据，停止并报告用户。

---

## 14. 部署后验证

### 14.1 容器状态

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml ps
```

要求：

- `app`：running + healthy
- `caddy`：running

### 14.2 监听端口

```bash
ss -ltnp | grep ":${ACCESS_PORT} " || ss -ltnp | grep ":${ACCESS_PORT}$" || true
```

必须确认宿主机已经监听 `$ACCESS_PORT/tcp`。

### 14.3 HTTPS 健康检查

由于 Caddy 使用内部证书，curl 需要 `-k`：

```bash
curl -kfsS "https://${VPS_IP}:${ACCESS_PORT}/healthz"
```

期望响应包含：

```json
{"status":"ok","service":"financial-ledger-api"}
```

### 14.4 首页

```bash
curl -kI "https://${VPS_IP}:${ACCESS_PORT}/"
```

应得到成功的 HTTP 响应，而不是 502/503。

### 14.5 数据目录

```bash
ls -lah data
ls -lah data/backups || true
```

首次启动后应能看到 SQLite 数据库文件。

---

## 15. 防火墙报告规则

如果本机 `curl -k https://$VPS_IP:$ACCESS_PORT/healthz` 成功，但根据第 7 节检查发现防火墙未放行或状态不确定：

**不要修改防火墙。**

向用户明确报告：

```text
程序已经部署并在 VPS 本机正常运行。
当前访问端口：<ACCESS_PORT>/tcp
检测到该端口在 VPS 防火墙中未明确放行（或无法确认）。
请你手动在 VPS 防火墙/云厂商安全组中开放 TCP <ACCESS_PORT> 入站端口。
开放后访问：https://<VPS_IP>:<ACCESS_PORT>
```

如果本机防火墙确认已放行，但用户外部仍无法访问，报告：

```text
VPS 本机服务和本机防火墙检查正常，请检查云厂商控制台的 Security Group / Firewall / ACL 是否允许 TCP <ACCESS_PORT> 入站。
```

---

## 16. 浏览器访问说明

访问：

```text
https://<VPS_IP>:<ACCESS_PORT>
```

由于当前阶段没有域名，Caddy 使用内部 CA 签发临时证书，浏览器通常会显示证书风险提示。

这是临时 IP 部署的预期结果。测试阶段可以手动选择继续访问。

不要为了消除警告而关闭应用的 Secure Cookie 或把生产环境降级成 HTTP。

后续有域名后，应恢复使用仓库自带的：

```text
compose.yaml
Caddyfile
```

由 Caddy 自动申请公开受信任的 HTTPS 证书。

---

## 17. 后续更新程序

在 `/opt/financial` 下执行：

```bash
cd /opt/financial
```

先确认 tracked 工作区干净：

```bash
git status --short
```

注意：`Caddyfile.ip`、`compose.ip.yaml`、`.env` 和 `data/` 应保持为本机部署文件/忽略文件，不应提交。

### 日常应用升级（推荐）

确保 `.env` 使用：

```text
LEDGER_IMAGE=ghcr.io/iami315/financial:latest
```

如果这是从旧的 SHA 固定镜像迁移到 `latest`，只需要执行一次：

```bash
sed -i 's#^LEDGER_IMAGE=.*#LEDGER_IMAGE=ghcr.io/iami315/financial:latest#' .env
```

之后每次 GitHub `main` 的 Actions 构建成功，VPS 日常升级只需要：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml pull
$SUDO docker compose --env-file .env -f compose.ip.yaml up -d
$SUDO docker compose --env-file .env -f compose.ip.yaml ps
curl -kfsS "https://${VPS_IP}:${ACCESS_PORT}/healthz"
```

这里不需要在 VPS 上 `docker build`。GitHub Actions 已经完成构建，VPS 只负责拉取并重新创建容器。

只有当 `compose.ip.yaml`、Caddy 配置或部署文档本身发生变化时，才需要额外更新仓库源码：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

更新过程中禁止删除 `data/`。

---

## 18. 常用运维命令

部署目录：

```bash
cd /opt/financial
```

状态：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml ps
```

应用日志：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml logs -f app
```

Caddy 日志：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml logs -f caddy
```

重启：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml restart
```

停止但保留数据库和 volume：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml down
```

再次启动：

```bash
$SUDO docker compose --env-file .env -f compose.ip.yaml up -d
```

**不要执行：**

```bash
rm -rf data
docker compose down -v
docker system prune -a --volumes
```

除非用户明确要求删除所有业务数据。

---

## 19. 最终成功标准

只有同时满足以下条件，才可以向用户报告“部署成功”：

- [ ] Docker Engine 正常
- [ ] Docker Compose Plugin 正常
- [ ] GitHub 仓库代码获取成功
- [ ] GHCR `latest` 镜像拉取成功
- [ ] `.env` 已安全创建，权限为 600
- [ ] `data/` 持久化目录存在且可写
- [ ] `app` 容器 running + healthy
- [ ] `caddy` 容器 running
- [ ] 宿主机正在监听 `$ACCESS_PORT/tcp`
- [ ] `curl -k https://$VPS_IP:$ACCESS_PORT/healthz` 成功
- [ ] 首页可返回成功 HTTP 响应
- [ ] 已检查防火墙状态且没有擅自修改防火墙
- [ ] 最终报告包含实际 IP、端口、Git SHA、镜像标签和防火墙结论

---

## 20. 最终报告模板

Codex 执行结束后，按以下格式向用户报告，不要只说“完成了”。

### 部署成功时

```text
Financial Ledger 已部署完成。

部署目录：/opt/financial
Git Commit：<FULL_SHA>
Docker 镜像：ghcr.io/iami315/financial:latest
应用容器：healthy
Caddy：running
健康检查：通过

访问地址：https://<VPS_IP>:<ACCESS_PORT>

临时管理员：
用户名：admin
初始密码：<仅首次部署时显示生成的密码；已有数据库时不要声称密码被重置>

证书说明：当前无域名，使用 Caddy 内部证书，浏览器第一次访问会提示证书不受信任，测试阶段可手动继续。

防火墙状态：<OPEN / BLOCKED_OR_NOT_ALLOWED / UNCERTAIN>
```

如果端口未放行，再追加：

```text
需要你手动开放 TCP <ACCESS_PORT> 入站端口。
我没有修改 VPS 防火墙。
如果 VPS 本机防火墙已放行但仍无法访问，请同时检查云厂商安全组。
```

### 部署失败时

必须给出：

```text
部署未完成。
失败阶段：<Docker 安装 / Git / GHCR / 配置 / 容器启动 / 健康检查 / 其他>
直接错误：<关键错误摘要>
已完成步骤：<简述>
数据目录是否保持完整：是/否/无法确认
需要用户执行的动作：<明确的一件或几件事>
```

不要隐藏失败，不要在未通过健康检查时报告“部署成功”。
