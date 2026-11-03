# LabPilot Docker 部署指南

目标：**把整个项目拷到任意一台装了 Docker 的电脑上，一条命令跑起来**，不用装 Node、不用单独装 Ollama。

---

## 0. 先搞清楚一件事：你这台机器适合哪种方式

项目运行需要两样东西：**Web 服务**（很轻，任何机器都行）和 **推理引擎 Ollama**（吃显卡）。

问题在于：**Docker 容器拿不到 AMD / Intel 核显的加速**。

| 你的机器 | 推荐方案 | 原因 |
|---|---|---|
| 有 NVIDIA 独显 | `docker-compose.yml` + `docker-compose.nvidia.yml` | 容器能直通 CUDA |
| AMD / Intel 核显（比如本机 780M） | **`docker-compose.host-ollama.yml`** | 核显 Vulkan 无法透传容器，容器内只能纯 CPU，慢 3~5 倍 |
| 没有独显也不在乎速度 | `docker-compose.yml` | 纯 CPU 也能跑，7B 大约 4~5 tok/s |
| 只想跑前端看界面，不要 AI | `docker-compose.host-ollama.yml`（Ollama 起不来会自动降级到规则摘要） | 后端有兜底，接口永远返回 200 |

---

## 1. 前置条件

- Docker Desktop（Windows / macOS）或 Docker Engine（Linux）
- 磁盘：镜像约 1.2GB + 模型 4.7GB，预留 **8GB**
- 内存：至少 **8GB** 可用（7B Q4 需要约 5GB）

确认 Docker 可用：

```bash
docker version
docker compose version
```

---

## 2. 方案 A：全容器（最省事，需要 NVIDIA 卡才快）

```bash
docker compose up -d --build
```

会依次做：
1. 构建 `labpilot-app` 镜像（零依赖，约 30 秒）
2. 启动 `ollama` 容器
3. `model-init` 一次性容器自动 `ollama pull qwen2.5:7b-instruct-q4_K_M`（首次约 4.7GB，请耐心）
4. 启动 `app` 和 `tunnel`

有 NVIDIA 卡的话加一层：

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d --build
```

---

## 3. 方案 B：容器跑 Web，宿主机跑 Ollama（AMD 核显推荐）

**第一步，让宿主机 Ollama 允许容器访问。** 默认它只监听 `127.0.0.1`，容器连不上：

```powershell
# Windows PowerShell（普通权限即可，用户级变量）
[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User')
```

然后重启 Ollama（退出托盘图标再启动，或在任务管理器结束 `ollama.exe` 后重新运行）。

**第二步，起容器：**

```bash
docker compose -f docker-compose.host-ollama.yml up -d --build
```

容器内通过 `host.docker.internal:11434` 访问宿主机的 Ollama，GPU 加速仍然生效。

---

## 4. 确认跑起来了

```bash
docker compose ps
curl http://localhost:8080/api/health
```

健康时返回：

```json
{"ok":true,"ollama":"up","model":"qwen2.5:7b-instruct-q4_K_M","modelLoaded":true,...}
```

浏览器打开 **http://localhost:8080** 就是完整界面，点「生成摘要」会调用容器里的 7B。

---

## 5. 拿外网地址

隧道是 `cloudflared` 容器，地址在它的日志里：

```bash
docker logs labpilot-tunnel 2>&1 | grep trycloudflare.com
```

Windows 上双击 `docker-tunnel-url.cmd` 也行。

> 提醒：quick tunnel 的地址**每次容器重建都会变**，且官方不保证可用性。要固定地址，得用命名隧道或 Tailscale。

不想暴露到公网，就把 `docker-compose.yml` 里的 `tunnel` 整段注释掉或删除。

---

## 6. 移植到新电脑：完整步骤

1. 拷贝整个项目目录（`.workbuddy/`、`node_modules/` 可以不要，`.dockerignore` 已排除）
2. 新电脑装 Docker Desktop 并启动
3. 进入项目目录，按上面的方案 A 或 B 执行一条 `docker compose up`
4. 首次会自动拉模型；之后模型存在 named volume `ollama-models` 里，重装容器不用重下

如果新电脑要复用已有的模型文件（不想重下 4.7GB），把模型目录挂进去：

```yaml
  ollama:
    volumes:
      - ./ollama-models:/root/.ollama     # 把宿主机目录挂进去
```

Ollama 的模型目录结构是 `manifests/` + `blobs/`，直接拷贝整个 `.ollama` 目录即可。

---

## 7. 常用命令

```bash
docker compose ps                  # 状态
docker compose logs -f app         # 看后端日志
docker compose logs -f tunnel      # 看隧道日志
docker compose restart app         # 重启 Web 服务
docker compose down                # 停止（保留模型）
docker compose down -v             # 停止并删除模型（下次要重下 4.7GB）
docker compose up -d --build       # 改代码后重新构建
```

---

## 8. 换模型

改 `.env`（在项目根目录新建）：

```env
OLLAMA_MODEL=qwen3:4b
APP_PORT=8080
```

然后：

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen3:4b
```

4B 模型只有 2.5GB，速度大约是 7B 的两倍，中文摘要质量略降但够用。在核显机器上体验明显更好。

---

## 9. 常见问题

**Q：`app` 容器一直 unhealthy？**
`curl http://localhost:8080/api/health` 看具体内容。`ollama: down` 说明连不上推理引擎——方案 B 下通常是宿主机 Ollama 没监听 `0.0.0.0`。

**Q：点了生成摘要报错 / 很慢？**
首次请求要加载模型（15~20 秒）加推理（30~50 秒），合计一分钟以上是正常的。之后同样内容有缓存，0.4 秒返回。

**Q：端口 8080 被占用？**
改 `.env` 里的 `APP_PORT=8090`，然后 `docker compose up -d`。

**Q：和本机原来的 `start.cmd` 能同时开吗？**
不能，两者都抢 8080 和 11434。用 Docker 前先停掉原来的守护窗口。

**Q：容器内中文日志乱码？**
`node:22-alpine` 默认 UTF-8，不会乱码。若宿主机终端是 GBK 建议 `chcp 65001`。

---

## 10. 为什么这么设计

- **不用 npm install**：项目本身零依赖，`Dockerfile` 因此没有 `RUN npm install`，构建 30 秒内完成，也不会有依赖供应链风险。
- **镜像不带模型**：模型 4.7GB 放 named volume，镜像保持轻量，换模型不用重建。
- **`model-init` 用一次性容器**：把「拉模型」变成 `compose up` 的一部分，新电脑上不用记第二条命令。
- **`app` 的健康检查只看 HTTP 200**：Ollama 掉线时后端会降级成规则摘要并仍返回 200，这是设计行为，不该判成容器故障。
- **`tunnel` 单独一个服务**：不想要外网访问就直接删掉这段，不影响其它服务。
