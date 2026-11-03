import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildChatMessages } from './prompt.js';
import { SUMMARY_SCHEMA, normalizeSummary, isUsableSummary } from './schema.js';
import { ruleSummary } from './fallback.js';
import { createStaticHandler } from './static.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');

const CONFIG = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '127.0.0.1',
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  model: process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 150_000),
  numCtx: Number(process.env.OLLAMA_NUM_CTX || 8192),
  numPredict: Number(process.env.OLLAMA_NUM_PREDICT || 600),
  maxQueue: Number(process.env.MAX_QUEUE || 3),
  keepAlive: process.env.OLLAMA_KEEP_ALIVE || '30m',
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 10 * 60_000),
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

/* ---------- 调用 Ollama ---------- */
async function callOllama({ messages, instruments }) {
  const expectsThinking = /qwen3|deepseek-r1|gpt-oss/i.test(CONFIG.model);
  const body = {
    model: CONFIG.model,
    messages: buildChatMessages({ messages, instruments }),
    stream: false,
    format: SUMMARY_SCHEMA,
    keep_alive: CONFIG.keepAlive,
    options: {
      temperature: 0,
      top_p: 0.9,
      num_ctx: CONFIG.numCtx,
      num_predict: CONFIG.numPredict,
    },
  };
  if (expectsThinking) body.think = false;

  const response = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ollama ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (!content) throw new Error('Ollama 返回内容为空');

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
    tokens: data.eval_count || 0,
    durationMs: Math.round((data.total_duration || 0) / 1e6),
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
    const result = await enqueue(() => callOllama({ messages, instruments }));
    const summary = normalizeSummary(result.summary, { messages, instruments });

    if (!isUsableSummary(summary)) {
      log('warn', '模型输出缺少有效证据，降级为规则摘要');
      return { status: 200, payload: rulesPayload() };
    }

    const payload = {
      summary,
      meta: {
        source: 'local',
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

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    let ollama = 'down';
    let models = [];
    try {
      const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const data = await response.json();
      models = (data.models || []).map((m) => m.name);
      ollama = 'up';
    } catch {
      ollama = 'down';
    }
    return sendJson(res, 200, {
      ok: ollama === 'up',
      ollama,
      model: CONFIG.model,
      modelLoaded: models.includes(CONFIG.model),
      models,
      queueDepth,
      cacheSize: cache.size,
    });
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
  log('info', '模型配置', `model=${CONFIG.model} ollama=${CONFIG.ollamaUrl} timeout=${CONFIG.timeoutMs}ms`);

  if (process.env.PREWARM === '1') {
    log('info', '预热模型…');
    fetch(`${CONFIG.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CONFIG.model, prompt: '就绪', stream: false, options: { num_predict: 4 }, keep_alive: CONFIG.keepAlive }),
    }).then(() => log('info', '模型预热完成')).catch((e) => log('warn', '预热失败', e.message));
  }
});

const shutdown = () => {
  log('info', '正在关闭…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
