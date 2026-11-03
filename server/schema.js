const itemSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    messageId: { type: 'string' },
  },
  required: ['text', 'messageId'],
};

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    decisions: { type: 'array', items: itemSchema },
    tasks: { type: 'array', items: itemSchema },
    risks: { type: 'array', items: itemSchema },
    labActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          instrumentId: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['type', 'instrumentId', 'label'],
      },
    },
  },
  required: ['headline', 'decisions', 'tasks', 'risks'],
};

const LIMITS = { decisions: 4, tasks: 5, risks: 4, labActions: 3 };

const ngrams = (text, n = 4) => {
  const clean = String(text).replace(/[\s，。、；：！？,.!?;:'"“”‘’（）()【】\[\]]/g, '');
  const set = new Set();
  for (let i = 0; i + n <= clean.length; i += 1) set.add(clean.slice(i, i + n));
  return set;
};

function similarity(a, b) {
  const ga = ngrams(a);
  if (!ga.size) return 0;
  const gb = ngrams(b);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit += 1;
  return hit / ga.size;
}

function resolveMessageId(item, messages) {
  const declared = item.messageId ?? item.message_id ?? item.message_ids?.[0] ?? item.evidence ?? '';
  if (declared && messages.some((m) => m.id === declared)) return declared;

  const text = String(item.text ?? '');
  if (!text) return '';

  let best = '';
  let bestScore = 0;
  for (const message of messages) {
    const score = similarity(text, message.content);
    if (score > bestScore) {
      bestScore = score;
      best = message.id;
    }
  }
  return bestScore >= 0.3 ? best : '';
}

function toItems(list, messages, limit) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (!raw) continue;
    const text = String(raw.text ?? raw.content ?? raw.summary ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const messageId = resolveMessageId(raw, messages);
    if (!messageId) continue;
    out.push({ text: text.slice(0, 120), messageId });
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeSummary(raw, { messages, instruments }) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const instrumentIds = new Set((instruments || []).map((i) => i.id));

  const labActions = [];
  const rawActions = source.labActions ?? source.lab_actions ?? [];
  if (Array.isArray(rawActions)) {
    for (const action of rawActions) {
      if (!action) continue;
      const instrumentId = String(action.instrumentId ?? action.instrument_id ?? '').trim();
      if (!instrumentIds.has(instrumentId)) continue;
      const label = String(action.label ?? action.text ?? '').trim();
      if (!label) continue;
      labActions.push({ type: 'booking_draft', instrumentId, label: label.slice(0, 100) });
      if (labActions.length >= LIMITS.labActions) break;
    }
  }

  const decisions = toItems(source.decisions, messages, LIMITS.decisions);
  const tasks = toItems(source.tasks, messages, LIMITS.tasks);
  const risks = toItems(source.risks, messages, LIMITS.risks);

  let headline = String(source.headline ?? source.summary ?? '').replace(/\s+/g, ' ').trim();
  if (!headline) headline = tasks[0]?.text || decisions[0]?.text || '本轮群聊已生成阶段性摘要';
  headline = headline.slice(0, 60);

  return { headline, decisions, tasks, risks, labActions };
}

export function isUsableSummary(summary) {
  if (!summary) return false;
  const evidence = summary.decisions.length + summary.tasks.length + summary.risks.length;
  return evidence > 0;
}
