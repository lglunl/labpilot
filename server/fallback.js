const RULES = {
  decisions: { pattern: /确认|决定|确定|改为|改到|统一|同意/, limit: 4 },
  tasks: { pattern: /请|记得|需要|安排|负责|上传|验证|重扫|预约|提醒|补做/, limit: 5 },
  risks: { pattern: /偏高|异常|风险|故障|注意|延期|冲突|污染|不够|核对/, limit: 4 },
};

const shorten = (text, max = 78) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

export function ruleSummary({ messages = [], instruments = [] } = {}) {
  const buckets = { decisions: [], tasks: [], risks: [] };

  for (const message of messages) {
    const text = String(message.content || '').trim();
    if (!text) continue;
    for (const [key, rule] of Object.entries(RULES)) {
      if (buckets[key].length < rule.limit && rule.pattern.test(text)) {
        buckets[key].push({ text: shorten(text), messageId: message.id });
      }
    }
  }

  const combined = messages.map((m) => m.content).join(' ');
  const labActions = [];
  for (const instrument of instruments) {
    if (labActions.length >= 3) break;
    const hit = combined.includes(instrument.name)
      || (instrument.code && combined.includes(instrument.code))
      || (instrument.id === 'inst_clsm' && combined.includes('共聚焦'));
    if (hit) {
      labActions.push({
        type: 'booking_draft',
        instrumentId: instrument.id,
        label: `${instrument.name}（${instrument.code || '无编号'}）可能需要预约或调整`,
      });
    }
  }

  const focus = buckets.tasks[0]?.text || buckets.decisions[0]?.text || messages[messages.length - 1]?.content || '群聊工作已形成阶段性总结';

  return {
    headline: `当前重点是：${shorten(focus, 54)}`,
    decisions: buckets.decisions,
    tasks: buckets.tasks,
    risks: buckets.risks,
    labActions,
  };
}
