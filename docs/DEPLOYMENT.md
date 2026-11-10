# 部署方案

## 架构

```
┌─────────────────────┐         ┌──────────────────────┐
│  预约服务器（labpilot） │  ◀───   │  设备电脑（扫码 agent）×N  │
│  跑在你的一台机器上      │  HTTPS │  每台装在一台仪器电脑上       │
│  - 预约/台账/看板界面    │        │  - 扫码登录 / 上机 / 下机     │
│  - sqlite 数据库        │        │  - 调预约服务器的接口          │
│  - HTTP 接口            │        └──────────────────────┘
└─────────────────────┘
        ▲
        │ 通过公网网址访问（当前用 Cloudflare quick tunnel）
        │ https://xxx.trycloudflare.com
```

- 预约服务器是「被连接方」，需要公网可达（或通过隧道）。
- 每台设备电脑是「主动连接方」，只要能上网即可，不需要公网 IP。
- 设备电脑通过 `instrument_id` 区分「这台电脑管的是哪台仪器」。

---

## 一、预约服务器（labpilot）

### 1. 启动服务

```powershell
cd D:\cursor_home\labpilot
node --env-file-if-exists=.env server/index.js
```

配置文件是 **`D:\cursor_home\labpilot\.env`**（不要提交到 git）。关键项：

```
LAB_API_TOKEN=你的密钥          # 与所有设备电脑一致
LLM_API_KEY=sk-xxx              # DeepSeek key（摘要功能用）
PUBLIC_BASE_URL=https://xxx.trycloudflare.com
```

### 2. 开放公网（当前用 quick tunnel）

另开一个窗口，不要关掉：

```powershell
cd D:\cursor_home\labpilot
.workbuddy\cloudflared.exe tunnel --url http://127.0.0.1:8080 --no-autoupdate --protocol http2
```

窗口里会出现一行 `https://xxx.trycloudflare.com`，这就是预约服务的公网地址。

隧道已经在跑、窗口找不到时，用本机指标读当前地址（cloudflared 默认监听 `127.0.0.1:20241`）：

```powershell
(Invoke-WebRequest http://127.0.0.1:20241/metrics -UseBasicParsing).Content |
  Select-String 'userHostname="https://[^"]+"'
```

> quick tunnel 每次重启都会换一个新地址。地址一变，下面第 3 步要重做，已经打印的二维码也要重新下载。固定网址还没做。

### 3. 把公网地址写进 `.env`（后续测试按这个做）

打印二维码、手机扫码跳转，用的都是 `.env` 里的 `PUBLIC_BASE_URL`，不是 cloudflared 窗口里临时看一眼就行。

1. 打开 `D:\cursor_home\labpilot\.env`。
2. 写成当前隧道地址，末尾不要加 `/`：

```
PUBLIC_BASE_URL=https://xxx.trycloudflare.com
```

3. 停掉正在听 `8080` 的 node，再用第 1 步的命令启动。只改文件不重启，进程仍用旧地址。
4. 设备电脑 `config.json` 的 `booking_api_base` 填同一个地址（同样不要末尾 `/`）。

自测：

```powershell
curl.exe https://xxx.trycloudflare.com/api/health
```

返回 200 即隧道和本机服务都通。然后用管理员登录，在「设备管理」里点某台仪器的「二维码」。下载的 SVG 编码的是 `{PUBLIC_BASE_URL}/s/{仪器ID}`，例如 `https://xxx.trycloudflare.com/s/inst_fc`。没配 `PUBLIC_BASE_URL` 时，从本机后台下载会返回 400。

### 4. 查看设备（仪器）ID

两种方式：

- 看代码 `server/db.js` 里的 `SEED_INSTRUMENTS`；
- 或调接口（带密钥）：

```powershell
curl.exe -H "Authorization: Bearer 你的密钥" https://xxx.trycloudflare.com/api/instruments
```

返回每个仪器的 `id`（如 `inst_fc`、`inst_clsm`、`inst_pcr`、`inst_centrifuge`），部署时把这个 `id` 填到对应设备电脑上。

---

## 二、设备电脑（扫码 agent）

每台设备电脑一份代码，改两个地方。更细的步骤见扫码 agent 仓库根目录的 `DEPLOYMENT.md`。

### 1. `config.json`

```json
{
  "booking_api_base": "https://xxx.trycloudflare.com",
  "booking_api_token": "",
  "instrument_id": "inst_fc",
  "require_booking": true
}
```

- `booking_api_base`：和预约服务器 `.env` 里的 `PUBLIC_BASE_URL` 相同。
- `instrument_id`：这台设备对应哪台仪器（就是上面查到的仪器 `id`）。
- `require_booking`：是否强制「有预约才能上机」，一般保持 `true`。

### 2. 密钥（用环境变量，不要写进 config.json）

密钥不要填在 `config.json` 里（否则会被提交到 git 泄露）。用环境变量 `LAB_API_TOKEN` 提供，扫码 agent 启动时优先读它：

```powershell
# PowerShell（当前会话生效）
$env:LAB_API_TOKEN = "你的密钥"
python -m labcheckin
```

或在系统环境变量里永久设置 `LAB_API_TOKEN`。

### 3. 启动

```powershell
cd 扫码agent目录
python -m labcheckin
```

启动后扫码 agent 会自己开一条 quick tunnel，并把当前公网地址登记回预约服务器。设备隧道重启不用改打印出来的二维码；预约服务器的隧道重启才要改 `PUBLIC_BASE_URL` 并重新下载二维码。

---

## 三、密钥说明

- **所有设备电脑用同一个密钥**。这个密钥是「机器与机器之间」的凭证，不是用户密码。
- 服务器 `.env` 里的 `LAB_API_TOKEN` 和每台设备的 `LAB_API_TOKEN` 必须一致。
- 用户登录用的是各自账号密码（走 `/api/users/verify`），与这个密钥无关。

---

## 四、数据流

| 操作 | 设备电脑（扫码 agent） | 预约服务器 |
|---|---|---|
| 登录 | `POST /api/users/verify` | 校验是否注册用户 |
| 上机前 | `GET /api/bookings/active` | 查该仪器 + 该用户当前时段有效预约 |
| 上机后 | `POST /api/bookings/:id/scan` (check-in) | 回写上机时间 |
| 下机后 | `POST /api/bookings/:id/scan` (check-out) | 回写下机时间 |
| 设备上线 | `POST /api/instruments/:id/presence` | 登记这台设备当前的公网地址 |

除仪器列表、单台仪器预约这些读取接口外，上表接口都需要 `Authorization: Bearer <密钥>`，不带或错误返回 401。
