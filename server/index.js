import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildChatMessages } from './prompt.js';
import { SUMMARY_SCHEMA, normalizeSummary, isUsableSummary } from './schema.js';
import { ruleSummary } from './fallback.js';
import { createStaticHandler } from './static.js';
import { openDatabase, createApi } from './db.js';
import QRCode from 'qrcode';

const dbApi = createApi(openDatabase());

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');

const CONFIG = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '127.0.0.1',
  llmBaseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  model: process.env.LLM_MODEL || 'deepseek-chat',
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60_000),
  maxTokens: Number(process.env.LLM_MAX_TOKENS || 800),
  maxQueue: Number(process.env.MAX_QUEUE || 3),
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 10 * 60_000),
  apiToken: process.env.LAB_API_TOKEN || '',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
};

const log = (level, message, extra = '') => {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${level.toUpperCase().padEnd(5)} ${message}${extra ? ` ${extra}` : ''}`);
};

/* ---------- 单机串行队列：单模型只能一个请求一个请求来 ---------- */
let chain = Promise.resolve();
let queueDepth = 0;

function enqueue(task) {
  queueDepth += 1;
  const run = chain.then(task, task);
  chain = run.then(() => {}, () => {});
  return run.finally(() => { queueDepth -= 1; });
}

/* ---------- 结果缓存：同一批消息不重复烧算力 ---------- */
const cache = new Map();

const fingerprint = ({ groupId, messages }) => crypto
  .createHash('sha1')
  .update(`${groupId}|${messages.length}|${messages.map((m) => `${m.id}:${m.content}`).join('|')}`)
  .digest('hex');

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CONFIG.cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCache(key, payload) {
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), payload });
}

/* ---------- 调用 DeepSeek（OpenAI 兼容接口） ---------- */
async function callLLM({ messages, instruments }) {
  if (!CONFIG.llmApiKey) throw new Error('未配置 LLM_API_KEY');

  const response = await fetch(`${CONFIG.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.llmApiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: buildChatMessages({ messages, instruments }),
      temperature: 0,
      max_tokens: CONFIG.maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM 返回内容为空');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('模型输出不是合法 JSON');
    parsed = JSON.parse(content.slice(start, end + 1));
  }

  return {
    summary: parsed,
    tokens: data?.usage?.total_tokens || 0,
    durationMs: 0,
  };
}

/* ---------- 业务处理 ---------- */
function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-80)
    .map((m, index) => ({
      id: String(m.id || `msg_${index}`).slice(0, 64),
      sender: String(m.sender || '成员').slice(0, 40),
      content: String(m.content).slice(0, 4000),
    }));
}

function sanitizeInstruments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((i) => i && i.id)
    .map((i) => ({
      id: String(i.id).slice(0, 64),
      name: String(i.name || '未命名仪器').slice(0, 60),
      code: String(i.code || '').slice(0, 40),
    }));
}

async function handleSummarize(body) {
  const startedAt = Date.now();
  const groupId = String(body?.groupId || 'unknown');
  const messages = sanitizeMessages(body?.messages);
  const instruments = sanitizeInstruments(body?.instruments);

  if (!messages.length) {
    return { status: 400, payload: { error: 'messages 为空，没有可总结的内容' } };
  }

  const key = fingerprint({ groupId, messages });
  const cached = readCache(key);
  if (cached) {
    log('info', '缓存命中', `messages=${messages.length}`);
    return { status: 200, payload: { ...cached, meta: { ...cached.meta, cached: true, latencyMs: Date.now() - startedAt } } };
  }

  const rulesPayload = () => ({
    summary: ruleSummary({ messages, instruments }),
    meta: { source: 'rules', model: '', latencyMs: Date.now() - startedAt, tokens: 0 },
  });

  if (queueDepth >= CONFIG.maxQueue) {
    log('warn', '队列已满，直接降级', `depth=${queueDepth}`);
    return { status: 200, payload: rulesPayload() };
  }

  try {
    const result = await enqueue(() => callLLM({ messages, instruments }));
    const summary = normalizeSummary(result.summary, { messages, instruments });

    if (!isUsableSummary(summary)) {
      log('warn', '模型输出缺少有效证据，降级为规则摘要');
      return { status: 200, payload: rulesPayload() };
    }

    const payload = {
      summary,
      meta: {
        source: 'deepseek',
        model: CONFIG.model,
        latencyMs: Date.now() - startedAt,
        modelMs: result.durationMs,
        tokens: result.tokens,
      },
    };
    writeCache(key, payload);
    log('info', '本地模型摘要完成', `messages=${messages.length} tokens=${result.tokens} ${Date.now() - startedAt}ms`);
    return { status: 200, payload };
  } catch (error) {
    log('warn', '模型调用失败，降级为规则摘要', error.message);
    return { status: 200, payload: { ...rulesPayload(), meta: { ...rulesPayload().meta, error: error.message.slice(0, 200) } } };
  }
}

/* ---------- HTTP 层 ---------- */
const serveStatic = createStaticHandler(PROJECT_ROOT);

function readJsonBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

// 管理后台会话：内存态，重启后需重新登录。token -> { userId, name, at }
const adminSessions = new Map();
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function adminTokenFromHeader(header = '') {
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !adminSessions.has(token)) return false;
  const session = adminSessions.get(token);
  if (Date.now() - session.at > ADMIN_TOKEN_TTL_MS) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function authorizeAdmin(req) {
  return adminTokenFromHeader(req.headers.authorization || '');
}

// 数据接口鉴权：设置了 LAB_API_TOKEN 时，请求需带 Authorization: Bearer <token>。
// 未设置 token 时放行，方便本机联调。
// 同时接受管理后台会话 token，方便登录后的前端页面读取预约/仪器数据。
function authorize(req) {
  const header = req.headers.authorization || '';
  if (CONFIG.apiToken && header === `Bearer ${CONFIG.apiToken}`) return true;
  if (adminTokenFromHeader(header)) return true;
  return !CONFIG.apiToken;
}

function todayKey() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function nowTime() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function offlinePage(title, message) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f5f1; color: #17231f; font-family: "Microsoft YaHei UI", sans-serif; }
    main { max-width: 420px; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0; line-height: 1.6; color: #37453f; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`;
}

// 二维码必须指向稳定入口。优先用 PUBLIC_BASE_URL；管理员从隧道域名打开后台时，用当前访问地址。
function publicBaseUrl(req) {
  if (CONFIG.publicBaseUrl) return CONFIG.publicBaseUrl;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || host.startsWith('127.0.0.1') || host.startsWith('localhost')) return '';
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function instrumentQrSvg(req, id) {
  const base = publicBaseUrl(req);
  const instrument = dbApi.instrumentById(id);
  if (!instrument) return { ok: false, status: 404, message: '设备不存在' };
  if (!base) {
    return { ok: false, status: 400, message: '未配置 PUBLIC_BASE_URL，无法生成可打印的二维码' };
  }
  const target = `${base}/s/${encodeURIComponent(instrument.id)}`;
  const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 320 });
  return { ok: true, svg, filename: `${instrument.code || instrument.id}.svg`, target };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      llm: CONFIG.llmApiKey ? 'configured' : 'missing_key',
      provider: CONFIG.llmBaseUrl,
      model: CONFIG.model,
      queueDepth,
      cacheSize: cache.size,
    });
  }

  // 手机扫仪器二维码：先记访问，再跳到这台设备当前登记的扫码地址。
  const scanEntryMatch = pathname.match(/^\/s\/([^/]+)$/);
  if (scanEntryMatch && req.method === 'GET') {
    const result = dbApi.openScan(decodeURIComponent(scanEntryMatch[1]));
    if (!result.ok) return sendHtml(res, 404, offlinePage('找不到这台仪器', '二维码对应的仪器不存在。'));
    if (!result.redirectUrl) {
      return sendHtml(res, 200, offlinePage(
        '设备未上线',
        `${result.instrument.name} 还没有向预约系统登记扫码地址。请确认这台设备电脑上的扫码程序已启动。`,
      ));
    }
    log('info', '扫码访问', `instrument=${result.instrument.id}`);
    res.writeHead(302, { Location: result.redirectUrl, 'Cache-Control': 'no-store' });
    return res.end();
  }

  const presenceMatch = pathname.match(/^\/api\/instruments\/([^/]+)\/presence$/);
  if (presenceMatch && req.method === 'POST') {
    if (!authorize(req)) return sendJson(res, 401, { error: '未授权' });
    let body;
    try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    const result = dbApi.recordPresence(decodeURIComponent(presenceMatch[1]), body?.publicUrl);
    if (!result.ok) {
      const message = result.reason === 'bad_url' ? '公网地址不合法' : '仪器不存在';
      return sendJson(res, result.reason === 'bad_url' ? 400 : 404, { ok: false, reason: result.reason, message });
    }
    log('info', '设备登记扫码地址', `instrument=${result.instrument.id}`);
    return sendJson(res, 200, { ok: true, instrument: result.instrument });
  }

  // ---------- 管理后台接口（admin 会话鉴权，独立于 LAB_API_TOKEN） ----------
  if (pathname.startsWith('/api/admin')) {
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const result = dbApi.adminLogin(body?.name, body?.password);
      if (!result.ok) {
        const message = result.reason === 'bad_password' ? '密码不正确'
          : result.reason === 'not_admin' ? '该账号不是管理员'
          : '该账号不存在';
        return sendJson(res, 200, { ok: false, reason: result.reason, message });
      }
      const token = crypto.randomBytes(24).toString('hex');
      adminSessions.set(token, { userId: result.user.id, name: result.user.name, at: Date.now() });
      log('info', '管理后台登录', `user=${result.user.name}`);
      return sendJson(res, 200, { ok: true, token, user: result.user });
    }

    if (!authorizeAdmin(req)) return sendJson(res, 401, { error: '未授权或登录已失效' });

    if (pathname === '/api/admin/instruments' && req.method === 'GET') {
      return sendJson(res, 200, { instruments: dbApi.listInstruments() });
    }
    if (pathname === '/api/admin/instruments' && req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const result = dbApi.createInstrument(body || {});
      if (!result.ok) {
        const message = result.reason === 'duplicate_id' ? '设备 ID 已存在' : '设备名与 ID 不能为空';
        return sendJson(res, 400, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 201, { ok: true, instrument: result.instrument });
    }
    const instrumentEditMatch = pathname.match(/^\/api\/admin\/instruments\/([^/]+)$/);
    if (instrumentEditMatch) {
      const id = decodeURIComponent(instrumentEditMatch[1]);
      if (req.method === 'PUT') {
        let body;
        try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
        const result = dbApi.updateInstrument(id, body || {});
        if (!result.ok) return sendJson(res, 404, { ok: false, reason: result.reason, message: '设备不存在' });
        return sendJson(res, 200, { ok: true, instrument: result.instrument });
      }
      if (req.method === 'DELETE') {
        const result = dbApi.deleteInstrument(id);
        if (!result.ok) {
          const message = result.reason === 'has_bookings' ? '该设备已有预约记录，不能删除' : '设备不存在';
          return sendJson(res, 400, { ok: false, reason: result.reason, message });
        }
        return sendJson(res, 200, { ok: true });
      }
    }
    if (pathname === '/api/admin/bookings' && req.method === 'GET') {
      return sendJson(res, 200, { bookings: dbApi.listBookings() });
    }
    const adminCancelMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/cancel$/);
    if (adminCancelMatch && req.method === 'POST') {
      const result = dbApi.cancelBooking(decodeURIComponent(adminCancelMatch[1]));
      if (!result.ok) {
        const message = result.reason === 'already_checked_in' ? '已上机的预约不能取消' : '预约不存在';
        return sendJson(res, 400, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 200, { ok: true, booking: result.booking });
    }
    const adminBookingMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (adminBookingMatch && req.method === 'PUT') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const result = dbApi.updateBooking(decodeURIComponent(adminBookingMatch[1]), body || {});
      if (!result.ok) {
        const message = result.reason === 'missing_fields' ? '日期和时段不能为空'
          : result.reason === 'already_checked_in' ? '已上机的预约不能改为已取消'
          : '预约不存在';
        return sendJson(res, 400, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 200, { ok: true, booking: result.booking });
    }
    if (pathname === '/api/admin/users' && req.method === 'GET') {
      return sendJson(res, 200, { users: dbApi.listUsers() });
    }
    const qrMatch = pathname.match(/^\/api\/admin\/instruments\/([^/]+)\/qr\.svg$/);
    if (qrMatch && req.method === 'GET') {
      const result = await instrumentQrSvg(req, decodeURIComponent(qrMatch[1]));
      if (!result.ok) return sendJson(res, result.status || 400, { ok: false, message: result.message });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
      });
      return res.end(result.svg);
    }
    return sendJson(res, 404, { error: '接口不存在' });
  }

  // ---------- 预约数据接口（供扫码 agent 与本机前端调用） ----------
  if (pathname.startsWith('/api/users') || pathname.startsWith('/api/bookings') || pathname === '/api/instruments') {
    if (!authorize(req)) return sendJson(res, 401, { error: '未授权' });

    if (pathname === '/api/instruments' && req.method === 'GET') {
      return sendJson(res, 200, { instruments: dbApi.listInstruments() });
    }

    if (pathname === '/api/users/verify' && req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const result = dbApi.authenticate(body?.name, body?.password);
      if (!result.ok) {
        const message = result.reason === 'bad_password' ? '密码不正确' : '该用户未注册';
        return sendJson(res, 200, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 200, { ok: true, user: result.user });
    }

    if (pathname === '/api/bookings/active' && req.method === 'GET') {
      const instrumentId = url.searchParams.get('instrument') || '';
      const applicant = url.searchParams.get('user') || '';
      const date = url.searchParams.get('date') || todayKey();
      const time = url.searchParams.get('time') || nowTime();
      if (!instrumentId || !applicant) return sendJson(res, 400, { error: '缺少 instrument 或 user' });
      const booking = dbApi.activeBooking({ instrumentId, applicant, date, time });
      return sendJson(res, 200, { ok: Boolean(booking), booking });
    }

    const instrumentMatch = pathname.match(/^\/api\/bookings\/instrument\/([^/]+)$/);
    if (instrumentMatch && req.method === 'GET') {
      const instrumentId = decodeURIComponent(instrumentMatch[1]);
      return sendJson(res, 200, { bookings: dbApi.bookingsForInstrument(instrumentId) });
    }

    const cancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      const result = dbApi.cancelBooking(decodeURIComponent(cancelMatch[1]));
      if (!result.ok) {
        const message = result.reason === 'already_checked_in' ? '已上机的预约不能取消' : '预约不存在';
        return sendJson(res, 400, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 200, { ok: true, booking: result.booking });
    }

    const scanMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/scan$/);
    if (scanMatch && req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const action = body?.action;
      if (action !== 'check-in' && action !== 'check-out') {
        return sendJson(res, 400, { error: 'action 必须是 check-in 或 check-out' });
      }
      const result = dbApi.recordScan(decodeURIComponent(scanMatch[1]), action, body?.at);
      if (!result.ok) {
        const message = result.reason === 'not_checked_in' ? '尚未上机，不能下机' : '预约不存在';
        return sendJson(res, 404, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 200, { ok: true, booking: result.booking });
    }

    if (pathname === '/api/bookings' && req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const { instrumentId, applicant, purpose, date, start, end } = body || {};
      if (!instrumentId || !applicant || !date || !start || !end) {
        return sendJson(res, 400, { error: '缺少必填字段' });
      }
      const result = dbApi.createBooking({ instrumentId, applicant, purpose, date, start, end });
      if (!result.ok) {
        const message = result.reason === 'applicant_not_registered' ? '申请人未注册' : '未知仪器';
        return sendJson(res, 400, { ok: false, reason: result.reason, message });
      }
      return sendJson(res, 201, { ok: true, booking: result.booking });
    }
  }

  if (pathname === '/api/agent/summarize') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '仅支持 POST' });

    // 本地 7B 推理要 35~50 秒。Cloudflare Tunnel 无法忍受长时间静默的请求：
    // 它会直接断掉 control stream（"Incoming request ended abruptly"），
    // 连带把整条隧道连接搞崩，cloudflared 退出后域名也随之作废。
    // 所以先发响应头 + 每 5 秒写一个空格保温，最后再写真正的 JSON。
    // JSON.parse 允许前导空白，前端 res.json() 不受影响。
    let started = false;
    let heartbeat = null;

    const startStream = () => {
      if (started || res.writableEnded) return;
      started = true;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      res.write(' ');
      heartbeat = setInterval(() => {
        if (res.writableEnded) return;
        try { res.write(' '); } catch { /* client gone */ }
      }, 5000);
    };

    const stopHeartbeat = () => {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    };

    res.on('close', stopHeartbeat);

    try {
      const body = await readJsonBody(req);
      const msgs = Array.isArray(body?.messages) ? body.messages : [];
      if (!msgs.length) {
        stopHeartbeat();
        return sendJson(res, 400, { error: 'messages 为空，没有可总结的内容' });
      }

      startStream();
      const { payload } = await handleSummarize(body);
      stopHeartbeat();
      if (res.writableEnded) return;
      return res.end(JSON.stringify(payload));
    } catch (error) {
      stopHeartbeat();
      log('error', '请求处理异常', error.message);
      if (res.writableEnded) return;
      if (!started) return sendJson(res, 400, { error: error.message });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: '接口不存在' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: '仅支持 GET' });
  }

  const served = await serveStatic(req, res, req.url);
  if (!served) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(CONFIG.port, CONFIG.host, () => {
  log('info', `LabPilot 已启动 http://${CONFIG.host}:${CONFIG.port}`);
  log('info', '模型配置', `model=${CONFIG.model} provider=${CONFIG.llmBaseUrl} key=${CONFIG.llmApiKey ? '已配置' : '未配置'}`);
});

const shutdown = () => {
  log('info', '正在关闭…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
