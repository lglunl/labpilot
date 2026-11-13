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

`.env` 里关键配置：

```
LAB_API_TOKEN=你的密钥          # 与所有设备电脑一致
LLM_API_KEY=sk-xxx              # DeepSeek key（摘要功能用）
```

### 2. 开放公网（当前用 quick tunnel）

```powershell
.workbuddy\cloudflared.exe tunnel --url http://127.0.0.1:8080 --no-autoupdate --protocol http2
```

运行后会输出一个 `https://xxx.trycloudflare.com` 网址，这就是预约服务的公网地址。

> ⚠️ quick tunnel 网址每次重启都会变。改为固定网址的方案见 `TODO.md`。

### 3. 查看设备（仪器）ID

两种方式：

- 看代码 `server/db.js` 里的 `SEED_INSTRUMENTS`；
- 或调接口（带密钥）：

```powershell
curl.exe -H "Authorization: Bearer 你的密钥" https://xxx.trycloudflare.com/api/instruments
```

返回每个仪器的 `id`（如 `inst_fc`、`inst_clsm`、`inst_pcr`、`inst_centrifuge`），部署时把这个 `id` 填到对应设备电脑上。

---

## 二、设备电脑（扫码 agent）

每台设备电脑一份代码，改两个地方：

### 1. `config.json`

```json
{
  "booking_api_base": "https://xxx.trycloudflare.com",
  "booking_api_token": "",
  "instrument_id": "inst_fc",
  "require_booking": true
}
```

- `booking_api_base`：预约服务器的公网网址。
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

所有接口都需要 `Authorization: Bearer <密钥>`，不带或错误返回 401。
