# LabPilot · 本地大模型接入与后端架构技术方案

版本：v1 · 2026-11-02
目标：用 Ollama 在本机部署大模型，让前端 Team Agent 的「群聊摘要」真正调用模型；并给出从纯前端演进到产品化后端的完整架构路线。

---

## 0. 现状与结论速览

| 项 | 现状 | 结论 |
|---|---|---|
| 前端调用点 | `app.js:991` 已 `fetch('/api/agent/summarize')` | 接口契约已定死，后端只要按契约实现即可，前端零改动 |
| 后端 | 无（python http.server 只托管静态文件） | 请求必然失败，走 `buildRuleSummary()` 正则兜底 |
| 本机算力 | Ryzen 7 H 255 / Radeon 780M 核显 / 24GB 内存 / 无 N 卡 | Windows 上 ROCm 不支持 APU 核显，走 **Vulkan**（还需 `OLLAMA_IGPU_ENABLE=1`） |
| 已有资产 | Ollama 0.40.13 已安装并在跑；`work\ollama\models` 已有 qwen2.5 7B | 模型与运行中的服务**未连通**，配好 `OLLAMA_MODELS` 即可复用 |
| 推荐模型 | — | 复用已有的 **qwen-local:7b**（4.7GB，7.6B Q4_K_M），或新拉 qwen3:4b 提速 |
| 实测性能 | — | iGPU **6.5 tok/s**，CPU 4.8 tok/s；220 token 约 34s，一次完整摘要约 60~100s |

---

## 1. 本机环境判断（已实测）

```
CPU:   AMD Ryzen 7 H 255 w/ Radeon 780M Graphics（8C/16T Zen4）
GPU:   AMD Radeon 780M（RDNA3 核显，共享系统内存）｜无 NVIDIA
RAM:   23.3 GB 可用      磁盘: C 盘剩余 270 GB
Ollama: 未安装
```

**三条硬性结论：**

1. **ROCm 在 Windows 上不支持 Ryzen APU 核显**（官方仅支持 RX / PRO 独显 + HIP7 驱动栈），无论怎么设 `HSA_OVERRIDE_GFX_VERSION` 都识别不到，不必浪费时间。
2. **走 Vulkan，但必须额外开一个开关**：Ollama 0.30 起 Vulkan 默认启用，能正确识别 780M；但日志会打印 `dropping integrated GPU; to enable, set OLLAMA_IGPU_ENABLE=1` —— **默认丢弃核显**。加上 `OLLAMA_IGPU_ENABLE=1` 后模型才真正进显存（`ollama ps` 的 `size_vram` 才非 0）。社区实测同代核显（Radeon 890M）跑 7B 约 14~20 tok/s，本机实测 6.5 tok/s（见 §2.5）。
3. **内存是瓶颈**：核显没有独立显存，模型占用走系统内存。24GB 要同时跑前端 + 后端 + 数据库，**7B 以上不划算**，4B 是甜点。

---

## 2. 阶段一：Ollama 部署（预计 15 分钟）

### 2.1 安装

```powershell
# 方式 A：官方安装包（推荐，免管理员，装到用户目录）
# https://ollama.com/download  → OllamaSetup.exe

# 方式 B：scoop（带完整 GPU 依赖）
scoop install extras/ollama-full

# 方式 C：winget
winget install Ollama.Ollama
```

### 2.2 关键环境变量（系统变量，改完需重启）

```powershell
# 模型放 D 盘，别吃 C 盘
[System.Environment]::SetEnvironmentVariable('OLLAMA_MODELS', 'D:\ollama-models', 'Machine')
# 核显关键开关 1：启用 Vulkan 后端（0.40 已默认 true，写上更保险）
[System.Environment]::SetEnvironmentVariable('OLLAMA_VULKAN', '1', 'Machine')
# 核显关键开关 2：允许使用集成显卡（不开则日志出现 dropping integrated GPU）
[System.Environment]::SetEnvironmentVariable('OLLAMA_IGPU_ENABLE', '1', 'Machine')
# 只允许本机访问，不对外暴露
[System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', '127.0.0.1:11434', 'Machine')
# 只加载 1 个模型，避免内存被多个模型切分
[System.Environment]::SetEnvironmentVariable('OLLAMA_MAX_LOADED_MODELS', '1', 'Machine')
[System.Environment]::SetEnvironmentVariable('OLLAMA_NUM_PARALLEL', '1', 'Machine')
```

> **已有模型可直接复用**：本机 `C:\Users\wangy\Documents\Codex\2026-10-29\w-x\work\ollama\models` 下已有
> `qwen2.5:7b-instruct-q4_K_M`（4.68GB）和基于它构建的 `qwen-local:7b`（带 LabPilot 系统提示词）。
> 把 `OLLAMA_MODELS` 指向该目录，重启 Ollama 后 `/api/tags` 即可看到它们，**无需重新下载 4.7GB**。
> 注意：正在运行的服务（`AppData\Local\Programs\Ollama\ollama.exe serve`）当前用的是默认空目录，所以 `tags` 为空。

### 2.3 拉模型并验证 GPU 是否生效

```powershell
ollama pull qwen3:4b          # 2.5 GB
# 可选高配：ollama pull qwen3:8b   # 5.2 GB

ollama serve                   # 观察日志
# 正确：inference compute library=Vulkan name=Vulkan0 description="AMD Radeon(TM) 780M Graphics" type=iGPU
# 错误：library=cpu  → OLLAMA_VULKAN 未生效（确认是系统变量且已重启）

ollama run qwen3:4b "用一句话说明共聚焦显微镜的用途"
ollama ps                      # 确认 PROCESSOR 列显示 GPU 而非 CPU
```

### 2.4 模型选型依据

| 模型 | 体积 | 上下文 | 说明 |
|---|---|---|---|
| **qwen-local:7b**（本机已有） | 4.68 GB | 32K | 基于 qwen2.5:7b-instruct-q4_K_M，已内置 LabPilot 系统提示词，支持 tools，中文本土语境好 |
| qwen2.5:7b-instruct-q4_K_M（本机已有） | 4.68 GB | 32K | 同上模型的原始版本，无自定义系统提示词 |
| qwen3:4b（可选提速） | 2.5 GB | 256K | 体积减半、速度快约 2 倍，中文强，适合追求响应速度 |
| qwen3:1.7b | 1.4 GB | 40K | 仅在 7B 都跑不动时降级使用 |
| bge-m3 | ~1.2 GB | — | 后续做 RAG 时的中文向量模型（第二阶段） |

**必须关掉思考模式**（仅对 Qwen3 等推理模型生效）：`think: false`。Qwen3 默认开启 thinking，推理链会吃掉 `num_predict` 预算，经常出现「思考完了没输出正文」的静默失败，对摘要这种抽取式任务是纯浪费。已有的 qwen2.5 不是推理模型，无此问题。

### 2.5 本机实测数据（2026-11-02）

| 场景 | 结果 |
|---|---|
| 模型加载 | qwen-local:7b，7.6B / Q4_K_M / ctx 32768，`capabilities: completion, tools` |
| CPU 推理 | `size_vram: 0`，约 **4.8 tok/s** |
| iGPU（Vulkan + IGPU_ENABLE） | `size_vram: 4.76 GB`，约 **6.5 tok/s**，220 token 耗时 34s |
| 结论 | 核显比 CPU 仅快约 35%（共享内存带宽所限），但省下 4.7GB 内存压力；摘要任务建议 `num_predict ≤ 500`，整体耗时 60~100s，前端 190s 超时可用 |

---

## 3. 接口契约（从前端代码反推，必须严格对齐）

`app.js` 发出的请求（`requestLocalModelSummary`）：

```jsonc
POST /api/agent/summarize
{
  "groupId": "group_microfluidic",
  "agentId": "agent_yanzhu",
  "messages": [                       // 已过滤：仅 type==='text' 且非 agent 自己发的，最多 80 条
    { "id": "msg_002", "sender": "周群", "content": "昨天的共聚焦数据背景还是偏高…" }
  ],
  "instruments": [ { "id": "inst_clsm", "name": "共聚焦显微镜", "code": "CLSM-01" } ]
}
```

前端 `commitSummary()` 消费的响应（**字段一个都不能少**）：

```jsonc
{
  "summary": {
    "headline": "当前重点是：下午重扫一组共聚焦数据",     // string，渲染为摘要标题
    "decisions": [ { "text": "...", "messageId": "msg_003" } ],  // ≤4 条
    "tasks":     [ { "text": "...", "messageId": "msg_002" } ],  // ≤5 条
    "risks":     [ { "text": "...", "messageId": "msg_002" } ],  // ≤4 条
    "labActions": [                                              // 可选
      { "type": "booking_draft", "instrumentId": "inst_clsm", "label": "共聚焦显微镜（CLSM-01）可能需要预约" }
    ]
  },
  "meta": { "source": "local", "model": "qwen3:4b", "latencyMs": 12345 }
}
```

**两个容易踩的坑：**

- `messageId` 必须来自请求里传进去的 `msg.id`，前端靠它做「点击证据跳转定位到原消息」（`data-action="focus-message"`）。后端必须做**白名单校验**，模型编造的 id 一律丢弃。
- `meta.source` 只有等于 `'local'` 时，界面才显示「本地模型 · 引用 N 条消息」；否则显示降级提示。降级时也要返回 200，别抛 500。

**⚠️ 已有 Modelfile 的字段名与前端契约不一致（必须归一化）：**

`work\ollama\Modelfile` 里写的输出结构是：

```
{ "headline", "decisions":[{"text","message_ids":[...]}], "tasks":[...], "risks":[...], "lab_actions":[{"instrument_id","label"}] }
```

而前端要的是：

```
{ "headline", "decisions":[{"text","messageId":"msg_003"}], "labActions":[{"type":"booking_draft","instrumentId":"inst_clsm","label"}] }
```

差异：`message_ids`（数组）→ `messageId`（单值）、`lab_actions` → `labActions`、`instrument_id` → `instrumentId`、且缺 `type` 字段。**后端必须做一层映射**，否则前端渲染时 `messageId` 为 undefined，证据跳转会全部失效、仪器动作按钮拿不到 instrumentId。建议做法：提示词直接改成前端的 camelCase 契约（推荐，双端一致），服务端再做一次兜底映射兼容旧 Modelfile。

---

## 4. 阶段一：最小后端（LLM 代理服务）

### 4.1 技术选型

**Node.js 22 + Express 4 + zod**。理由：本机已装 Node 22；与前端同语言、同一仓库；`ollama` npm 官方 SDK 直接可用；顺带用 `express.static` 托管 `index.html`，**替代 python http.server，统一端口消除跨域与路径差异**（前端用的是相对路径 `/api/...`，同源最省事）。

### 4.2 目录结构

```
labpilot-live/
├── index.html  app.js  styles.css     # 前端不动
├── server/
│   ├── index.js          # Express 入口：静态托管 + 路由 + 错误处理
│   ├── config.js         # 环境变量集中管理（.env）
│   ├── routes/
│   │   ├── agent.js      # POST /api/agent/summarize
│   │   └── health.js     # GET  /api/health
│   ├── services/
│   │   ├── ollama.js     # Ollama 客户端：超时、重试、keep_alive
│   │   ├── prompt.js     # 提示词模板（版本化，便于 A/B）
│   │   ├── schema.js     # zod schema + JSON Schema 导出
│   │   ├── queue.js      # 单机串行队列（单模型只能排队）
│   │   └── fallback.js   # buildRuleSummary 的服务端移植版
│   └── lib/logger.js     # pino 日志
├── docs/                 # 本文档
└── package.json
```

### 4.3 核心链路

```
POST /api/agent/summarize
  → zod 校验入参
  → 计算内容指纹（groupId + 最后一条 msgId + 消息数）查缓存，命中直接返回
  → 入队（串行，防并发把显存/内存打爆）
  → 组装提示词（系统提示 + 消息列表 + 仪器清单 + JSON Schema 文本）
  → Ollama /api/chat：model=qwen3:4b, think=false, format=<schema>, temperature=0,
      num_ctx=4096, num_predict=512, keep_alive=5m
  → zod 校验输出 + messageId 白名单过滤 + 数组截断
  → 失败（超时/非法 JSON/模型未加载）→ 服务端规则兜底，source='rules'
  → 统一返回 { summary, meta }
```

### 4.4 关键代码骨架

```js
// server/services/ollama.js
import { Ollama } from 'ollama';

const client = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434' });

export async function chatJSON({ model, messages, format, timeoutMs = 120_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await client.chat({
      model,
      messages,
      think: false,            // Qwen3 默认开思考，会吃掉 num_predict
      format,                  // JSON Schema，约束输出
      stream: false,
      keep_alive: '5m',        // 保持常驻，避免每次冷启动 10~30s
      options: { temperature: 0, num_ctx: 4096, num_predict: 512 },
      signal: controller.signal,
    });
    return res.message.content;
  } finally {
    clearTimeout(timer);
  }
}
```

```js
// server/services/schema.js
import { z } from 'zod';

export const SummarySchema = z.object({
  headline: z.string().min(1).max(120),
  decisions: z.array(z.object({ text: z.string(), messageId: z.string() })).max(4),
  tasks:     z.array(z.object({ text: z.string(), messageId: z.string() })).max(5),
  risks:     z.array(z.object({ text: z.string(), messageId: z.string() })).max(4),
  labActions: z.array(z.object({
    type: z.literal('booking_draft'),
    instrumentId: z.string(),
    label: z.string(),
  })).max(3).default([]),
});
export const jsonSchema = z.toJSONSchema(SummarySchema);
```

```js
// server/routes/agent.js（核心片段）
router.post('/agent/summarize', async (req, res) => {
  const parsed = ReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '参数不合法' });
  const { groupId, agentId, messages, instruments } = parsed.data;
  const started = Date.now();

  // 缓存：内容指纹命中直接返回
  const fp = fingerprint(groupId, messages);
  if (cache.has(fp)) return res.json(cache.get(fp));

  try {
    const raw = await queue.add(() => chatJSON({
      model: process.env.OLLAMA_MODEL ?? 'qwen3:4b',
      messages: buildMessages(messages, instruments),
      format: jsonSchema,
    }));

    const summary = sanitize(SummarySchema.parse(JSON.parse(raw)), messages);
    const payload = { summary, meta: { source: 'local', model: process.env.OLLAMA_MODEL ?? 'qwen3:4b', latencyMs: Date.now() - started } };
    cache.set(fp, payload);
    return res.json(payload);
  } catch (err) {
    logger.warn({ err }, 'LLM 摘要失败，降级为规则摘要');
    return res.json({
      summary: ruleSummary(messages, instruments),   // 与前端 buildRuleSummary 同逻辑
      meta: { source: 'rules', model: '', latencyMs: Date.now() - started },
    });
  }
});
```

### 4.5 提示词要点

- **系统提示**：角色 = 实验室协作助理；只做抽取不做发挥；不确定就不写；**所有 `messageId` 必须原样引用输入消息里的 id，禁止编造**。
- **用户消息**：按 `[#idx] (msg_xxx) 姓名: 内容` 逐行铺开，末尾列出可用仪器 `id/名称/编号`，要求模型在识别到仪器相关讨论时产出 `labActions`。
- **同时把 JSON Schema 文本塞进提示词**（Ollama 官方建议，用于「锚定」模型），配合 `format` 参数双保险。
- `temperature: 0` 保证可复现。

### 4.6 启动方式变更

```powershell
# 停掉 python http.server，改由 Node 统一提供静态 + API
cd labpilot-live
npm i express zod ollama pino
node server/index.js            # 监听 127.0.0.1:8080
```

cloudflared 隧道目标不变（`http://127.0.0.1:8080`），外网地址无需改动。

---

## 5. 阶段二：完整后端架构方案（产品化）

### 5.1 分层架构

```
┌─ 接入层 ────────────────────────────────────────────┐
│ cloudflared Named Tunnel（固定域名）→ Nginx/Caddy 反代 │
│ Express：REST + SSE（流式） / ws（实时推送）           │
│ 中间件：鉴权 JWT、租户隔离、限流、请求日志、错误统一     │
└─────────────────────────────────────────────────────┘
┌─ 领域服务层 ────────────────────────────────────────┐
│ AuthService  WorkspaceService  GroupService（消息）   │
│ BookingService（预约/冲突检测/审批）  LedgerService    │
│ InstrumentService  SummaryService（编排 + 缓存）      │
└─────────────────────────────────────────────────────┘
┌─ Agent / LLM 层 ────────────────────────────────────┐
│ PromptRegistry（模板版本化）  ToolRegistry（函数调用） │
│ LLMGateway：Ollama 适配 + 串行队列 + 重试 + 降级      │
│ RAG：bge-m3 向量 + SQLite FTS5 混合检索（SOP/文档）   │
└─────────────────────────────────────────────────────┘
┌─ 数据层 ────────────────────────────────────────────┐
│ 开发：SQLite（better-sqlite3，零运维）                │
│ 生产：PostgreSQL + Prisma / Drizzle ORM              │
│ 对象存储：本地磁盘 → S3/COS 兼容（附件、导出文件）      │
└─────────────────────────────────────────────────────┘
```

### 5.2 数据模型（核心表）

```
users(id, name, email, password_hash, avatar)
workspaces(id, name)                       -- 实验室/课题组，多租户根
memberships(user_id, workspace_id, role)   -- owner/pi/admin/member/guest
groups(id, workspace_id, name, agent_id)
group_members(group_id, user_id)
messages(id, group_id, sender_id, type, content, created_at)   -- 替代前端数组
agents(id, workspace_id, name, model, system_prompt, permissions_json)
instruments(id, workspace_id, name, code, status, location, need_approval)
bookings(id, instrument_id, user_id, date, start, end, purpose, status)
ledger_events(id, booking_id, type, at, operator_id, note)     -- check_in/check_out 事件流
summaries(id, group_id, agent_id, payload_json, model, latency_ms, created_at)
attachments(id, owner_type, owner_id, path, mime, size)
audit_logs(id, actor_id, action, target, at)
```

设计要点：
- **台账用事件流（ledger_events）而非单条记录改写**，上下机、改期、取消都可追溯，看板的偏差统计由事件聚合而来。
- **预约冲突检测放数据库事务里**（同仪器时间窗重叠 + 排他锁），不要靠前端校验。
- `summaries` 独立成表，可对比不同模型/提示词版本的效果。

### 5.3 实时与多用户

| 能力 | 方案 |
|---|---|
| 新消息 / 预约变更 / 上下机事件 | WebSocket（`ws`）广播到 workspace/group 房间 |
| 摘要生成进度 | SSE 流式推送 token，前端 `agentTyping` 状态已有，改造成本低 |
| 离线补偿 | 重连后按 `updated_at` 增量拉取 |

### 5.4 Agent 能力进阶

1. **Tool calling**：qwen3 支持工具调用，注册 `query_instrument_availability`、`create_booking_draft`、`query_ledger`，让 Agent 从「只能总结」升级为「能查能办」，执行前强制人工确认。
2. **RAG**：workspace 里的 SOP / 排期文档切片 → bge-m3 向量 + FTS5 混合检索 → 摘要时注入相关片段，回答才能引用实验室自己的规程。
3. **多 Agent 编排**：`Team Agent` 页面已有权限位，后续可做「协调者 Agent + 若干专项 Agent」的分工与并行调用。

### 5.5 部署

```
docker compose: app(Node) + ollama(Vulkan, /dev/dri 或 Windows 直通) + postgres + caddy
Windows 单机:   NSSM 把 node/ollama 注册为服务 + cloudflared named tunnel（固定域名）
环境变量:       DATABASE_URL / OLLAMA_HOST / JWT_SECRET / STORAGE_DIR
可观测:         pino 结构化日志 + /api/health + LLM 调用耗时/失败率计数器
```

### 5.6 从 localStorage 迁移的三步走（前端改动最小）

1. **双写期**：保留前端 `state`，新增 `api.js` 数据访问层；后端上线后 `saveState()` 改为调用 API，渲染层不动。
2. **切换期**：`loadState()` 改为 GET 拉取，失败时回落到本地种子数据（离线可用）。
3. **收敛期**：删掉 `buildSeedState`，前端只保留渲染与交互，`state` 变成服务端数据的内存镜像 + 实时增量更新。

---

## 6. 里程碑与验收标准

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M0** | 装 Ollama + qwen3:4b，Vulkan 生效 | `ollama ps` 显示 100% GPU；命令行问答中文正常 |
| **M1** | 后端代理服务跑通 | `curl /api/agent/summarize` 返回合法 JSON，`meta.source='local'` |
| **M2** | 前端联调 | 点「生成摘要」，界面显示「本地 qwen3:4b · 引用 N 条消息」，证据可跳转 |
| **M3** | 数据持久化 | SQLite 落库，刷新/换浏览器数据一致 |
| **M4** | 实时 + 多用户 | 两个浏览器窗口消息同步；预约冲突被后端拦截 |
| **M5** | Agent 工具调用 + RAG | Agent 能查仪器空闲时段并生成预约草稿 |

---

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Vulkan 在核显上不稳定 / 未被识别 | 退化成 CPU，慢 3~5 倍 | 保留规则兜底；必要时降到 qwen3:1.7b；确认变量是**系统级**且已重启 |
| 模型冷启动 10~30s | 首次点击体感差 | `keep_alive=5m` 常驻 + 服务启动时预热一次 |
| 并发请求打爆内存 | OOM、进程被杀 | 串行队列 + `OLLAMA_MAX_LOADED_MODELS=1` + 排队超时返回 429 |
| 结构化输出偶发不合法 | 前端白屏 | 校验失败重试 1 次 → 仍失败走规则兜底，永远返回 200 |
| Qwen3 思考模式吃掉输出预算 | 返回空内容 | 强制 `think: false`（已在方案中写死） |
| 24GB 内存同时跑 8B + DB 吃紧 | 卡顿 | 默认 4B；8B 仅在不跑数据库时使用 |
| 数据出网合规 | 实验数据外泄 | Ollama 只监听 127.0.0.1，全部推理本地完成，无任何外部 API 调用 |

---

## 8. 立即可执行的下一步

```powershell
# 1. 安装 Ollama（下载 OllamaSetup.exe）并设置 OLLAMA_VULKAN=1（系统变量，重启）
# 2. ollama pull qwen3:4b
# 3. ollama serve  → 确认日志出现 library=Vulkan
# 4. npm i express zod ollama pino   → 我可以直接把 server/ 目录的代码写完
# 5. node server/index.js  → 前端点「生成摘要」，观察是否显示「本地 qwen3:4b」
```

---

## 9. 实施记录（2026-11-02 已完成）

### 9.1 落地结果

| 项 | 状态 |
|---|---|
| Ollama 环境变量 | 已写入用户级：`OLLAMA_MODELS` / `OLLAMA_IGPU_ENABLE=1` / `OLLAMA_VULKAN=1` / `OLLAMA_MAX_LOADED_MODELS=1` / `OLLAMA_KEEP_ALIVE=30m` |
| 模型 | 复用 `work\ollama\models` 中的 `qwen2.5:7b-instruct-q4_K_M`（4.68GB），`/api/tags` 已能列出 |
| 推理设备 | 核显 Vulkan，`size_vram` 4.76GB，约 6.5 tok/s |
| 后端服务 | `server/index.js`（零依赖 Node），端口 8080，同时托管前端与 API |
| 接口实测 | 4 条消息 → 200 / `meta.source=local` / 279 token / **45s**；同样请求二次命中缓存 **0.4s** |
| 外网 | cloudflared quick tunnel 指向 8080，`/api/health` 可从公网访问 |

### 9.2 代码结构（零依赖，无需 npm install）

```
server/
├── index.js     HTTP 服务、路由、单机队列、结果缓存、降级策略
├── ollama.js    （合并在 index.js 内）Ollama /api/chat 调用，JSON Schema 约束
├── prompt.js    系统提示词 + 用户内容组装 + Schema 文本锚定
├── schema.js    JSON Schema 定义 + 输出归一化（snake_case → camelCase、messageId 白名单、文本相似度兜底定位）
├── fallback.js  规则摘要服务端实现（与前端 buildRuleSummary 同逻辑）
└── static.js    静态文件服务（MIME、路径穿越防护、HEAD 支持）
```

启动：双击 `start.cmd`（先起 Ollama 再起服务），或 `node server/index.js`。

### 9.3 相对原方案的两处调整

1. **放弃 Express/zod/pino**，改为零依赖纯 Node 实现 —— 本机访问 GitHub/npm 不稳定，零依赖可避免安装失败；功能等价（手写校验 + 结构化日志）。
2. **模型选 qwen2.5-7b 而非 qwen3:4b** —— 本机已有完整的 7B（4.68GB，下载完毕），无需再占 2.5GB 流量与磁盘；实测 6.5 tok/s 已满足摘要场景。

### 9.4 旧后端说明

发现 `work\quicktunnel\server.js`（上次会话产物）也是本项目的后端，但它把推理转给 `llama-server.exe`（纯 CPU，`--threads 8`），与"用 Ollama"的目标不符，且与 Ollama 各占 4.7GB 内存。已停用该进程，改由本项目 `server/` 接管 8080 端口；旧文件保留未删，可随时回退。
