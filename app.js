(() => {
  'use strict';

  const STORAGE_KEY = 'labpilot_demo_state_v1';
  const ADMIN_SESSION_KEY = 'labpilot_admin_session_v1';
  const appShell = document.getElementById('app-shell');
  const viewRoot = document.getElementById('view-root');
  const contextPanel = document.getElementById('context-panel');
  const groupList = document.getElementById('group-list');
  const agentMiniList = document.getElementById('agent-mini-list');
  const modalRoot = document.getElementById('modal-root');
  const backdrop = document.getElementById('overlay-backdrop');
  const toastRegion = document.getElementById('toast-region');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const icon = (name) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const pad = (value) => String(value).padStart(2, '0');
  const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateAtOffset = (offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
  };
  const isoAt = (offset, time) => {
    const date = dateAtOffset(offset);
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const todayKey = () => toDateKey(new Date());
  const formatDate = (dateKey, style = 'short') => {
    if (!dateKey) return '';
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;
    if (style === 'full') {
      return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
    }
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(date);
  };
  const formatDateTime = (iso) => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };
  const formatTimeOnly = (iso) => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };
  const parseTimeToMinutes = (time) => {
    const [hours, minutes] = String(time).split(':').map(Number);
    return hours * 60 + minutes;
  };
  const durationLabel = (minutes) => {
    if (!Number.isFinite(minutes)) return '—';
    if (Math.abs(minutes) < 1) return '不到 1 分钟';
    const sign = minutes < 0 ? '-' : '';
    const absolute = Math.abs(Math.round(minutes));
    const hours = Math.floor(absolute / 60);
    const mins = absolute % 60;
    if (hours && mins) return `${sign}${hours} 小时 ${mins} 分`;
    if (hours) return `${sign}${hours} 小时`;
    return `${sign}${mins} 分钟`;
  };
  const compactVariance = (minutes) => {
    if (!Number.isFinite(minutes)) return '—';
    if (minutes === 0) return '准时';
    const sign = minutes > 0 ? '+' : '';
    const absolute = Math.abs(Math.round(minutes));
    if (absolute >= 60) {
      return `${sign}${Math.floor(absolute / 60)}h${absolute % 60 ? ` ${absolute % 60}m` : ''}`;
    }
    return `${sign}${absolute}m`;
  };
  const shortText = (text = '', max = 46) => {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  };

  function instrumentIcon(type = '') {
    if (type.includes('显微')) return 'microscope';
    if (type.includes('PCR') || type.includes('分析')) return 'flask';
    if (type.includes('离心')) return 'settings';
    return 'flask';
  }

  function buildSeedState() {
    const today = todayKey();
    const tomorrow = toDateKey(dateAtOffset(1));
    const yesterday = toDateKey(dateAtOffset(-1));

    return {
      version: 1,
      currentView: 'chat',
      currentGroupId: 'group_microfluidic',
      selectedAgentId: 'agent_yanzhu',
      selectedDate: today,
      ledgerStatus: 'all',
      ledgerDate: 'all',
      ledgerSearch: '',
      agentTyping: false,
      currentUser: {
        id: 'user_linyu',
        name: '林雨',
        initials: '林',
        role: '课题组 · 管理员'
      },
      workspace: {
        materials: [
          { id: 'doc_1', name: 'PDMS 芯片制备 SOP', type: 'SOP', updatedAt: isoAt(-1, '16:40') },
          { id: 'doc_2', name: '本周实验排期', type: '计划', updatedAt: isoAt(0, '08:30') }
        ],
        artifacts: []
      },
      groups: [
        {
          id: 'group_microfluidic',
          name: '微流控芯片组',
          description: '材料验证、显微成像与公共仪器协调',
          initials: '微',
          color: 'green',
          memberCount: 8,
          unread: 3,
          agentId: 'agent_yanzhu',
          botRole: 'device',
          members: [
            { id: 'user_linyu', name: '林雨', initials: '林', color: 'green' },
            { id: 'user_zhouqun', name: '周群', initials: '周', color: 'amber' },
            { id: 'user_wangchen', name: '王晨', initials: '王', color: 'blue' },
            { id: 'user_chen', name: '陈老师', initials: '陈', color: 'violet' }
          ],
          messages: [
            {
              id: 'msg_001',
              type: 'system',
              content: '研助 Team Agent 已加入群聊，可读取本群上下文并生成带证据的总结。',
              createdAt: isoAt(-1, '08:50')
            },
            {
              id: 'msg_002',
              type: 'text',
              senderId: 'user_zhouqun',
              senderName: '周群',
              initials: '周',
              color: 'amber',
              content: '昨天的共聚焦数据背景还是偏高，建议大家下午一起看下参数。',
              createdAt: isoAt(-1, '09:12')
            },
            {
              id: 'msg_003',
              type: 'text',
              senderId: 'user_linyu',
              senderName: '林雨',
              initials: '林',
              color: 'green',
              content: '确认了，下午重扫一组。流式细胞仪明天 10:30 前要下机，预约已经排在系统里。',
              createdAt: isoAt(-1, '09:18')
            },
            {
              id: 'msg_004',
              type: 'text',
              senderId: 'user_wangchen',
              senderName: '王晨',
              initials: '王',
              color: 'blue',
              content: '我需要补做 PDMS 配比验证，请林雨把上一轮参数表传到 Workspace。',
              createdAt: isoAt(-1, '10:02')
            },
            {
              id: 'msg_005',
              type: 'agent',
              senderId: 'agent_yanzhu',
              senderName: '研助',
              content: '已整理上一轮讨论：共聚焦需重扫，PDMS 配比验证待补充参数表。相关原文仍保留在消息证据中。',
              attachment: '已读取 4 条上下文消息',
              createdAt: isoAt(-1, '10:03')
            },
            {
              id: 'msg_006',
              type: 'text',
              senderId: 'user_chen',
              senderName: '陈老师',
              initials: '陈',
              color: 'violet',
              content: '本周五组会改到下午 4 点，请大家 3 点前上传本周实验记录。',
              createdAt: isoAt(0, '08:22')
            },
            {
              id: 'msg_007',
              type: 'text',
              senderId: 'user_zhouqun',
              senderName: '周群',
              initials: '周',
              color: 'amber',
              content: '我发现共聚焦的折射率参数可能是风险点，重扫前要再核对一次。',
              createdAt: isoAt(0, '08:38')
            },
            {
              id: 'msg_008',
              type: 'text',
              senderId: 'user_linyu',
              senderName: '林雨',
              initials: '林',
              color: 'green',
              content: '收到。我今天下午先在系统里补一个共聚焦预约草稿，确认参数后再上机。',
              createdAt: isoAt(0, '08:42')
            }
          ]
        },
        {
          id: 'group_platform',
          name: '公共仪器平台',
          description: '设备通知、维护窗口与异常反馈',
          initials: '仪',
          color: 'amber',
          memberCount: 32,
          unread: 1,
          agentId: 'agent_platform',
          members: [
            { id: 'user_chen', name: '陈老师', initials: '陈', color: 'violet' },
            { id: 'user_linyu', name: '林雨', initials: '林', color: 'green' }
          ],
          messages: [
            {
              id: 'msg_101',
              type: 'system',
              content: '平台管理员发布仪器通知。',
              createdAt: isoAt(-2, '15:20')
            },
            {
              id: 'msg_102',
              type: 'text',
              senderId: 'user_chen',
              senderName: '陈老师',
              initials: '陈',
              color: 'violet',
              content: '高速冷冻离心机本周五 14:00 至 16:00 做年度校准，请避开此时段预约。',
              createdAt: isoAt(-1, '15:24')
            },
            {
              id: 'msg_103',
              type: 'text',
              senderId: 'user_linyu',
              senderName: '林雨',
              initials: '林',
              color: 'green',
              content: '收到。共聚焦显微镜的数据导出目录已经统一到项目 Workspace。',
              createdAt: isoAt(0, '09:02')
            }
          ]
        },
        {
          id: 'group_safety',
          name: '实验室安全与排班',
          description: '安全培训、值日与危化品台账',
          initials: '安',
          color: 'coral',
          memberCount: 18,
          unread: 0,
          agentId: 'agent_safety',
          members: [
            { id: 'user_linyu', name: '林雨', initials: '林', color: 'green' }
          ],
          messages: [
            {
              id: 'msg_201',
              type: 'text',
              senderId: 'user_linyu',
              senderName: '林雨',
              initials: '林',
              color: 'green',
              content: '下周安全培训安排已确认，具体签到表会在周一发到群里。',
              createdAt: isoAt(-3, '11:12')
            }
          ]
        }
      ],
      agents: [
        {
          id: 'agent_yanzhu',
          name: '研助',
          role: '实验协作 Agent',
          description: '读取课题组群聊，整理实验决策、待办和风险，并生成仪器预约草稿。',
          status: 'online',
          createdAt: isoAt(-12, '09:00'),
          skills: ['群聊总结', '实验待办提取', '预约草稿', '台账解释'],
          permissions: {
            readChat: true,
            summarize: true,
            bookingDraft: true,
            exportWorkspace: true
          }
        },
        {
          id: 'agent_platform',
          name: '仪器管家',
          role: '平台运营 Agent',
          description: '关注仪器维护、冲突预约和未闭环记录，提供平台运营建议。',
          status: 'online',
          createdAt: isoAt(-9, '14:20'),
          skills: ['维护提醒', '冲突排查', '台账异常解释'],
          permissions: {
            readChat: true,
            summarize: true,
            bookingDraft: false,
            exportWorkspace: false
          }
        },
        {
          id: 'agent_safety',
          name: '安全哨',
          role: '安全合规 Agent',
          description: '从群聊中提取安全培训、设备风险和值日事项。',
          status: 'idle',
          createdAt: isoAt(-6, '10:00'),
          skills: ['安全事项提取', '培训提醒'],
          permissions: {
            readChat: true,
            summarize: true,
            bookingDraft: false,
            exportWorkspace: false
          }
        }
      ],
      instruments: [
        {
          id: 'inst_fc',
          code: 'FC-01',
          name: '流式细胞仪',
          model: 'BD FACSCelesta',
          location: 'B2-107',
          status: 'available',
          manager: '陈老师',
          category: '细胞分析',
          utilization: 78
        },
        {
          id: 'inst_clsm',
          code: 'CLSM-02',
          name: '激光共聚焦显微镜',
          model: 'Zeiss LSM 900',
          location: 'B2-109',
          status: 'in-use',
          manager: '周群',
          category: '显微成像',
          utilization: 86
        },
        {
          id: 'inst_pcr',
          code: 'PCR-03',
          name: '实时荧光定量 PCR',
          model: 'QuantStudio 5',
          location: 'A1-203',
          status: 'available',
          manager: '王晨',
          category: '分子检测',
          utilization: 64
        },
        {
          id: 'inst_centrifuge',
          code: 'CENT-04',
          name: '高速冷冻离心机',
          model: 'Eppendorf 5910Ri',
          location: 'B1-102',
          status: 'maintenance',
          manager: '陈老师',
          category: '样品处理',
          utilization: 52
        }
      ],
      bookings: [],
      auditEvents: [],
      summaries: {}
    };
  }

  function loadState() {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The in-memory demo still works when storage is unavailable.
      }
      return buildSeedState();
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return buildSeedState();
      const parsed = JSON.parse(stored);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.groups)) return buildSeedState();
      parsed.groups.forEach((group) => {
        if (!group.botRole) group.botRole = 'general';
      });
      return parsed;
    } catch {
      return buildSeedState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Static file mode may deny storage in hardened browsers.
    }
  }

  /* ---------- 管理后台会话 ---------- */
  let adminSession = loadAdminSession();

  function loadAdminSession() {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.token ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveAdminSession(session) {
    adminSession = session;
    try {
      if (session) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // Storage unavailable.
    }
  }

  function isAdminLoggedIn() {
    return Boolean(adminSession && adminSession.token);
  }

  function authHeaders(extra = {}) {
    const headers = { ...extra };
    if (adminSession && adminSession.token) headers.Authorization = `Bearer ${adminSession.token}`;
    return headers;
  }

  // 管理后台专用请求：401 时清除会话并提示重新登录。
  async function adminFetch(path, options = {}) {
    const headers = authHeaders(options.headers || {});
    const init = { ...options, headers };
    if (init.body && typeof init.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(path, init);
    if (response.status === 401) {
      saveAdminSession(null);
      toast('登录已失效，请重新登录管理后台。', 'error');
      return null;
    }
    return response;
  }

  // 普通接口也带上管理员会话，这样登录后台后，预约/台账视图能正常读写。
  function apiHeaders(extra = {}) {
    return authHeaders(extra);
  }

  function getGroup(groupId = state.currentGroupId) {
    return state.groups.find((group) => group.id === groupId) || state.groups[0];
  }

  // 只有「设备预约管理员」的群可以预约设备；普通群管理员只能总结和充当助手。
  function canBook(group = getGroup()) {
    return group?.botRole === 'device';
  }

  const BOT_ROLE_LABEL = { device: '设备预约管理员', general: '普通群管理员' };

  function getAgent(agentId = state.selectedAgentId) {
    return state.agents.find((agent) => agent.id === agentId) || state.agents[0];
  }

  function getInstrument(instrumentId) {
    return state.instruments.find((instrument) => instrument.id === instrumentId);
  }

  function getBooking(bookingId) {
    return state.bookings.find((booking) => booking.id === bookingId);
  }

  function bookingReservedEnd(booking) {
    return new Date(`${booking.date}T${booking.end}:00`);
  }

  function deriveLedger(booking) {
    const reservedMinutes = parseTimeToMinutes(booking.end) - parseTimeToMinutes(booking.start);
    const actualStart = booking.checkInAt ? new Date(booking.checkInAt) : null;
    const actualEnd = booking.checkOutAt ? new Date(booking.checkOutAt) : null;
    const actualMinutes = actualStart && actualEnd
      ? Math.max(0, Math.round((actualEnd.getTime() - actualStart.getTime()) / 60_000))
      : null;
    const variance = actualMinutes === null ? null : actualMinutes - reservedMinutes;
    const now = new Date();
    const reservedEnd = bookingReservedEnd(booking);

    let status = 'scheduled';
    let statusLabel = '待上机';
    if (booking.cancelledAt) {
      status = 'cancelled';
      statusLabel = '已取消';
    } else if (booking.checkInAt && booking.checkOutAt) {
      status = 'closed';
      statusLabel = variance > 0 ? '已闭环 · 超时' : '已闭环';
    } else if (booking.checkInAt) {
      if (now > reservedEnd) {
        status = 'overdue';
        statusLabel = '超时未下机';
      } else {
        status = 'in-use';
        statusLabel = '使用中';
      }
    } else if (now > reservedEnd) {
      status = 'no-show';
      statusLabel = '逾期未上机';
    }

    return {
      ...booking,
      reservedMinutes,
      actualMinutes,
      variance,
      status,
      statusLabel,
      actualStart,
      actualEnd,
      reservedEnd
    };
  }

  function allLedgerRows() {
    return state.bookings
      .map(deriveLedger)
      .sort((a, b) => {
        const left = `${b.date}T${b.start}`;
        const right = `${a.date}T${a.start}`;
        return left.localeCompare(right);
      });
  }

  function ledgerAttentionCount() {
    return allLedgerRows().filter((row) => ['scheduled', 'in-use', 'overdue', 'no-show'].includes(row.status)).length;
  }

  function statusClass(status) {
    if (status === 'closed') return 'closed';
    if (status === 'in-use') return 'in-use';
    if (status === 'overdue' || status === 'no-show') return status === 'overdue' ? 'overdue' : 'no-show';
    if (status === 'scheduled') return 'scheduled';
    return '';
  }

  function instrumentStatusLabel(status) {
    if (status === 'available') return '可预约';
    if (status === 'in-use') return '使用中';
    if (status === 'maintenance') return '维护中';
    return '未开放';
  }

  function renderSidebar() {
    groupList.innerHTML = state.groups.map((group) => {
      const lastMessage = [...group.messages].reverse().find((message) => message.type !== 'system');
      const active = group.id === state.currentGroupId;
      return `
        <button class="group-item ${active ? 'is-active' : ''}" type="button" data-group-id="${escapeHtml(group.id)}">
          <span class="group-avatar ${escapeHtml(group.color)}">${escapeHtml(group.initials)}</span>
          <span class="group-copy">
            <strong>${escapeHtml(group.name)}</strong>
            <small>${escapeHtml(shortText(lastMessage?.content || '尚未开始协作', 20))}</small>
          </span>
          <span class="group-meta">
            <span>${lastMessage ? formatTimeOnly(lastMessage.createdAt) : ''}</span>
            ${group.unread ? `<span class="unread">${group.unread}</span>` : ''}
          </span>
        </button>
      `;
    }).join('');

    agentMiniList.innerHTML = state.agents.slice(0, 4).map((agent) => `
      <button class="agent-mini" type="button" data-agent-id="${escapeHtml(agent.id)}">
        <span class="agent-avatar">${icon('bot')}</span>
        <span class="agent-mini-copy">
          <strong>${escapeHtml(agent.name)}</strong>
          <small>${escapeHtml(agent.role)}</small>
        </span>
        <span class="agent-status-dot"></span>
      </button>
    `).join('');

    $$('.nav-item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.view === state.currentView);
    });
    $$('.mobile-nav-item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.view === state.currentView);
    });

    const currentGroup = getGroup();
    $('#chat-badge').textContent = String(currentGroup.unread || 0);
    $('#chat-badge').classList.toggle('hidden', !currentGroup.unread);
    $('#ledger-badge').textContent = String(ledgerAttentionCount());
    $('#ledger-badge').classList.toggle('hidden', ledgerAttentionCount() === 0);
    const currentUserCopy = $('.user-copy');
    if (currentUserCopy) {
      currentUserCopy.innerHTML = `
        <strong>${escapeHtml(state.currentUser.name)}</strong>
        <small>${escapeHtml(state.currentUser.role)}</small>
      `;
    }
  }

  function renderView() {
    appShell.classList.toggle('no-context', state.currentView !== 'chat');
    contextPanel.classList.toggle('hidden', state.currentView !== 'chat');

    if (state.currentView === 'chat') renderChat();
    else if (state.currentView === 'booking') renderBooking();
    else if (state.currentView === 'ledger') renderLedger();
    else if (state.currentView === 'agents') renderAgents();
    else if (state.currentView === 'admin') renderAdmin();
    else renderDashboard();

    renderContext();
    renderSidebar();
  }

  function renderMessage(message, group) {
    if (message.type === 'system') {
      return `<div class="system-message">${escapeHtml(message.content)}</div>`;
    }

    const isAgent = message.type === 'agent' || message.senderId?.startsWith('agent_');
    const isOwn = message.senderId === state.currentUser.id && !isAgent;
    const avatar = isAgent
      ? `<span class="agent-avatar">${icon('bot')}</span>`
      : `<span class="avatar avatar-${escapeHtml(message.color || 'blue')}">${escapeHtml(message.initials || message.senderName?.slice(0, 1) || '员')}</span>`;
    const agentHeader = isAgent ? `<div class="agent-message-header"><span class="agent-dot"></span>Team Agent · ${escapeHtml(message.senderName)}</div>` : '';
    const attachment = message.attachment
      ? `<div class="message-attachment">${icon('file')}<span>${escapeHtml(message.attachment)}</span></div>`
      : '';

    return `
      <div class="message-row ${isOwn ? 'is-own' : ''} ${isAgent ? 'is-agent' : ''}" id="message-${escapeHtml(message.id)}" data-message-id="${escapeHtml(message.id)}">
        ${avatar}
        <div class="message-main">
          <div class="message-meta">
            <strong>${escapeHtml(message.senderName || '成员')}</strong>
            <span>${formatTimeOnly(message.createdAt)}</span>
          </div>
          <div class="message-bubble">
            ${agentHeader}
            ${escapeHtml(message.content)}
            ${attachment}
          </div>
        </div>
      </div>
    `;
  }

  function renderChat() {
    const group = getGroup();
    const agent = getAgent(group.agentId);
    const memberAvatars = (group.members || []).slice(0, 3).map((member) =>
      `<span class="avatar avatar-sm avatar-${escapeHtml(member.color || 'blue')}">${escapeHtml(member.initials)}</span>`
    ).join('');
    const typing = state.agentTyping
      ? `<div class="typing-row"><span class="agent-avatar avatar-xs">${icon('bot')}</span><span>${escapeHtml(agent.name)} 正在读取群聊上下文</span><span class="typing-dots"><span></span><span></span><span></span></span></div>`
      : '';

    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>${escapeHtml(group.name)} <span class="agent-type">${escapeHtml(BOT_ROLE_LABEL[group.botRole] || '普通群管理员')}</span></h1>
            <p>${escapeHtml(group.description)} · ${group.memberCount} 位成员</p>
          </div>
          <div class="view-header-actions">
            <div class="header-avatars header-actions-mobile-hide">
              ${memberAvatars}
              <span class="member-overflow">+${Math.max(0, group.memberCount - Math.min(3, group.members?.length || 0))}</span>
            </div>
            <button class="button header-actions-mobile-hide" type="button" data-action="open-import">
              ${icon('upload')} 迁移群聊
            </button>
            <button class="button button-primary" type="button" data-action="summarize-group">
              ${icon('sparkles')} 总结工作
            </button>
          </div>
        </header>
        <div class="chat-view">
          <div class="chat-mode-bar">
            <button class="chat-mode is-active" type="button" data-action="open-import">群聊记录</button>
            <button class="chat-mode" type="button" data-action="show-summary-modal">Agent 摘要</button>
            <span class="chat-mode-divider"></span>
            <span class="chat-mode-note">${escapeHtml(agent.name)} 只读取已授权上下文</span>
          </div>
          <div class="message-scroll" id="message-scroll">
            <div class="message-list">
              <div class="date-separator"><span>${formatDate(todayKey(), 'full')}</span></div>
              ${group.messages.map((message) => renderMessage(message, group)).join('')}
              ${typing}
            </div>
          </div>
          <div class="composer-wrap">
            <div class="quick-actions">
              <button class="quick-action" type="button" data-action="summarize-group">${icon('sparkles')} 生成工作摘要</button>
              ${canBook(group) ? `<button class="quick-action" type="button" data-action="open-new-booking">${icon('calendar')} 发起仪器预约</button>` : ''}
              <button class="quick-action" type="button" data-action="open-import">${icon('upload')} 导入聊天记录</button>
              <button class="quick-action" type="button" data-action="mention-agent">${icon('bot')} @${escapeHtml(agent.name)}</button>
            </div>
            <div class="composer">
              <div class="composer-main">
                <textarea id="chat-input" rows="2" placeholder="输入消息，输入 @${escapeHtml(agent.name)} 可调用 Team Agent" aria-label="群聊消息"></textarea>
                <div class="composer-tools">
                  <button class="icon-button" type="button" data-action="attachment-hint" aria-label="添加附件" title="添加附件">${icon('paperclip')}</button>
                  <button class="icon-button" type="button" data-action="emoji-hint" aria-label="添加表情" title="添加表情">${icon('smile')}</button>
                  <button class="icon-button" type="button" data-action="scan-hint" aria-label="扫码" title="扫码">${icon('qr')}</button>
                </div>
              </div>
              <button class="icon-button send-button" type="button" data-action="send-message" aria-label="发送消息" title="发送消息">${icon('send')}</button>
            </div>
            <div class="composer-hint">Enter 发送 · Shift + Enter 换行 · 内容仅用于当前项目</div>
          </div>
        </div>
      </section>
    `;

    requestAnimationFrame(() => {
      const scroll = $('#message-scroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
  }

  function summarySection(title, items, iconName, emptyText) {
    const safeItems = items?.length ? items : [{ text: emptyText, messageId: '' }];
    return `
      <div class="summary-group">
        <div class="summary-label">${icon(iconName)} ${escapeHtml(title)} <span>${items?.length || 0}</span></div>
        <ul class="summary-list">
          ${safeItems.slice(0, 4).map((item) => `
            <li>
              ${escapeHtml(item.text)}
              ${item.messageId ? `
                <button class="text-button summary-evidence" type="button" data-action="focus-message" data-message-id="${escapeHtml(item.messageId)}">
                  ${icon('message')} 查看消息证据
                </button>
              ` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  function renderSummaryCard(summary, compact = false) {
    if (!summary) {
      return `
        <div class="summary-empty">
          <span class="summary-empty-icon">${icon('sparkles')}</span>
          <strong>还没有群聊摘要</strong>
          <p>让 Agent 读取当前群聊，自动提取已确认决策、待办、风险和仪器相关动作。</p>
          <button class="button button-soft button-sm" type="button" data-action="summarize-group">${icon('sparkles')} 生成摘要</button>
        </div>
      `;
    }

    return `
      <div class="summary-card">
        <div class="summary-headline">${escapeHtml(summary.headline)}</div>
        ${summarySection('已确认决策', summary.decisions, 'check', '暂未识别到明确决策')}
        ${summarySection('待办事项', summary.tasks, 'clipboard', '暂未识别到待办')}
        ${summarySection('风险与阻塞', summary.risks, 'alert', '暂未识别到风险')}
        ${!compact && summary.labActions?.length ? `
          <div class="summary-group">
            <div class="summary-label">${icon('calendar')} 仪器相关动作 <span>${summary.labActions.length}</span></div>
            <ul class="summary-list">
              ${summary.labActions.slice(0, 3).map((action) => `
                <li>
                  ${escapeHtml(action.label)}
                  ${canBook() ? `<button class="text-button summary-evidence" type="button" data-action="draft-booking" data-instrument-id="${escapeHtml(action.instrumentId)}">${icon('plus')} 创建预约草稿</button>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="summary-footer">
          <span>${escapeHtml(summary.agentName)} · ${summary.source === 'local' ? escapeHtml(summary.model || '本地 7B') : '规则摘要'} · ${summary.messageCount} 条消息 · ${formatTimeOnly(summary.generatedAt)}</span>
          <button class="text-button" type="button" data-action="save-summary">保存到 Workspace</button>
        </div>
      </div>
    `;
  }

  function renderContext() {
    if (state.currentView !== 'chat') {
      contextPanel.innerHTML = '';
      return;
    }

    const group = getGroup();
    const agent = getAgent(group.agentId);
    const summary = state.summaries[`${group.id}:${agent.id}`];
    const upcoming = state.bookings
      .filter((booking) => booking.groupId === group.id && booking.date === todayKey() && !booking.cancelledAt)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 3);
    const miniInstruments = state.instruments.slice(0, 3);

    contextPanel.innerHTML = `
      <div class="context-top">
        <div class="context-top-copy">
          <strong>项目上下文</strong>
          <small>Discussion · Agent · Workspace</small>
        </div>
        <div class="context-actions">
          <button class="icon-button subtle" type="button" data-action="project-settings" aria-label="项目设置" title="项目设置">${icon('settings')}</button>
          <button class="icon-button subtle" type="button" data-action="show-summary-modal" aria-label="打开 Agent 摘要" title="打开 Agent 摘要">${icon('sparkles')}</button>
        </div>
      </div>
      <section class="context-section">
        <div class="context-section-heading">
          <strong>当前 Team Agent</strong>
          <button class="text-button" type="button" data-action="select-agent" data-agent-id="${escapeHtml(agent.id)}">管理</button>
        </div>
        <div class="agent-profile">
          <span class="agent-profile-avatar">
            ${icon('bot')}
            <span class="online-dot"></span>
          </span>
          <div class="agent-profile-copy">
            <strong>${escapeHtml(agent.name)}</strong>
            <p>${escapeHtml(agent.role)} · 本地 Qwen 7B · 已读取群聊上下文</p>
          </div>
        </div>
        <div class="agent-capability-row">
          <span class="capability-chip">Qwen 7B · 本地</span>
          ${agent.skills.slice(0, 3).map((skill) => `<span class="capability-chip">${escapeHtml(skill)}</span>`).join('')}
        </div>
      </section>
      <section class="context-section">
        <div class="context-section-heading">
          <strong>群聊工作摘要</strong>
          <button class="text-button" type="button" data-action="summarize-group">${summary ? '重新生成' : '生成'}</button>
        </div>
        ${renderSummaryCard(summary)}
      </section>
      <section class="context-section">
        <div class="context-section-heading">
          <strong>今日仪器</strong>
          <button class="text-button" type="button" data-view="booking">查看预约</button>
        </div>
        <div class="mini-instrument-list">
          ${miniInstruments.map((instrument) => `
            <div class="mini-instrument">
              <span class="mini-instrument-icon">${icon(instrumentIcon(instrument.category))}</span>
              <span class="mini-instrument-copy">
                <strong>${escapeHtml(instrument.name)}</strong>
                <small>${escapeHtml(instrument.location)} · ${escapeHtml(instrument.code)}</small>
              </span>
              <span class="status-dot ${escapeHtml(instrument.status)}">${escapeHtml(instrumentStatusLabel(instrument.status))}</span>
            </div>
          `).join('')}
        </div>
        <p class="context-footer-note">${upcoming.length ? `今日项目内还有 ${upcoming.length} 条预约记录，台账需上机与下机两次扫描才可闭环。` : '今日暂无本项目预约。'}</p>
      </section>
    `;
  }

  function scrollToMessage(messageId) {
    state.currentView = 'chat';
    saveState();
    renderView();
    requestAnimationFrame(() => {
      const message = document.getElementById(`message-${messageId}`);
      if (!message) return;
      message.scrollIntoView({ block: 'center', behavior: 'smooth' });
      message.style.outline = '2px solid rgba(14,110,100,.35)';
      message.style.outlineOffset = '4px';
      setTimeout(() => {
        message.style.outline = '';
        message.style.outlineOffset = '';
      }, 1800);
    });
  }

  function buildRuleSummary(sourceMessages) {
    const decisions = [];
    const tasks = [];
    const risks = [];

    sourceMessages.forEach((message) => {
      const text = String(message.content || '').trim();
      if (!text) return;
      const evidence = message.id;
      if (/确认|决定|确定|改为|改到|统一|同意/.test(text) && decisions.length < 4) {
        decisions.push({ text: shortText(text, 78), messageId: evidence });
      }
      if (/请|记得|需要|安排|负责|上传|验证|重扫|预约|提醒|补做/.test(text) && tasks.length < 5) {
        tasks.push({ text: shortText(text, 78), messageId: evidence });
      }
      if (/偏高|异常|风险|故障|注意|延期|冲突|污染|不够|核对/.test(text) && risks.length < 4) {
        risks.push({ text: shortText(text, 78), messageId: evidence });
      }
    });

    if (!decisions.length) {
      const latest = sourceMessages[sourceMessages.length - 1];
      decisions.push({
        text: shortText(latest.content, 78),
        messageId: latest.id
      });
    }

    const labActions = [];
    const combinedText = sourceMessages.map((message) => message.content).join(' ');
    state.instruments.forEach((instrument) => {
      if (
        combinedText.includes(instrument.name) ||
        combinedText.includes(instrument.code) ||
        (instrument.id === 'inst_clsm' && combinedText.includes('共聚焦'))
      ) {
        labActions.push({
          type: 'booking_draft',
          instrumentId: instrument.id,
          label: `${instrument.name}（${instrument.code}）可能需要预约或调整`
        });
      }
    });

    const focus = tasks[0]?.text || decisions[0]?.text || '群聊工作已形成阶段性总结';
    return {
      headline: `当前重点是：${shortText(focus, 54)}`,
      decisions,
      tasks,
      risks,
      labActions
    };
  }

  async function requestLocalModelSummary(group, agent, sourceMessages) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 190000);
    try {
      const response = await fetch('/api/agent/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          agentId: agent.id,
          messages: sourceMessages.slice(-80).map((message) => ({
            id: message.id,
            sender: message.senderName,
            content: message.content
          })),
          instruments: state.instruments.map((instrument) => ({
            id: instrument.id,
            name: instrument.name,
            code: instrument.code
          }))
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `本地模型请求失败（${response.status}）`);
      }
      return data;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function commitSummary(group, agent, sourceMessages, payload, meta = {}) {
    const summary = {
      id: uid('summary'),
      groupId: group.id,
      agentId: agent.id,
      agentName: agent.name,
      headline: payload.headline,
      decisions: payload.decisions || [],
      tasks: payload.tasks || [],
      risks: payload.risks || [],
      labActions: payload.labActions || [],
      messageCount: sourceMessages.length,
      generatedAt: new Date().toISOString(),
      savedToWorkspace: false,
      source: meta.source || 'rules',
      model: meta.model || '',
      latencyMs: meta.latencyMs || 0
    };

    state.summaries[`${group.id}:${agent.id}`] = summary;
    state.selectedAgentId = agent.id;
    state.agentTyping = false;

    const agentMessage = {
      id: uid('msg'),
      type: 'agent',
      senderId: agent.id,
      senderName: agent.name,
      content: `群聊总结已生成：${summary.headline} 共识别 ${summary.tasks.length} 项待办、${summary.risks.length} 项风险。`,
      attachment: summary.source === 'local'
        ? `${summary.model} 本地模型 · 引用 ${sourceMessages.length} 条消息`
        : `本地模型暂不可用，已降级为规则摘要 · 引用 ${sourceMessages.length} 条消息`,
      createdAt: new Date().toISOString()
    };
    group.messages.push(agentMessage);
    group.messages = group.messages.slice(-200);
    saveState();
    renderView();
    toast(
      summary.source === 'local'
        ? `${agent.name} 已通过本地 ${summary.model} 完成群聊总结。`
        : `${agent.name} 已完成规则摘要；本地 7B 模型暂不可用。`,
      summary.source === 'local' ? 'success' : 'error'
    );
  }

  async function generateSummary(options = {}) {
    const group = getGroup();
    const agentId = options.agentId || group.agentId || state.selectedAgentId;
    const agent = getAgent(agentId);
    const sourceMessages = group.messages.filter((message) =>
      message.type === 'text' && message.senderId !== agent.id
    );

    if (!sourceMessages.length) {
      toast('当前群聊还没有可总结的消息。先发送或导入聊天记录。', 'error');
      return;
    }

    state.agentTyping = true;
    renderView();

    try {
      const result = await requestLocalModelSummary(group, agent, sourceMessages);
      commitSummary(group, agent, sourceMessages, result.summary, result.meta || {});
    } catch (error) {
      const payload = buildRuleSummary(sourceMessages);
      commitSummary(group, agent, sourceMessages, payload, {
        source: 'rules',
        model: '',
        latencyMs: 0
      });
      if (error.name !== 'AbortError') {
        console.warn('Local model summary failed, using rule fallback:', error.message);
      }
    }
  }

  function renderBooking() {
    const dateBookings = state.bookings
      .filter((booking) => booking.date === state.selectedDate && !booking.cancelledAt)
      .sort((a, b) => a.start.localeCompare(b.start));
    const availableCount = state.instruments.filter((instrument) => instrument.status === 'available').length;
    const waitingCheckin = state.bookings.filter((booking) => deriveLedger(booking).status === 'scheduled').length;
    const scheduledHours = dateBookings.reduce((sum, booking) =>
      sum + parseTimeToMinutes(booking.end) - parseTimeToMinutes(booking.start), 0
    ) / 60;
    const utilization = Math.min(100, Math.round((scheduledHours / (state.instruments.length * 12)) * 100));

    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>仪器预约</h1>
            <p>冲突校验 · 仪器状态 · 扫码上下文</p>
          </div>
          <div class="view-header-actions">
            <button class="button" type="button" data-action="booking-help">${icon('qr')} 扫码说明</button>
            <button class="button button-primary" type="button" data-action="open-new-booking">${icon('plus')} 新建预约</button>
          </div>
        </header>
        <div class="page-scroll">
          <div class="page-content">
            <div class="page-intro-row">
              <div>
                <h2>公共仪器排期</h2>
                <p>同一仪器的有效预约不能重叠，维护中的仪器不可预约。</p>
              </div>
              <div class="inline-actions">
                <label class="date-control">
                  ${icon('calendar')}
                  <input type="date" id="booking-date" value="${escapeHtml(state.selectedDate)}" aria-label="选择预约日期">
                </label>
                <button class="button button-sm" type="button" data-action="today-booking">今天</button>
              </div>
            </div>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-card-head"><span>可预约仪器</span><span class="stat-card-icon">${icon('flask')}</span></div>
                <div class="stat-card-value"><strong>${availableCount}</strong><span>/ ${state.instruments.length} 台</span></div>
                <div class="stat-card-foot">另有 1 台正在使用，1 台维护中</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>当日预约</span><span class="stat-card-icon blue">${icon('calendar')}</span></div>
                <div class="stat-card-value"><strong>${dateBookings.length}</strong><span>条</span></div>
                <div class="stat-card-foot">${escapeHtml(formatDate(state.selectedDate, 'full'))}</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>预计占用率</span><span class="stat-card-icon amber">${icon('chart')}</span></div>
                <div class="stat-card-value"><strong>${utilization}%</strong><span>08:00–20:00</span></div>
                <div class="stat-card-foot">按当前已预约时段估算</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>待上机</span><span class="stat-card-icon coral">${icon('clock')}</span></div>
                <div class="stat-card-value"><strong>${waitingCheckin}</strong><span>条记录</span></div>
                <div class="stat-card-foot">仅预约不能形成闭环台账</div>
              </div>
            </div>
            <div class="booking-layout">
              <div class="instrument-grid">
                ${state.instruments.map((instrument) => {
                  const instrumentBookings = dateBookings.filter((booking) => booking.instrumentId === instrument.id);
                  const next = instrumentBookings[0];
                  return `
                    <article class="instrument-card ${instrument.status === 'maintenance' ? 'is-maintenance' : ''}">
                      <div class="instrument-card-top">
                        <div class="instrument-identity">
                          <span class="instrument-icon">${icon(instrumentIcon(instrument.category))}</span>
                          <span class="instrument-title">
                            <strong>${escapeHtml(instrument.name)}</strong>
                            <span>${escapeHtml(instrument.model)} · ${escapeHtml(instrument.code)}</span>
                          </span>
                        </div>
                        <span class="status-badge ${instrument.status === 'available' ? 'closed' : instrument.status === 'in-use' ? 'in-use' : 'overdue'}">
                          ${escapeHtml(instrumentStatusLabel(instrument.status))}
                        </span>
                      </div>
                      <div class="instrument-middle">
                        <span>${icon('dashboard')} ${escapeHtml(instrument.location)}</span>
                        <span>${icon('user')} ${escapeHtml(instrument.manager)}</span>
                      </div>
                      <div class="instrument-card-footer">
                        <span class="instrument-next">
                          ${next ? `下一预约 <strong>${escapeHtml(next.start)}–${escapeHtml(next.end)}</strong>` : '当前日期暂无预约'}
                        </span>
                        <button class="button button-sm ${instrument.status === 'maintenance' ? '' : 'button-soft'}"
                          type="button"
                          data-action="open-booking"
                          data-instrument-id="${escapeHtml(instrument.id)}"
                          ${instrument.status === 'maintenance' ? 'disabled' : ''}>
                          ${icon('plus')} 预约
                        </button>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
              <aside class="section-panel">
                <div class="section-panel-header">
                  <div class="section-panel-title">
                    <strong>当天时段</strong>
                    <span>${escapeHtml(formatDate(state.selectedDate, 'full'))}</span>
                  </div>
                  <span class="status-badge closed">${dateBookings.length} 条</span>
                </div>
                <div class="section-panel-body">
                  ${dateBookings.length ? `
                    <ul class="slot-list">
                      ${dateBookings.map((booking) => {
                        const instrument = getInstrument(booking.instrumentId);
                        const ledger = deriveLedger(booking);
                        return `
                          <li class="slot-item">
                            <span class="slot-time">${escapeHtml(booking.start)}</span>
                            <span class="slot-copy">
                              <strong>${escapeHtml(instrument?.name || '未知仪器')}</strong>
                              <small>${escapeHtml(booking.applicant)} · ${escapeHtml(shortText(booking.purpose, 16))}</small>
                            </span>
                            <button class="icon-button subtle" type="button" data-action="booking-detail" data-booking-id="${escapeHtml(booking.id)}" aria-label="查看预约详情" title="查看预约详情">${icon('chevron-right')}</button>
                          </li>
                        `;
                      }).join('')}
                    </ul>
                  ` : `
                    <div class="empty-state" style="padding:28px 10px">
                      <span class="empty-state-icon">${icon('calendar')}</span>
                      <strong>当天还没有预约</strong>
                      <p>选择一台可预约仪器，创建第一条时段记录。</p>
                    </div>
                  `}
                </div>
              </aside>
            </div>
            <section class="section-panel timeline-panel">
              <div class="section-panel-header">
                <div class="section-panel-title">
                  <strong>仪器日视图</strong>
                  <span>08:00–20:00 · 点击色块查看预约详情</span>
                </div>
                <button class="text-button" type="button" data-view="ledger">查看使用台账</button>
              </div>
              <div class="schedule-scroll">
                <div class="schedule-axis">
                  <div class="schedule-axis-label">仪器</div>
                  <div class="schedule-hours">
                    ${['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'].map((time) => `<span>${time}</span>`).join('')}
                  </div>
                </div>
                ${state.instruments.map((instrument, index) => {
                  const instrumentBookings = dateBookings.filter((booking) => booking.instrumentId === instrument.id);
                  const now = new Date();
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const showNow = state.selectedDate === todayKey() && nowMinutes >= 480 && nowMinutes <= 1200;
                  const nowPosition = ((nowMinutes - 480) / 720) * 100;
                  const colorClasses = ['', 'amber', 'blue', 'violet'];
                  return `
                    <div class="schedule-row">
                      <div class="schedule-instrument">
                        <span class="mini-instrument-icon">${icon(instrumentIcon(instrument.category))}</span>
                        <span class="schedule-instrument-copy">
                          <strong>${escapeHtml(instrument.name)}</strong>
                          <small>${escapeHtml(instrument.code)} · ${escapeHtml(instrument.location)}</small>
                        </span>
                      </div>
                      <div class="schedule-track">
                        ${showNow ? `<span class="schedule-now-line" style="left:${nowPosition}%"></span>` : ''}
                        ${instrumentBookings.map((booking, bookingIndex) => {
                          const startMinutes = Math.max(480, parseTimeToMinutes(booking.start));
                          const endMinutes = Math.min(1200, parseTimeToMinutes(booking.end));
                          if (endMinutes <= 480 || startMinutes >= 1200) return '';
                          const left = ((startMinutes - 480) / 720) * 100;
                          const width = ((endMinutes - startMinutes) / 720) * 100;
                          return `
                            <button class="schedule-block ${colorClasses[(index + bookingIndex) % colorClasses.length]}"
                              type="button"
                              style="left:${left}%;width:${Math.max(width, 4)}%"
                              data-action="booking-detail"
                              data-booking-id="${escapeHtml(booking.id)}"
                              title="${escapeHtml(instrument.name)} ${escapeHtml(booking.start)}–${escapeHtml(booking.end)} ${escapeHtml(booking.applicant)}">
                              ${escapeHtml(booking.applicant)} · ${escapeHtml(booking.start)}
                            </button>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>
          </div>
        </div>
      </section>
    `;
  }

  function getFilteredLedgerRows() {
    return allLedgerRows().filter((row) => {
      const instrument = getInstrument(row.instrumentId);
      const matchesStatus = state.ledgerStatus === 'all' || row.status === state.ledgerStatus;
      const matchesDate = state.ledgerDate === 'all'
        || (state.ledgerDate === 'today' && row.date === todayKey())
        || (state.ledgerDate === 'week' && row.date >= toDateKey(dateAtOffset(-6)) && row.date <= todayKey());
      const haystack = `${instrument?.name || ''} ${instrument?.code || ''} ${row.applicant} ${row.purpose} ${row.id}`.toLowerCase();
      const matchesSearch = !state.ledgerSearch || haystack.includes(state.ledgerSearch.toLowerCase());
      return matchesStatus && matchesDate && matchesSearch;
    });
  }

  function evidenceCheck(label, done) {
    return `<span class="evidence-check ${done ? 'done' : ''}" title="${escapeHtml(label)}">${icon(done ? 'check' : 'clock')}</span>`;
  }

  function renderLedgerRows() {
    const rows = getFilteredLedgerRows();
    if (!rows.length) {
      return `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="padding:30px">
              <span class="empty-state-icon">${icon('clipboard')}</span>
              <strong>没有符合条件的台账记录</strong>
              <p>调整搜索词或状态筛选后再试。</p>
            </div>
          </td>
        </tr>
      `;
    }

    return rows.map((row) => {
      const instrument = getInstrument(row.instrumentId);
      const varianceClass = row.variance === null ? 'neutral' : row.variance > 0 ? 'positive' : row.variance < 0 ? 'negative' : 'neutral';
      let primaryAction = '';
      if (!row.checkInAt && row.status !== 'cancelled' && row.status !== 'no-show') {
        primaryAction = `<button class="button button-sm button-soft" type="button" data-action="scan-in" data-booking-id="${escapeHtml(row.id)}">${icon('scan')} 扫码上机</button>`;
      } else if (row.checkInAt && !row.checkOutAt) {
        primaryAction = `<button class="button button-sm button-primary" type="button" data-action="scan-out" data-booking-id="${escapeHtml(row.id)}">${icon('scan')} 扫码下机</button>`;
      }
      return `
        <tr>
          <td>
            <div class="table-main">
              <strong>${escapeHtml(instrument?.name || '未知仪器')}</strong>
              <small>${escapeHtml(instrument?.code || '')} · ${escapeHtml(instrument?.location || '')}</small>
            </div>
          </td>
          <td>
            <div class="table-main">
              <strong>${escapeHtml(row.id)}</strong>
              <small>${escapeHtml(row.applicant)} · ${escapeHtml(shortText(row.purpose, 16))}</small>
            </div>
          </td>
          <td>
            <div class="time-stack">
              <strong>${escapeHtml(row.start)}–${escapeHtml(row.end)}</strong>
              <small>${escapeHtml(formatDate(row.date))}</small>
            </div>
          </td>
          <td>
            <div class="time-stack">
              <strong>${row.checkInAt ? escapeHtml(formatTimeOnly(row.checkInAt)) : '未上机'}–${row.checkOutAt ? escapeHtml(formatTimeOnly(row.checkOutAt)) : '未下机'}</strong>
              <small>${row.checkInAt ? '扫描时间已记录' : '等待首次扫描'}</small>
            </div>
          </td>
          <td>
            <div class="time-stack">
              <strong>${row.actualMinutes === null ? '—' : escapeHtml(durationLabel(row.actualMinutes))}</strong>
              <span class="variance ${varianceClass}">${row.variance === null ? '待闭环' : escapeHtml(compactVariance(row.variance))}</span>
            </div>
          </td>
          <td>
            <div class="evidence-checks" title="预约、上机、下机三项证据">
              ${evidenceCheck('预约已存在', true)}
              ${evidenceCheck('上机扫描', Boolean(row.checkInAt))}
              ${evidenceCheck('下机扫描', Boolean(row.checkOutAt))}
            </div>
          </td>
          <td>
            <div class="status-badge ${statusClass(row.status)}">${escapeHtml(row.statusLabel)}</div>
            <div class="table-actions" style="margin-top:6px">
              ${primaryAction}
              <button class="button button-sm button-ghost" type="button" data-action="booking-detail" data-booking-id="${escapeHtml(row.id)}" title="查看详情" aria-label="查看详情">${icon('chevron-right')}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderLedger() {
    const rows = allLedgerRows();
    const pending = rows.filter((row) => !row.checkInAt && !['no-show', 'cancelled', 'closed'].includes(row.status)).length;
    const inUse = rows.filter((row) => row.status === 'in-use').length;
    const closed = rows.filter((row) => row.status === 'closed').length;
    const exceptions = rows.filter((row) => ['overdue', 'no-show'].includes(row.status)).length;
    const measuredRows = rows.filter((row) => row.variance !== null);
    const averageVariance = measuredRows.length
      ? Math.round(measuredRows.reduce((sum, row) => sum + row.variance, 0) / measuredRows.length)
      : 0;
    const filtered = getFilteredLedgerRows();

    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>使用台账 <span class="agent-type">双扫描闭环</span></h1>
            <p>预约 + 上机扫描 + 下机扫描，缺一不可</p>
          </div>
          <div class="view-header-actions">
            <button class="button" type="button" data-action="export-ledger">${icon('file')} 导出台账</button>
            <button class="button button-primary" type="button" data-action="open-new-booking">${icon('plus')} 新建预约</button>
          </div>
        </header>
        <div class="page-scroll">
          <div class="page-content">
            <div class="page-intro-row">
              <div>
                <h2>仪器使用记录</h2>
                <p>实际用时只按有效上机与下机扫描计算，预约时间保留为计划依据。</p>
              </div>
              <div class="inline-actions">
                <span class="status-badge closed">${rows.length} 条总记录</span>
                <span class="status-badge ${exceptions ? 'overdue' : 'closed'}">${exceptions} 条需处理</span>
              </div>
            </div>
            <div class="ledger-kpis">
              <div class="ledger-kpi">
                <span class="ledger-kpi-icon">${icon('check')}</span>
                <span class="ledger-kpi-copy"><strong>${closed}</strong><span>已双扫描闭环</span></span>
              </div>
              <div class="ledger-kpi">
                <span class="ledger-kpi-icon amber">${icon('clock')}</span>
                <span class="ledger-kpi-copy"><strong>${pending + inUse}</strong><span>待上机或待下机</span></span>
              </div>
              <div class="ledger-kpi">
                <span class="ledger-kpi-icon coral">${icon('alert')}</span>
                <span class="ledger-kpi-copy"><strong>${exceptions}</strong><span>超时或逾期未上机</span></span>
              </div>
              <div class="ledger-kpi">
                <span class="ledger-kpi-icon blue">${icon('chart')}</span>
                <span class="ledger-kpi-copy"><strong>${averageVariance > 0 ? '+' : ''}${averageVariance}m</strong><span>闭环记录平均偏差</span></span>
              </div>
            </div>
            <div class="filter-bar">
              <label class="search-control">
                ${icon('search')}
                <input id="ledger-search" type="search" value="${escapeHtml(state.ledgerSearch)}" placeholder="搜索仪器、申请人、预约号" aria-label="搜索台账">
              </label>
              <select class="select-control" id="ledger-status-filter" aria-label="台账状态">
                <option value="all" ${state.ledgerStatus === 'all' ? 'selected' : ''}>全部状态</option>
                <option value="scheduled" ${state.ledgerStatus === 'scheduled' ? 'selected' : ''}>待上机</option>
                <option value="in-use" ${state.ledgerStatus === 'in-use' ? 'selected' : ''}>使用中</option>
                <option value="closed" ${state.ledgerStatus === 'closed' ? 'selected' : ''}>已闭环</option>
                <option value="overdue" ${state.ledgerStatus === 'overdue' ? 'selected' : ''}>超时未下机</option>
                <option value="no-show" ${state.ledgerStatus === 'no-show' ? 'selected' : ''}>逾期未上机</option>
              </select>
              <select class="select-control" id="ledger-date-filter" aria-label="台账日期">
                <option value="all" ${state.ledgerDate === 'all' ? 'selected' : ''}>全部日期</option>
                <option value="today" ${state.ledgerDate === 'today' ? 'selected' : ''}>今天</option>
                <option value="week" ${state.ledgerDate === 'week' ? 'selected' : ''}>最近 7 天</option>
              </select>
              <button class="button button-sm button-ghost" type="button" data-action="reset-ledger-filters">${icon('settings')} 重置筛选</button>
              <span class="muted" style="margin-left:auto;font-size:10px">当前显示 ${filtered.length} 条</span>
            </div>
            <section class="section-panel">
              <div class="section-panel-header">
                <div class="section-panel-title">
                  <strong>闭环凭证</strong>
                  <span>灰色表示缺少扫描证据，台账不会自动完成</span>
                </div>
                <div class="evidence-checks">
                  ${evidenceCheck('预约', true)}
                  ${evidenceCheck('上机', true)}
                  ${evidenceCheck('下机', true)}
                </div>
              </div>
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>仪器</th>
                      <th>预约 / 申请人</th>
                      <th>预约时间</th>
                      <th>实际扫描</th>
                      <th>实际用时 / 偏差</th>
                      <th>凭证</th>
                      <th>状态 / 操作</th>
                    </tr>
                  </thead>
                  <tbody id="ledger-table-body">${renderLedgerRows()}</tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </section>
    `;
  }

  function renderAgentPermissions(agent) {
    const permissionLabels = [
      ['readChat', '读取授权群聊'],
      ['summarize', '生成群聊总结'],
      ['bookingDraft', '创建预约草稿'],
      ['exportWorkspace', '保存到 Workspace']
    ];
    return permissionLabels.map(([key, label]) => `
      <li class="permission-item">
        <span>${icon(agent.permissions[key] ? 'check' : 'x')} ${escapeHtml(label)}</span>
        <span class="permission-state">${agent.permissions[key] ? '已授权' : '未授权'}</span>
      </li>
    `).join('');
  }

  function renderAgents() {
    // 协作群聊：左侧是各个群聊目录，右侧是当前群的聊天框。
    const group = getGroup();
    const agent = getAgent(group.agentId);
    const typing = state.agentTyping
      ? `<div class="typing-row"><span class="agent-avatar avatar-xs">${icon('bot')}</span><span>${escapeHtml(agent.name)} 正在读取群聊上下文</span><span class="typing-dots"><span></span><span></span><span></span></span></div>`
      : '';

    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>协作群聊</h1>
            <p>选择左侧群聊，在右侧直接对话 · 群管理员负责总结与协助</p>
          </div>
          <div class="view-header-actions">
            <button class="button button-primary" type="button" id="collab-new-group">${icon('plus')} 新建群聊</button>
          </div>
        </header>
        <div class="chat-view collab-view">
          <aside class="collab-groups">
            ${state.groups.map((item) => {
              const last = [...item.messages].reverse().find((message) => message.type !== 'system');
              return `
                <button class="group-item ${item.id === group.id ? 'is-active' : ''}" type="button" data-collab-group="${escapeHtml(item.id)}">
                  <span class="group-avatar ${escapeHtml(item.color)}">${escapeHtml(item.initials)}</span>
                  <span class="group-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(BOT_ROLE_LABEL[item.botRole] || '普通群管理员')} · ${escapeHtml(shortText(last?.content || '尚未开始协作', 14))}</small>
                  </span>
                </button>
              `;
            }).join('')}
          </aside>
            <div class="chat-mode-bar">
              <strong>${escapeHtml(group.name)}</strong>
              <span class="chat-mode-divider"></span>
              <span class="agent-type">${escapeHtml(BOT_ROLE_LABEL[group.botRole] || '普通群管理员')}</span>
              <span class="chat-mode-note">${escapeHtml(agent.name)} 可总结群聊、充当助手${canBook(group) ? '，并可预约设备' : ''}</span>
            </div>
            <div class="message-scroll" id="message-scroll">
              <div class="message-list">
                ${group.messages.map((message) => renderMessage(message, group)).join('')}
                ${typing}
              </div>
            </div>
            <div class="composer-wrap">
              <div class="quick-actions">
                <button class="quick-action" type="button" data-action="summarize-group">${icon('sparkles')} 总结群聊</button>
                ${canBook(group) ? `<button class="quick-action" type="button" data-action="open-new-booking">${icon('calendar')} 发起仪器预约</button>` : `<span class="chat-mode-note">普通群管理不能预约设备</span>`}
              </div>
              <div class="composer">
                <div class="composer-main">
                  <textarea id="chat-input" rows="2" placeholder="输入消息，输入 @${escapeHtml(agent.name)} 可召唤群助手" aria-label="群聊消息"></textarea>
                </div>
                <button class="icon-button send-button" type="button" data-action="send-message" aria-label="发送消息" title="发送消息">${icon('send')}</button>
              </div>
            </div>
        </div>
      </section>
    `;

    requestAnimationFrame(() => {
      const scroll = $('#message-scroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
  }

  function renderDashboard() {
    const rows = allLedgerRows();
    const closed = rows.filter((row) => row.status === 'closed');
    const exceptions = rows.filter((row) => ['overdue', 'no-show'].includes(row.status));
    const todayRows = rows.filter((row) => row.date === todayKey()).sort((a, b) => a.start.localeCompare(b.start));
    const totalReserved = todayRows.reduce((sum, row) => sum + row.reservedMinutes, 0);
    const totalActual = closed.filter((row) => row.date === todayKey()).reduce((sum, row) => sum + row.actualMinutes, 0);
    const utilization = Math.min(96, Math.round((totalReserved / (state.instruments.length * 720)) * 100));
    const averageVariance = closed.length
      ? Math.round(closed.reduce((sum, row) => sum + row.variance, 0) / closed.length)
      : 0;
    const alerts = [
      ...exceptions.map((row) => ({
        icon: 'alert',
        tone: 'coral',
        title: `${getInstrument(row.instrumentId)?.name || '仪器'} ${row.statusLabel}`,
        detail: `${row.applicant} · ${row.start}–${row.end} · ${row.id}`,
        time: formatDate(row.date)
      })),
      {
        icon: 'wrench',
        tone: '',
        title: '高速冷冻离心机年度校准',
        detail: '本周五 14:00–16:00 不可预约',
        time: '周五'
      },
      {
        icon: 'clock',
        tone: '',
        title: '共聚焦显微镜即将到期',
        detail: '周群当前预约需在 12:00 前扫码下机',
        time: '今日'
      }
    ].slice(0, 4);

    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>实验室看板</h1>
            <p>预约、使用、闭环和风险一屏查看</p>
          </div>
          <div class="view-header-actions">
            <button class="button" type="button" data-action="export-ledger">${icon('file')} 导出日报</button>
            <button class="button button-primary" type="button" data-view="booking">${icon('calendar')} 查看排期</button>
          </div>
        </header>
        <div class="page-scroll">
          <div class="page-content">
            <div class="page-intro-row">
              <div>
                <h2>${escapeHtml(formatDate(todayKey(), 'full'))}</h2>
                <p>先进材料实验室 · 公共仪器平台运行概览</p>
              </div>
              <span class="status-badge closed">数据已同步 · ${formatTimeOnly(new Date().toISOString())}</span>
            </div>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-card-head"><span>今日仪器利用率</span><span class="stat-card-icon">${icon('chart')}</span></div>
                <div class="stat-card-value"><strong>${utilization}%</strong><span>按预约时段</span></div>
                <div class="stat-card-foot">较昨日增加 6 个百分点</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>今日已闭环</span><span class="stat-card-icon blue">${icon('check')}</span></div>
                <div class="stat-card-value"><strong>${todayRows.filter((row) => row.status === 'closed').length}</strong><span>条</span></div>
                <div class="stat-card-foot">实际使用 ${durationLabel(totalActual)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>待处理异常</span><span class="stat-card-icon coral">${icon('alert')}</span></div>
                <div class="stat-card-value"><strong>${exceptions.length}</strong><span>条</span></div>
                <div class="stat-card-foot">${exceptions.length ? '请优先检查缺失扫描' : '当前没有异常记录'}</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-head"><span>平均时长偏差</span><span class="stat-card-icon amber">${icon('clock')}</span></div>
                <div class="stat-card-value"><strong>${averageVariance > 0 ? '+' : ''}${averageVariance}</strong><span>分钟</span></div>
                <div class="stat-card-foot">基于 ${closed.length} 条闭环记录</div>
              </div>
            </div>
            <div class="dashboard-grid">
              <section class="section-panel">
                <div class="section-panel-header">
                  <div class="section-panel-title">
                    <strong>本月仪器利用率</strong>
                    <span>按近 30 天闭环记录与预约占用综合估算</span>
                  </div>
                  <button class="text-button" type="button" data-view="ledger">查看台账</button>
                </div>
                <div class="section-panel-body">
                  <div class="utilization-list">
                    ${state.instruments.map((instrument, index) => `
                      <div class="utilization-row">
                        <div class="utilization-head">
                          <strong>${escapeHtml(instrument.name)}</strong>
                          <span>${instrument.utilization}% · ${escapeHtml(instrument.code)}</span>
                        </div>
                        <div class="progress-track">
                          <div class="progress-fill ${index === 3 ? 'amber' : index === 1 ? 'coral' : ''}" style="width:${instrument.utilization}%"></div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </section>
              <section class="section-panel">
                <div class="section-panel-header">
                  <div class="section-panel-title">
                    <strong>需要关注</strong>
                    <span>异常、维护和即将到期事项</span>
                  </div>
                  <span class="status-badge ${alerts.some((item) => item.tone === 'coral') ? 'overdue' : 'closed'}">${alerts.length} 项</span>
                </div>
                <div class="section-panel-body">
                  <div class="alert-list">
                    ${alerts.map((alert) => `
                      <div class="alert-item">
                        <span class="alert-icon ${alert.tone}">${icon(alert.icon)}</span>
                        <span class="alert-copy">
                          <strong>${escapeHtml(alert.title)}</strong>
                          <small>${escapeHtml(alert.detail)}</small>
                        </span>
                        <span class="alert-time">${escapeHtml(alert.time)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </section>
            </div>
            <section class="section-panel" style="margin-top:14px">
              <div class="section-panel-header">
                <div class="section-panel-title">
                  <strong>今日安排</strong>
                  <span>预约、上机与下机计划</span>
                </div>
                <button class="text-button" type="button" data-view="booking">新增预约</button>
              </div>
              <div class="section-panel-body" style="padding-top:2px;padding-bottom:2px">
                <div class="today-agenda">
                  ${todayRows.length ? todayRows.map((row) => {
                    const instrument = getInstrument(row.instrumentId);
                    return `
                      <div class="agenda-row">
                        <span class="agenda-time">${escapeHtml(row.start)}</span>
                        <span class="agenda-copy">
                          <strong>${escapeHtml(instrument?.name || '未知仪器')} · ${escapeHtml(row.applicant)}</strong>
                          <small>${escapeHtml(row.purpose)}</small>
                        </span>
                        <span class="status-badge ${statusClass(row.status)}">${escapeHtml(row.statusLabel)}</span>
                      </div>
                    `;
                  }).join('') : `
                    <div class="empty-state" style="padding:26px">
                      <span class="empty-state-icon">${icon('calendar')}</span>
                      <strong>今天还没有预约</strong>
                      <p>创建预约后，仪器利用和台账闭环会实时更新。</p>
                    </div>
                  `}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    `;
  }

  function openModal(content, options = {}) {
    modalRoot.innerHTML = `
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${escapeHtml(options.label || '对话框')}">
        ${content}
      </div>
    `;
    backdrop.hidden = false;
    document.body.classList.remove('sidebar-open');
    const focusable = $('.modal-card input, .modal-card select, .modal-card textarea, .modal-card button', modalRoot);
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    backdrop.hidden = true;
  }

  function modalHeader(title, subtitle) {
    return `
      <div class="modal-header">
        <div class="modal-title">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="关闭对话框" title="关闭">${icon('x')}</button>
      </div>
    `;
  }

  function openBookingModal(instrumentId = '') {
    const availableInstruments = state.instruments.filter((instrument) => instrument.status !== 'maintenance');
    const selectedInstrumentId = instrumentId || availableInstruments[0]?.id || '';
    const instrument = getInstrument(selectedInstrumentId);
    openModal(`
      <div class="modal-card">
        ${modalHeader('新建仪器预约', '预约创建后进入“待上机”，不会直接形成闭环台账。')}
        <form id="booking-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field full">
                <label for="booking-instrument">仪器 <span>*</span></label>
                <select id="booking-instrument" name="instrumentId" required>
                  ${availableInstruments.map((item) => `
                    <option value="${escapeHtml(item.id)}" ${item.id === selectedInstrumentId ? 'selected' : ''}>
                      ${escapeHtml(item.name)} · ${escapeHtml(item.code)} · ${escapeHtml(item.location)}
                    </option>
                  `).join('')}
                </select>
              </div>
              <div class="form-field">
                <label for="booking-date-input">预约日期 <span>*</span></label>
                <input id="booking-date-input" name="date" type="date" min="${todayKey()}" value="${escapeHtml(state.selectedDate >= todayKey() ? state.selectedDate : todayKey())}" required>
              </div>
              <div class="form-field">
                <label for="booking-applicant">申请人 <span>*</span></label>
                <input id="booking-applicant" name="applicant" type="text" value="${escapeHtml(state.currentUser.name)}" required>
              </div>
              <div class="form-field">
                <label for="booking-start">开始时间 <span>*</span></label>
                <input id="booking-start" name="start" type="time" value="13:30" min="08:00" max="20:00" required>
              </div>
              <div class="form-field">
                <label for="booking-end">结束时间 <span>*</span></label>
                <input id="booking-end" name="end" type="time" value="15:00" min="08:00" max="20:00" required>
              </div>
              <div class="form-field full">
                <label for="booking-purpose">使用目的 <span>*</span></label>
                <textarea id="booking-purpose" name="purpose" placeholder="说明实验内容、样品类型和需要的支持" required>${instrument ? escapeHtml(`${instrument.name} 实验使用`) : ''}</textarea>
              </div>
            </div>
            <div class="form-help" style="margin-top:10px">预约创建后需到仪器现场完成扫码上机；结束后完成扫码下机，台账才会闭环。</div>
            <div class="form-error" id="booking-error" style="margin-top:10px"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('calendar')} 创建预约</button>
          </div>
        </form>
      </div>
    `, { label: '新建仪器预约' });
  }

  function openImportModal() {
    openModal(`
      <div class="modal-card modal-wide">
        ${modalHeader('迁移群聊到 Team Agent', '粘贴聊天记录或导入文件。附件和聊天内容只作为数据，不作为系统指令。')}
        <form id="import-form">
          <div class="modal-body">
            <div class="migration-layout">
              <label class="file-drop" for="migration-file">
                <span>
                  ${icon('upload')}
                  <strong>选择 TXT、CSV 或 JSON 文件</strong>
                  <span>文件内容会先填充到下方文本框，确认后再导入</span>
                </span>
                <input id="migration-file" type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json">
              </label>
              <div class="form-field">
                <label for="migration-text">聊天记录</label>
                <textarea id="migration-text" rows="8" placeholder="[2026-10-29 09:12] 林雨：明天上午验证 PDMS 配比&#10;周群：共聚焦背景偏高，下午重扫一组。">[2026-10-29 09:12] 林雨：明天上午验证 PDMS 配比
周群：共聚焦背景偏高，下午重扫一组。
王晨：请把上一轮参数表上传到 Workspace。</textarea>
                <span class="form-help">支持“发送人：内容”、CSV 三列格式和消息 JSON 数组。个人微信群需通过官方产品导出或手工复制，不能直接同步。</span>
              </div>
              <div class="checkbox-list">
                <label class="checkbox-row">
                  <input type="checkbox" name="bindAgent" checked>
                  <span>导入后同步到当前群 Agent<small>${escapeHtml(getAgent(getGroup().agentId).name)} 将读取这些消息作为上下文。</small></span>
                </label>
              </div>
              <div class="form-error" id="import-error"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('upload')} 导入群聊</button>
          </div>
        </form>
      </div>
    `, { label: '迁移群聊' });
  }

  function openAgentCreateModal() {
    openModal(`
      <div class="modal-card">
        ${modalHeader('创建 Team Agent', '创建一个绑定当前群聊、拥有明确工具边界的岗位 Agent。')}
        <form id="agent-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field">
                <label for="agent-name">Agent 名称 <span>*</span></label>
                <input id="agent-name" name="name" type="text" placeholder="例如：实验排程助手" required>
              </div>
              <div class="form-field">
                <label for="agent-role">岗位角色 <span>*</span></label>
                <input id="agent-role" name="role" type="text" placeholder="例如：项目协调 Agent" value="实验室协作 Agent" required>
              </div>
              <div class="form-field full">
                <label for="agent-description">职责说明</label>
                <textarea id="agent-description" name="description" placeholder="说明它读取哪些群聊、整理什么内容、可以调用哪些工具">读取群聊中的实验安排、决策和风险，生成待办摘要与仪器预约草稿。</textarea>
              </div>
              <div class="form-field full">
                <label>权限</label>
                <div class="checkbox-list">
                  <label class="checkbox-row"><input type="checkbox" name="readChat" checked><span>读取授权群聊<small>只读取当前项目和用户有权访问的消息。</small></span></label>
                  <label class="checkbox-row"><input type="checkbox" name="summarize" checked><span>生成群聊工作总结<small>输出决策、待办、风险并附消息证据。</small></span></label>
                  <label class="checkbox-row"><input type="checkbox" name="bookingDraft" checked><span>创建仪器预约草稿<small>草稿需要用户确认后才会生成正式预约。</small></span></label>
                  <label class="checkbox-row"><input type="checkbox" name="bindGroup" checked><span>绑定到当前群聊<small>${escapeHtml(getGroup().name)}</small></span></label>
                </div>
              </div>
            </div>
            <div class="form-error" id="agent-error" style="margin-top:10px"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('bot')} 创建 Agent</button>
          </div>
        </form>
      </div>
    `, { label: '创建 Team Agent' });
  }

  function openNewGroupModal() {
    openModal(`
      <div class="modal-card">
        ${modalHeader('新建协作群聊', '群聊是项目上下文、Agent、预约和台账的共同边界。')}
        <form id="group-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field full">
                <label for="group-name">群聊名称 <span>*</span></label>
                <input id="group-name" name="name" type="text" placeholder="例如：细胞分析实验组" required>
              </div>
              <div class="form-field full">
                <label for="group-description">项目说明</label>
                <input id="group-description" name="description" type="text" placeholder="这个群主要协作什么工作">
              </div>
              <div class="form-field full">
                <label>群管理员 <span>*</span></label>
                <div class="checkbox-list">
                  <label class="checkbox-row">
                    <input type="radio" name="botRole" value="device" checked>
                    <span>设备预约管理员<small>可以总结群聊、充当群助手，并且能发起仪器预约。</small></span>
                  </label>
                  <label class="checkbox-row">
                    <input type="radio" name="botRole" value="general">
                    <span>普通群管理员<small>可以总结群聊、充当群助手，但不能预约设备。</small></span>
                  </label>
                </div>
              </div>
            </div>
            <div class="form-error" id="group-error" style="margin-top:10px"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('plus')} 创建群聊</button>
          </div>
        </form>
      </div>
    `, { label: '新建协作群聊' });
  }

  function openScanModal(bookingId, scanType) {
    const booking = getBooking(bookingId);
    if (!booking) return;
    const instrument = getInstrument(booking.instrumentId);
    if (!instrument) return;
    const actionLabel = scanType === 'check-in' ? '扫码上机' : '扫码下机';
    const expectedCode = `${instrument.code}-${booking.id}`;
    const description = scanType === 'check-in'
      ? '验证预约后记录实际上机时间。上机后仍不能闭环，必须完成下机扫描。'
      : '验证本次预约已有上机记录后，记录实际下机时间并计算实际时长与偏差。';

    openModal(`
      <div class="modal-card">
        ${modalHeader(actionLabel, description)}
        <form id="scan-form" data-booking-id="${escapeHtml(booking.id)}" data-scan-type="${escapeHtml(scanType)}">
          <div class="modal-body">
            <div class="scan-card">
              <div class="scan-instruction">
                <span class="scan-instruction-icon">${icon('scan')}</span>
                <span class="scan-instruction-copy">
                  <strong>${escapeHtml(instrument.name)} · ${escapeHtml(instrument.location)}</strong>
                  <p>扫描仪器二维码，或在连接扫码枪后直接扫描。演示环境可点击“填入示例码”。</p>
                </span>
              </div>
              <div class="scan-meta">
                <div class="scan-meta-item"><span>预约号</span><strong>${escapeHtml(booking.id)}</strong></div>
                <div class="scan-meta-item"><span>预约时间</span><strong>${escapeHtml(booking.start)}–${escapeHtml(booking.end)}</strong></div>
                <div class="scan-meta-item"><span>申请人</span><strong>${escapeHtml(booking.applicant)}</strong></div>
              </div>
              <div class="form-field">
                <label for="scan-code">扫码结果 <span>*</span></label>
                <div class="scan-code-field">
                  <input id="scan-code" name="scanCode" type="text" autocomplete="off" placeholder="扫描或输入仪器扫码结果" required>
                  <button class="button button-soft" type="button" data-action="fill-demo-scan" data-code="${escapeHtml(expectedCode)}">${icon('qr')} 填入示例码</button>
                </div>
                <span class="form-help">生产版使用一次性签名令牌，演示版使用“仪器码 + 预约号”模拟。</span>
              </div>
              <div class="form-error" id="scan-error"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('scan')} 确认${escapeHtml(actionLabel)}</button>
          </div>
        </form>
      </div>
    `, { label: actionLabel });
  }

  function timelineItem(iconName, title, detail, time, stateName) {
    return `
      <li class="detail-timeline-item">
        <span class="timeline-dot ${escapeHtml(stateName)}">${icon(iconName)}</span>
        <span class="timeline-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(detail)}</span>
        </span>
        <span class="timeline-time">${escapeHtml(time)}</span>
      </li>
    `;
  }

  function openBookingDetail(bookingId) {
    const booking = getBooking(bookingId);
    if (!booking) return;
    const instrument = getInstrument(booking.instrumentId);
    const ledger = deriveLedger(booking);
    openModal(`
      <div class="modal-card">
        ${modalHeader(`${instrument?.name || '仪器'}使用详情`, `${booking.id} · 预约与扫描凭证`)}
        <div class="modal-body">
          <div class="scan-meta">
            <div class="scan-meta-item"><span>预约时间</span><strong>${escapeHtml(booking.start)}–${escapeHtml(booking.end)}</strong></div>
            <div class="scan-meta-item"><span>实际用时</span><strong>${ledger.actualMinutes === null ? '待闭环' : escapeHtml(durationLabel(ledger.actualMinutes))}</strong></div>
            <div class="scan-meta-item"><span>台账状态</span><strong>${escapeHtml(ledger.statusLabel)}</strong></div>
          </div>
          <div style="height:18px"></div>
          <ul class="detail-timeline">
            ${timelineItem('calendar', '预约已创建', `${booking.applicant} · ${booking.purpose}`, formatDateTime(booking.createdAt), 'done')}
            ${timelineItem(
              'scan',
              booking.checkInAt ? '上机扫描已记录' : '等待上机扫描',
              booking.checkInAt ? `${formatDateTime(booking.checkInAt)} · 实际上机` : '缺少上机扫描时台账不能闭环。',
              booking.checkInAt ? formatTimeOnly(booking.checkInAt) : '待完成',
              booking.checkInAt ? 'done' : 'pending'
            )}
            ${timelineItem(
              'check',
              booking.checkOutAt ? '下机扫描已记录' : '等待下机扫描',
              booking.checkOutAt ? `${formatDateTime(booking.checkOutAt)} · 实际下机` : (booking.checkInAt ? '已经上机，请在使用结束后扫码下机。' : '上机扫描完成后才能执行下机。'),
              booking.checkOutAt ? formatTimeOnly(booking.checkOutAt) : '待完成',
              booking.checkOutAt ? 'done' : 'pending'
            )}
          </ul>
          <div class="scan-instruction" style="margin-top:18px">
            <span class="scan-instruction-icon">${icon('alert')}</span>
            <span class="scan-instruction-copy">
              <strong>闭环规则</strong>
              <p>只有预约、有效上机扫描和有效下机扫描同时存在，系统才计算并确认实际使用时长。当前预约时长 ${durationLabel(ledger.reservedMinutes)}，与实际时长分别保存。</p>
            </span>
          </div>
        </div>
        <div class="modal-footer">
          ${booking.cancelledAt ? '' : `<button class="button button-danger" type="button" data-action="cancel-booking" data-booking-id="${escapeHtml(booking.id)}">${icon('trash')} 取消预约</button>`}
          ${!booking.checkInAt && booking.status !== 'cancelled' && booking.status !== 'no-show' ? `<button class="button button-primary" type="button" data-action="scan-in" data-booking-id="${escapeHtml(booking.id)}">${icon('scan')} 扫码上机</button>` : ''}
          ${booking.checkInAt && !booking.checkOutAt ? `<button class="button button-primary" type="button" data-action="scan-out" data-booking-id="${escapeHtml(booking.id)}">${icon('scan')} 扫码下机</button>` : ''}
          <button class="button" type="button" data-action="close-modal">关闭</button>
        </div>
      </div>
    `, { label: '预约与台账详情' });
  }

  function openSummaryModal() {
    const group = getGroup();
    const agent = getAgent(group.agentId);
    const summary = state.summaries[`${group.id}:${agent.id}`];
    openModal(`
      <div class="modal-card modal-wide">
        ${modalHeader('群聊工作摘要', `${group.name} · ${agent.name} 生成`)}
        <div class="modal-body">
          ${summary ? renderSummaryCard(summary) : `
            <div class="summary-empty" style="min-height:240px;align-content:center">
              <span class="summary-empty-icon">${icon('sparkles')}</span>
              <strong>当前群聊还没有摘要</strong>
              <p>Agent 会读取已授权消息，提取决策、待办、风险和仪器动作，并为每条结论附上消息证据。</p>
              <button class="button button-primary" type="button" data-action="summarize-group">${icon('sparkles')} 生成群聊摘要</button>
            </div>
          `}
        </div>
        <div class="modal-footer">
          <button class="button" type="button" data-action="close-modal">关闭</button>
        </div>
      </div>
    `, { label: '群聊工作摘要' });
  }

  function openAgentPermissionsModal() {
    openModal(`
      <div class="modal-card">
        ${modalHeader('Agent 权限与安全边界', '演示版已经展示生产设计中的核心边界。')}
        <div class="modal-body">
          <div class="checkbox-list">
            <div class="checkbox-row"><span style="color:var(--green)">${icon('check')}</span><span>Agent 只能读取当前用户有权访问的群聊和 Workspace 文档。<small>权限取用户权限与项目权限的交集。</small></span></div>
            <div class="checkbox-row"><span style="color:var(--green)">${icon('check')}</span><span>聊天、附件与网页内容按数据处理，不能直接变成工具指令。<small>防止提示注入和越权调用。</small></span></div>
            <div class="checkbox-row"><span style="color:var(--green)">${icon('check')}</span><span>预约草稿、发送、删除和发布需要人工确认。<small>Agent 不具备直接修改闭环台账原始扫描时间的权限。</small></span></div>
            <div class="checkbox-row"><span style="color:var(--green)">${icon('check')}</span><span>所有运行保存输出、引用消息、工具调用和耗时。<small>便于追溯结论来源。</small></span></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button button-primary" type="button" data-action="close-modal">了解</button>
        </div>
      </div>
    `, { label: 'Agent 权限说明' });
  }

  /* ---------- 管理后台 ---------- */
  let adminTab = 'devices';
  let adminDevices = [];
  let adminBookings = [];
  let adminUsers = [];

  const ADMIN_TAB_LABEL = { devices: '设备管理', bookings: '预约管理', users: '用户管理' };

  async function loadAdminData() {
    if (!isAdminLoggedIn()) return;
    const [instRes, bookingRes, userRes] = await Promise.all([
      adminFetch('/api/admin/instruments'),
      adminFetch('/api/admin/bookings'),
      adminFetch('/api/admin/users')
    ]);
    if (instRes && instRes.ok) {
      const { instruments = [] } = await instRes.json().catch(() => ({}));
      adminDevices = instruments;
    }
    if (bookingRes && bookingRes.ok) {
      const { bookings = [] } = await bookingRes.json().catch(() => ({}));
      adminBookings = bookings;
    }
    if (userRes && userRes.ok) {
      const { users = [] } = await userRes.json().catch(() => ({}));
      adminUsers = users;
    }
    renderView();
  }

  function adminBookingStatus(booking) {
    if (booking.status === 'cancelled') return { label: '已取消', cls: 'overdue' };
    if (booking.checkInAt && booking.checkOutAt) return { label: '已闭环', cls: 'closed' };
    if (booking.checkInAt) return { label: '使用中', cls: 'in-use' };
    return { label: '待上机', cls: 'scheduled' };
  }

  function renderAdmin() {
    viewRoot.innerHTML = `
      <section class="view-shell">
        <header class="view-header">
          <div class="view-header-copy">
            <h1>管理后台 <span class="agent-type">管理员</span></h1>
            <p>${escapeHtml(adminSession?.user?.name || 'admin')} · 设备、预约与注册用户管理</p>
          </div>
          <div class="view-header-actions">
            <button class="button" type="button" data-action="admin-logout">${icon('logout')} 退出登录</button>
          </div>
        </header>
        <div class="page-scroll">
          <div class="page-content">
            <div class="admin-tabs">
              ${Object.entries(ADMIN_TAB_LABEL).map(([key, label]) => `
                <button class="admin-tab ${adminTab === key ? 'is-active' : ''}" type="button" data-action="admin-tab" data-tab="${key}">${escapeHtml(label)}</button>
              `).join('')}
            </div>
            <div class="admin-panel">
              ${adminTab === 'devices' ? renderAdminDevices() : adminTab === 'bookings' ? renderAdminBookings() : renderAdminUsers()}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function presenceLabel(device) {
    if (!device.publicUrl || !device.presenceAt) return { text: '未登记', cls: 'overdue' };
    const age = Date.now() - new Date(device.presenceAt).getTime();
    if (Number.isFinite(age) && age < 10 * 60 * 1000) return { text: '在线', cls: 'closed' };
    return { text: '已离线', cls: 'overdue' };
  }

  async function downloadInstrumentQr(id) {
    const device = adminDevices.find((item) => item.id === id);
    const response = await adminFetch(`/api/admin/instruments/${encodeURIComponent(id)}/qr.svg`);
    if (!response) return;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast(payload.message || '二维码生成失败。请先在服务器配置 PUBLIC_BASE_URL。', 'error');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${device?.code || id}.svg`;
    link.click();
    URL.revokeObjectURL(url);
    toast(`已下载 ${device?.name || id} 的二维码。`);
  }

  function renderAdminDevices() {
    return `
      <div class="admin-toolbar">
        <div>
          <h2>仪器设备</h2>
          <p>共 ${adminDevices.length} 台 · 新增、编辑、删除或调整设备状态</p>
        </div>
        <button class="button button-primary" type="button" data-action="admin-device-new">${icon('plus')} 新增设备</button>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>设备</th><th>编号</th><th>位置</th><th>状态</th><th>扫码登记</th><th>最近扫码</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${adminDevices.map((d) => {
              const presence = presenceLabel(d);
              return `
              <tr>
                <td><div class="table-main"><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.model || '—')} · ${escapeHtml(d.id)}</small></div></td>
                <td>${escapeHtml(d.code || '—')}</td>
                <td>${escapeHtml(d.location || '—')}</td>
                <td><span class="status-badge ${d.status === 'available' ? 'closed' : d.status === 'in-use' ? 'in-use' : 'overdue'}">${escapeHtml(instrumentStatusLabel(d.status))}</span></td>
                <td>
                  <div class="table-main">
                    <span class="status-badge ${presence.cls}">${presence.text}</span>
                    <small>${d.presenceAt ? escapeHtml(formatDateTime(d.presenceAt)) : '设备电脑尚未登记'}</small>
                  </div>
                </td>
                <td>${d.lastScanAt ? escapeHtml(formatDateTime(d.lastScanAt)) : '—'}</td>
                <td>
                  <div class="table-actions">
                    <button class="button button-sm button-soft" type="button" data-action="admin-device-qr" data-device-id="${escapeHtml(d.id)}">二维码</button>
                    <button class="button button-sm button-soft" type="button" data-action="admin-device-edit" data-device-id="${escapeHtml(d.id)}">编辑</button>
                    <button class="button button-sm button-ghost" type="button" data-action="admin-device-delete" data-device-id="${escapeHtml(d.id)}">删除</button>
                  </div>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="7"><div class="empty-state" style="padding:28px">暂无设备</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAdminBookings() {
    const instrumentName = (id) => (adminDevices.find((d) => d.id === id)?.name || id);
    return `
      <div class="admin-toolbar">
        <div>
          <h2>预约记录</h2>
          <p>共 ${adminBookings.length} 条 · 含历史、取消与进行中</p>
        </div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>预约号</th><th>设备</th><th>申请人</th><th>日期</th><th>时段</th><th>状态</th><th>上机 / 下机</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${adminBookings.map((b) => {
              const st = adminBookingStatus(b);
              return `
                <tr>
                  <td><strong>${escapeHtml(b.id)}</strong></td>
                  <td>${escapeHtml(instrumentName(b.instrumentId))}</td>
                  <td>${escapeHtml(b.applicant)}</td>
                  <td>${escapeHtml(b.date)}</td>
                  <td>${escapeHtml(b.start)}–${escapeHtml(b.end)}</td>
                  <td><span class="status-badge ${st.cls}">${st.label}</span></td>
                  <td>${b.checkInAt ? escapeHtml(formatTimeOnly(b.checkInAt)) : '—'} / ${b.checkOutAt ? escapeHtml(formatTimeOnly(b.checkOutAt)) : '—'}</td>
                  <td>
                    <div class="table-actions">
                      <button class="button button-sm button-soft" type="button" data-action="admin-booking-edit" data-booking-id="${escapeHtml(b.id)}">编辑</button>
                      ${b.status === 'active' && !b.checkInAt ? `<button class="button button-sm button-ghost" type="button" data-action="admin-booking-cancel" data-booking-id="${escapeHtml(b.id)}">取消</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('') || `<tr><td colspan="8"><div class="empty-state" style="padding:28px">暂无预约</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAdminUsers() {
    return `
      <div class="admin-toolbar">
        <div>
          <h2>注册用户</h2>
          <p>共 ${adminUsers.length} 人 · 用于扫码登录与预约申请人</p>
        </div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>姓名</th><th>邮箱</th><th>角色</th><th>管理权限</th></tr>
          </thead>
          <tbody>
            ${adminUsers.map((u) => `
              <tr>
                <td><div class="table-main"><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.id)}</small></div></td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td>${escapeHtml(u.role || '—')}</td>
                <td>${u.isAdmin ? '<span class="status-badge closed">管理员</span>' : '—'}</td>
              </tr>
            `).join('') || `<tr><td colspan="4"><div class="empty-state" style="padding:28px">暂无用户</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function openAdminLoginModal() {
    openModal(`
      <div class="modal-card">
        ${modalHeader('管理后台登录', '需要平台管理员账号（默认 admin / admin123）。')}
        <form id="admin-login-form">
          <div class="modal-body">
            <div class="form-field">
              <label for="admin-login-name">管理员账号 <span>*</span></label>
              <input id="admin-login-name" name="name" type="text" autocomplete="username" value="admin" required>
            </div>
            <div class="form-field">
              <label for="admin-login-password">密码 <span>*</span></label>
              <input id="admin-login-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <div class="form-error" id="admin-login-error"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('settings')} 登录</button>
          </div>
        </form>
      </div>
    `, { label: '管理后台登录' });
    const input = $('#admin-login-password');
    if (input) setTimeout(() => input.focus(), 30);
  }

  async function handleAdminLogin(form) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const password = String(formData.get('password') || '');
    const error = $('#admin-login-error');
    if (!name || !password) {
      error.textContent = '请填写账号和密码。';
      error.classList.add('is-visible');
      return;
    }
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        error.textContent = payload.message || '登录失败，请确认账号密码。';
        error.classList.add('is-visible');
        return;
      }
      saveAdminSession({ token: payload.token, user: payload.user });
      closeModal();
      state.currentView = 'admin';
      saveState();
      await loadAdminData();
      toast(`已登录管理后台：${payload.user.name}`);
    } catch {
      error.textContent = '无法连接服务，请确认服务已启动。';
      error.classList.add('is-visible');
    }
  }

  function openAdminDeviceModal(id = '') {
    const device = id ? adminDevices.find((d) => d.id === id) : null;
    const d = device || { id: '', code: '', name: '', model: '', location: '', status: 'available', manager: '', category: '', utilization: 0 };
    openModal(`
      <div class="modal-card">
        ${modalHeader(device ? '编辑设备' : '新增设备', device ? `修改「${escapeHtml(device.name)}」的信息与状态` : '新设备会立即出现在预约列表。')}
        <form id="admin-device-form" data-device-id="${escapeHtml(d.id)}">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field full">
                <label for="admin-device-name">设备名称 <span>*</span></label>
                <input id="admin-device-name" name="name" type="text" value="${escapeHtml(d.name)}" required>
              </div>
              <div class="form-field">
                <label for="admin-device-id">设备 ID <span>*</span></label>
                <input id="admin-device-id" name="id" type="text" value="${escapeHtml(d.id)}" ${device ? 'readonly' : ''} placeholder="inst_xxx" required>
              </div>
              <div class="form-field">
                <label for="admin-device-code">设备编号</label>
                <input id="admin-device-code" name="code" type="text" value="${escapeHtml(d.code)}" placeholder="FC-01">
              </div>
              <div class="form-field">
                <label for="admin-device-model">型号</label>
                <input id="admin-device-model" name="model" type="text" value="${escapeHtml(d.model)}">
              </div>
              <div class="form-field">
                <label for="admin-device-location">位置</label>
                <input id="admin-device-location" name="location" type="text" value="${escapeHtml(d.location)}" placeholder="B2-107">
              </div>
              <div class="form-field">
                <label for="admin-device-manager">负责人</label>
                <input id="admin-device-manager" name="manager" type="text" value="${escapeHtml(d.manager)}">
              </div>
              <div class="form-field">
                <label for="admin-device-status">状态</label>
                <select id="admin-device-status" name="status">
                  <option value="available" ${d.status === 'available' ? 'selected' : ''}>可预约</option>
                  <option value="in-use" ${d.status === 'in-use' ? 'selected' : ''}>使用中</option>
                  <option value="maintenance" ${d.status === 'maintenance' ? 'selected' : ''}>维护中</option>
                </select>
              </div>
              <div class="form-field">
                <label for="admin-device-category">类别</label>
                <input id="admin-device-category" name="category" type="text" value="${escapeHtml(d.category)}">
              </div>
              <div class="form-field">
                <label for="admin-device-utilization">利用率（%）</label>
                <input id="admin-device-utilization" name="utilization" type="number" min="0" max="100" value="${escapeHtml(String(d.utilization ?? 0))}">
              </div>
            </div>
            <div class="form-error" id="admin-device-error"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('check')} 保存</button>
          </div>
        </form>
      </div>
    `, { label: device ? '编辑设备' : '新增设备' });
  }

  async function handleAdminDeviceSave(form) {
    const isEdit = Boolean(form.dataset.deviceId);
    const formData = new FormData(form);
    const payload = {
      id: String(formData.get('id') || '').trim(),
      code: String(formData.get('code') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      model: String(formData.get('model') || '').trim(),
      location: String(formData.get('location') || '').trim(),
      status: String(formData.get('status') || 'available'),
      manager: String(formData.get('manager') || '').trim(),
      category: String(formData.get('category') || '').trim(),
      utilization: Number(formData.get('utilization') || 0)
    };
    const error = $('#admin-device-error');
    if (!payload.id || !payload.name) {
      error.textContent = '设备 ID 与名称不能为空。';
      error.classList.add('is-visible');
      return;
    }
    const path = isEdit ? `/api/admin/instruments/${encodeURIComponent(payload.id)}` : '/api/admin/instruments';
    const response = await adminFetch(path, { method: isEdit ? 'PUT' : 'POST', body: payload });
    if (!response) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      error.textContent = result.message || '保存失败，请重试。';
      error.classList.add('is-visible');
      return;
    }
    closeModal();
    await loadAdminData();
    toast(isEdit ? '设备已更新。' : '设备已新增。');
  }

  async function adminDeleteDevice(id) {
    const device = adminDevices.find((d) => d.id === id);
    if (!device) return;
    if (!window.confirm(`确定删除设备「${device.name}」吗？该操作不可撤销。`)) return;
    const response = await adminFetch(`/api/admin/instruments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      toast(result.message || '删除失败。', 'error');
      return;
    }
    await loadAdminData();
    toast('设备已删除。');
  }

  function openAdminBookingModal(id) {
    const booking = adminBookings.find((b) => b.id === id);
    if (!booking) return;
    const statusOptions = [['active', '有效'], ['cancelled', '已取消']];
    openModal(`
      <div class="modal-card">
        ${modalHeader('编辑预约', `${escapeHtml(booking.id)} · ${escapeHtml(booking.applicant)}`)}
        <form id="admin-booking-form" data-booking-id="${escapeHtml(id)}">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field full">
                <label for="admin-booking-instrument">设备</label>
                <select id="admin-booking-instrument" name="instrumentId">
                  ${adminDevices.map((d) => `<option value="${escapeHtml(d.id)}" ${d.id === booking.instrumentId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label for="admin-booking-applicant">申请人</label>
                <input id="admin-booking-applicant" name="applicant" type="text" value="${escapeHtml(booking.applicant)}">
              </div>
              <div class="form-field">
                <label for="admin-booking-date">日期</label>
                <input id="admin-booking-date" name="date" type="date" value="${escapeHtml(booking.date)}">
              </div>
              <div class="form-field">
                <label for="admin-booking-start">开始</label>
                <input id="admin-booking-start" name="start" type="time" value="${escapeHtml(booking.start)}">
              </div>
              <div class="form-field">
                <label for="admin-booking-end">结束</label>
                <input id="admin-booking-end" name="end" type="time" value="${escapeHtml(booking.end)}">
              </div>
              <div class="form-field">
                <label for="admin-booking-status">状态</label>
                <select id="admin-booking-status" name="status">
                  ${statusOptions.map(([v, l]) => `<option value="${v}" ${booking.status === v ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
              </div>
              <div class="form-field full">
                <label for="admin-booking-purpose">使用目的</label>
                <textarea id="admin-booking-purpose" name="purpose">${escapeHtml(booking.purpose || '')}</textarea>
              </div>
            </div>
            <div class="form-error" id="admin-booking-error"></div>
          </div>
          <div class="modal-footer">
            <button class="button" type="button" data-action="close-modal">取消</button>
            <button class="button button-primary" type="submit">${icon('check')} 保存</button>
          </div>
        </form>
      </div>
    `, { label: '编辑预约' });
  }

  async function handleAdminBookingSave(form) {
    const id = form.dataset.bookingId;
    const formData = new FormData(form);
    const payload = {
      instrumentId: String(formData.get('instrumentId') || ''),
      applicant: String(formData.get('applicant') || '').trim(),
      purpose: String(formData.get('purpose') || '').trim(),
      date: String(formData.get('date') || ''),
      start: String(formData.get('start') || ''),
      end: String(formData.get('end') || ''),
      status: String(formData.get('status') || 'active')
    };
    const error = $('#admin-booking-error');
    if (!payload.date || !payload.start || !payload.end) {
      error.textContent = '日期和时段不能为空。';
      error.classList.add('is-visible');
      return;
    }
    const response = await adminFetch(`/api/admin/bookings/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
    if (!response) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      error.textContent = result.message || '保存失败，请重试。';
      error.classList.add('is-visible');
      return;
    }
    closeModal();
    await loadAdminData();
    toast('预约已更新。');
  }

  async function adminCancelBooking(id) {
    const response = await adminFetch(`/api/admin/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    if (!response) return;
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      toast(result.message || '取消失败。', 'error');
      return;
    }
    await loadAdminData();
    toast('预约已取消。');
  }

  function adminLogout() {
    saveAdminSession(null);
    state.currentView = 'chat';
    saveState();
    closeModal();
    renderView();
    toast('已退出管理后台。');
  }

  function openUserMenu() {
    openModal(`
      <div class="modal-card">
        ${modalHeader('账户与演示数据', 'LabPilot 原型数据保存在当前浏览器。')}
        <div class="modal-body">
          <div class="agent-profile" style="margin-bottom:16px">
            <span class="avatar avatar-green" style="width:42px;height:42px">${escapeHtml(state.currentUser.initials)}</span>
            <div class="agent-profile-copy">
              <strong>${escapeHtml(state.currentUser.name)}</strong>
              <p>${escapeHtml(state.currentUser.role)} · 个人演示账号</p>
            </div>
          </div>
          <div class="admin-entry" style="margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-soft)">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
              <div>
                <strong style="display:block">管理后台</strong>
                <p style="margin:2px 0 0;color:var(--muted);font-size:12px">
                  ${isAdminLoggedIn() ? `已登录：${escapeHtml(adminSession.user?.name || 'admin')}` : '管理设备、预约与注册用户，需管理员账号登录'}
                </p>
              </div>
              <button class="button button-sm ${isAdminLoggedIn() ? 'button-soft' : 'button-primary'}" type="button" data-action="open-admin">${isAdminLoggedIn() ? '进入后台' : '登录'}</button>
            </div>
          </div>
          <div class="checkbox-list">
            <label class="checkbox-row">
              <input type="checkbox" checked disabled>
              <span>浏览器本地持久化<small>新预约、扫描、群聊和 Agent 会保存在 localStorage。</small></span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button" type="button" data-action="export-ledger">${icon('file')} 导出数据</button>
          <button class="button button-danger" type="button" data-action="reset-demo">${icon('trash')} 重置演示数据</button>
          <button class="button button-primary" type="button" data-action="close-modal">关闭</button>
        </div>
      </div>
    `, { label: '账户菜单' });
  }

  function toast(message, type = 'success') {
    const element = document.createElement('div');
    element.className = `toast ${type === 'error' ? 'is-error' : ''}`;
    element.innerHTML = `
      <span class="toast-icon">${icon(type === 'error' ? 'alert' : 'check')}</span>
      <span>${escapeHtml(message)}</span>
    `;
    toastRegion.appendChild(element);
    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(5px)';
      element.style.transition = 'opacity 150ms ease, transform 150ms ease';
      setTimeout(() => element.remove(), 180);
    }, 3200);
  }

  function setView(view) {
    if (view === 'admin' && !isAdminLoggedIn()) {
      openAdminLoginModal();
      return;
    }
    state.currentView = view;
    if (view === 'booking') {
      state.selectedDate = state.selectedDate || todayKey();
    }
    if (view === 'admin') {
      loadAdminData();
    }
    saveState();
    closeModal();
    renderView();
  }

  function parseImportedMessages(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const items = Array.isArray(parsed) ? parsed : parsed.messages;
        if (Array.isArray(items)) {
          return items.slice(0, 500).map((item, index) => ({
            id: uid('msg_import'),
            type: 'text',
            senderId: `imported_${index}`,
            senderName: String(item.sender || item.senderName || item.name || '导入成员').slice(0, 40),
            initials: String(item.sender || item.senderName || item.name || '导').slice(0, 1),
            color: ['green', 'amber', 'blue', 'violet', 'coral'][index % 5],
            content: String(item.content || item.text || item.message || '').slice(0, 4000),
            createdAt: item.timestamp && !Number.isNaN(new Date(item.timestamp).getTime())
              ? new Date(item.timestamp).toISOString()
              : new Date().toISOString(),
            imported: true
          })).filter((message) => message.content);
        }
      } catch {
        // Fall through to line parsing.
      }
    }

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    const looksLikeCsv = lines[0]?.toLowerCase().includes('timestamp') && lines[0]?.includes('content');
    const contentLines = looksLikeCsv ? lines.slice(1) : lines;
    const messages = [];

    contentLines.forEach((line, index) => {
      let timestamp = '';
      let sender = '导入记录';
      let content = line;

      if (looksLikeCsv) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          timestamp = parts[0].trim();
          sender = parts[1].trim() || sender;
          content = parts.slice(2).join(',').trim().replace(/^"|"$/g, '');
        }
      } else {
        const match = line.match(/^\s*(?:\[([^\]]+)\]\s*)?([^:：]{1,32})[:：]\s*(.+)$/);
        if (match) {
          timestamp = match[1]?.trim() || '';
          sender = match[2].trim();
          content = match[3].trim();
        } else {
          const timeMatch = line.match(/^\[?(\d{1,2}:\d{2})(?::\d{2})?\]?\s*(.*)$/);
          if (timeMatch) {
            timestamp = timeMatch[1];
            content = timeMatch[2] || line;
          }
        }
      }

      if (!content) return;
      let createdAt = new Date().toISOString();
      if (timestamp) {
        if (/^\d{1,2}:\d{2}/.test(timestamp)) {
          const time = timestamp.slice(0, 5);
          createdAt = new Date(`${todayKey()}T${time}:00`).toISOString();
        } else {
          const date = new Date(timestamp);
          if (!Number.isNaN(date.getTime())) createdAt = date.toISOString();
        }
      }

      messages.push({
        id: uid('msg_import'),
        type: 'text',
        senderId: `imported_${index}`,
        senderName: sender.slice(0, 40),
        initials: sender.slice(0, 1) || '导',
        color: ['green', 'amber', 'blue', 'violet', 'coral'][index % 5],
        content: content.slice(0, 4000),
        createdAt,
        imported: true
      });
    });

    return messages.slice(0, 500);
  }

  async function createBookingFromForm(form) {
    const formData = new FormData(form);
    const instrumentId = String(formData.get('instrumentId') || '');
    const date = String(formData.get('date') || '');
    const start = String(formData.get('start') || '');
    const end = String(formData.get('end') || '');
    const applicant = String(formData.get('applicant') || '').trim();
    const purpose = String(formData.get('purpose') || '').trim();
    const error = $('#booking-error');
    const instrument = getInstrument(instrumentId);

    const fail = (message) => {
      error.textContent = message;
      error.classList.add('is-visible');
    };
    error.classList.remove('is-visible');

    if (!instrument) return fail('请选择有效仪器。');
    if (!date || !start || !end || !applicant || !purpose) return fail('请完整填写预约信息。');
    if (date < todayKey()) return fail('不能为过去的日期创建预约。');
    if (instrument.status === 'maintenance') return fail('该仪器正在维护，暂不可预约。');
    if (parseTimeToMinutes(start) >= parseTimeToMinutes(end)) return fail('结束时间必须晚于开始时间。');
    if (parseTimeToMinutes(start) < 480 || parseTimeToMinutes(end) > 1200) return fail('可预约范围为 08:00–20:00。');

    const overlap = state.bookings.find((booking) =>
      booking.instrumentId === instrumentId
      && booking.date === date
      && !booking.cancelledAt
      && parseTimeToMinutes(start) < parseTimeToMinutes(booking.end)
      && parseTimeToMinutes(end) > parseTimeToMinutes(booking.start)
    );
    if (overlap) return fail(`该时段与 ${overlap.id}（${overlap.start}–${overlap.end}）冲突，请调整时间。`);

    let serverId = '';
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instrumentId, applicant, purpose, date, start, end })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        return fail(payload.message || '预约未能写入后台，请确认预约服务已启动。');
      }
      serverId = payload.booking?.id || '';
    } catch {
      return fail('无法连接预约后台，请确认服务已启动。');
    }

    const sequence = state.bookings.filter((booking) => booking.date === date).length + 1;
    const booking = {
      id: serverId || `BK-${date.replaceAll('-', '').slice(4)}-${String(sequence).padStart(2, '0')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      instrumentId,
      groupId: state.currentGroupId,
      applicant,
      purpose,
      date,
      start,
      end,
      checkInAt: null,
      checkOutAt: null,
      cancelledAt: null,
      scans: [],
      createdAt: new Date().toISOString()
    };
    state.bookings.push(booking);
    state.selectedDate = date;
    state.auditEvents.push({
      id: uid('audit'),
      type: 'booking.created',
      bookingId: booking.id,
      actor: state.currentUser.name,
      at: new Date().toISOString()
    });
    saveState();
    closeModal();
    state.currentView = 'booking';
    renderView();
    toast(`预约已创建：${instrument.name} ${start}–${end}。下一步需扫码上机。`);
  }

  function handleImport(form) {
    const formData = new FormData(form);
    const text = String(formData.get('text') || $('#migration-text')?.value || '');
    const error = $('#import-error');
    const messages = parseImportedMessages(text);
    if (!messages.length) {
      error.textContent = '没有识别到有效消息，请检查格式后重试。';
      error.classList.add('is-visible');
      return;
    }

    const group = getGroup();
    group.messages.push(...messages);
    group.messages.push({
      id: uid('msg'),
      type: 'system',
      content: `已迁移 ${messages.length} 条群聊消息，${getAgent(group.agentId).name} 可以将它们纳入总结。`,
      createdAt: new Date().toISOString()
    });
    group.messages = group.messages.slice(-500);
    state.auditEvents.push({
      id: uid('audit'),
      type: 'chat.imported',
      groupId: group.id,
      count: messages.length,
      actor: state.currentUser.name,
      at: new Date().toISOString()
    });
    saveState();
    closeModal();
    state.currentView = 'chat';
    renderView();
    toast(`已导入 ${messages.length} 条消息，当前群聊上下文已更新。`);
  }

  function handleAgentCreate(form) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const role = String(formData.get('role') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const error = $('#agent-error');
    if (!name || !role) {
      error.textContent = '请填写 Agent 名称和岗位角色。';
      error.classList.add('is-visible');
      return;
    }
    if (state.agents.some((agent) => agent.name === name)) {
      error.textContent = '已经有同名 Agent，请换一个名称。';
      error.classList.add('is-visible');
      return;
    }

    const agent = {
      id: uid('agent'),
      name,
      role,
      description: description || `${role}，用于整理群聊工作内容和支持实验室协作。`,
      status: 'online',
      createdAt: new Date().toISOString(),
      skills: ['群聊总结', '实验待办提取', formData.get('bookingDraft') ? '预约草稿' : '信息整理'],
      permissions: {
        readChat: Boolean(formData.get('readChat')),
        summarize: Boolean(formData.get('summarize')),
        bookingDraft: Boolean(formData.get('bookingDraft')),
        exportWorkspace: false
      }
    };
    state.agents.push(agent);
    state.selectedAgentId = agent.id;
    if (formData.get('bindGroup')) {
      getGroup().agentId = agent.id;
      getGroup().messages.push({
        id: uid('msg'),
        type: 'system',
        content: `${agent.name} 已加入群聊，具有 ${agent.permissions.readChat ? '读取群聊' : '受限访问'} 权限。`,
        createdAt: new Date().toISOString()
      });
    }
    saveState();
    closeModal();
    state.currentView = 'agents';
    renderView();
    toast(`${name} 已创建${formData.get('bindGroup') ? '并加入当前群聊' : ''}。`);
  }

  function handleGroupCreate(form) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const error = $('#group-error');
    if (!name) {
      error.textContent = '请填写群聊名称。';
      error.classList.add('is-visible');
      return;
    }
    const botRole = formData.get('botRole') === 'general' ? 'general' : 'device';
    const agent = botRole === 'device' ? getAgent('agent_platform') : getAgent('agent_yanzhu');
    const group = {
      id: uid('group'),
      name,
      description: description || '新的实验室协作空间',
      initials: name.slice(0, 1),
      color: ['green', 'amber', 'blue', 'violet', 'coral'][state.groups.length % 5],
      memberCount: 1,
      unread: 0,
      agentId: agent.id,
      botRole,
      members: [state.currentUser],
      messages: [
        {
          id: uid('msg'),
          type: 'system',
          content: `${agent.name} 已加入群聊。可以导入聊天记录或直接开始讨论。`,
          createdAt: new Date().toISOString()
        }
      ]
    };
    state.groups.push(group);
    state.currentGroupId = group.id;
    state.currentView = 'chat';
    saveState();
    closeModal();
    renderView();
    toast(`群聊「${name}」已创建。`);
  }

  async function handleScanSubmit(form) {
    const bookingId = form.dataset.bookingId;
    const scanType = form.dataset.scanType;
    const booking = getBooking(bookingId);
    const error = $('#scan-error');
    const instrument = booking ? getInstrument(booking.instrumentId) : null;
    const scanCode = String(new FormData(form).get('scanCode') || '').trim();
    if (!booking || !instrument) return;

    const fail = (message) => {
      error.textContent = message;
      error.classList.add('is-visible');
      state.auditEvents.push({
        id: uid('audit'),
        type: 'scan.rejected',
        bookingId,
        scanType,
        reason: message,
        actor: state.currentUser.name,
        at: new Date().toISOString()
      });
      saveState();
    };
    error.classList.remove('is-visible');

    const expectedCode = `${instrument.code}-${booking.id}`;
    if (scanCode !== expectedCode) return fail('扫码结果与当前仪器或预约不匹配，请重新扫描。');
    if (booking.cancelledAt) return fail('该预约已取消，不能产生扫描台账。');

    const nowIso = new Date().toISOString();
    if (scanType === 'check-in') {
      if (booking.checkInAt) return fail('该预约已经完成上机扫描，不能重复上机。');
      try {
        const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/scan`, {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ action: 'check-in', at: nowIso })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) return fail(payload.message || '回写预约后台失败，请稍后再试。');
      } catch {
        return fail('无法连接预约后台，请确认服务已启动。');
      }
      booking.checkInAt = nowIso;
      booking.scans = Array.isArray(booking.scans) ? booking.scans : [];
      booking.scans.push({ type: 'check-in', at: nowIso, operator: state.currentUser.name, method: '演示扫码' });
      state.auditEvents.push({
        id: uid('audit'),
        type: 'scan.check-in',
        bookingId,
        operator: state.currentUser.name,
        at: nowIso
      });
      saveState();
      closeModal();
      renderView();
      toast(`上机扫描成功。${booking.id} 已进入“使用中”，仍需扫码下机才能闭环。`);
      return;
    }

    if (scanType === 'check-out') {
      if (!booking.checkInAt) return fail('未找到有效上机扫描，不能直接下机。请先完成上机。');
      if (booking.checkOutAt) return fail('该预约已经完成下机扫描，不能重复下机。');
      if (new Date(nowIso).getTime() <= new Date(booking.checkInAt).getTime()) {
        return fail('下机时间必须晚于上机时间。');
      }
      try {
        const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/scan`, {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ action: 'check-out', at: nowIso })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) return fail(payload.message || '回写预约后台失败，请稍后再试。');
      } catch {
        return fail('无法连接预约后台，请确认服务已启动。');
      }
      booking.checkOutAt = nowIso;
      booking.scans = Array.isArray(booking.scans) ? booking.scans : [];
      booking.scans.push({ type: 'check-out', at: nowIso, operator: state.currentUser.name, method: '演示扫码' });
      state.auditEvents.push({
        id: uid('audit'),
        type: 'scan.check-out',
        bookingId,
        operator: state.currentUser.name,
        at: nowIso
      });
      const ledger = deriveLedger(booking);
      saveState();
      closeModal();
      renderView();
      toast(`下机扫描成功。台账已闭环，实际使用 ${durationLabel(ledger.actualMinutes)}，偏差 ${compactVariance(ledger.variance)}。`);
    }
  }

  async function cancelBooking(bookingId) {
    const booking = getBooking(bookingId);
    if (!booking) return;
    if (booking.checkInAt) {
      toast('已上机的预约不能直接取消，请先完成下机或走管理员异常处理。', 'error');
      return;
    }
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST', headers: apiHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        toast(payload.message || '取消预约失败，请稍后再试。', 'error');
        return;
      }
    } catch {
      toast('无法连接预约后台，请确认服务已启动。', 'error');
      return;
    }
    booking.cancelledAt = new Date().toISOString();
    state.auditEvents.push({
      id: uid('audit'),
      type: 'booking.cancelled',
      bookingId: booking.id,
      actor: state.currentUser.name,
      at: booking.cancelledAt
    });
    saveState();
    closeModal();
    renderView();
    toast(`预约 ${booking.id} 已取消，未形成使用台账。`);
  }

  function saveSummaryToWorkspace() {
    const group = getGroup();
    const agent = getAgent(group.agentId);
    const summary = state.summaries[`${group.id}:${agent.id}`];
    if (!summary) {
      toast('请先生成群聊摘要。', 'error');
      return;
    }
    if (summary.savedToWorkspace) {
      toast('这份摘要已经保存到 Workspace。');
      return;
    }
    summary.savedToWorkspace = true;
    state.workspace.artifacts.push({
      id: uid('artifact'),
      name: `${group.name} · 群聊工作摘要`,
      type: 'Agent 摘要',
      groupId: group.id,
      agentId: agent.id,
      summaryId: summary.id,
      updatedAt: new Date().toISOString()
    });
    saveState();
    renderView();
    toast('摘要已保存到 Workspace，后续可以继续引用。');
  }

  function exportLedgerCsv() {
    const rows = getFilteredLedgerRows().length ? getFilteredLedgerRows() : allLedgerRows();
    const header = ['预约号', '仪器', '仪器编号', '日期', '预约开始', '预约结束', '上机扫描', '下机扫描', '预约分钟', '实际分钟', '偏差分钟', '状态'];
    const lines = rows.map((row) => {
      const instrument = getInstrument(row.instrumentId);
      return [
        row.id,
        instrument?.name || '',
        instrument?.code || '',
        row.date,
        row.start,
        row.end,
        row.checkInAt || '',
        row.checkOutAt || '',
        row.reservedMinutes,
        row.actualMinutes ?? '',
        row.variance ?? '',
        row.statusLabel
      ];
    });
    const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [header, ...lines].map((line) => line.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `LabPilot_仪器台账_${todayKey()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast(`已导出 ${rows.length} 条仪器台账。`);
  }

  function resetDemo() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage restrictions.
    }
    state = buildSeedState();
    closeModal();
    renderView();
    toast('演示数据已恢复。');
  }

  function sendChatMessage() {
    const input = $('#chat-input');
    const text = String(input?.value || '').trim();
    if (!text) {
      toast('先输入一条消息。', 'error');
      return;
    }

    const group = getGroup();
    const agent = getAgent(group.agentId);
    if (text === '/预约') {
      openBookingModal();
      return;
    }
    if (text === '/总结') {
      generateSummary();
      return;
    }

    group.messages.push({
      id: uid('msg'),
      type: 'text',
      senderId: state.currentUser.id,
      senderName: state.currentUser.name,
      initials: state.currentUser.initials,
      color: 'green',
      content: text,
      createdAt: new Date().toISOString()
    });
    group.messages = group.messages.slice(-500);
    saveState();
    renderView();
    if (text.includes(`@${agent.name}`) || text.includes('@研助')) {
      setTimeout(() => generateSummary(), 180);
    }
  }

  function setLedgerFilterState() {
    const status = $('#ledger-status-filter')?.value;
    const date = $('#ledger-date-filter')?.value;
    if (status) state.ledgerStatus = status;
    if (date) state.ledgerDate = date;
    saveState();
    renderView();
  }

  function updateLedgerSearch(value) {
    state.ledgerSearch = value;
    saveState();
    const body = $('#ledger-table-body');
    if (body) body.innerHTML = renderLedgerRows();
    const count = $('.filter-bar .muted');
    if (count) {
      const stats = $('.filter-bar .muted');
      stats.textContent = `当前显示 ${getFilteredLedgerRows().length} 条`;
    }
  }

  document.addEventListener('click', (event) => {
    const viewTarget = event.target.closest('[data-view]');
    if (viewTarget) {
      event.preventDefault();
      setView(viewTarget.dataset.view);
      return;
    }

    const collabTarget = event.target.closest('[data-collab-group]');
    if (collabTarget) {
      const group = getGroup(collabTarget.dataset.collabGroup);
      state.currentGroupId = group.id;
      group.unread = 0;
      saveState();
      renderView();
      return;
    }

    if (event.target.closest('#collab-new-group')) {
      openNewGroupModal();
      return;
    }

    const groupTarget = event.target.closest('[data-group-id]');
    if (groupTarget) {
      const group = getGroup(groupTarget.dataset.groupId);
      state.currentGroupId = group.id;
      group.unread = 0;
      state.currentView = 'chat';
      saveState();
      renderView();
      return;
    }

    const agentTarget = event.target.closest('[data-agent-id][data-action="select-agent"], .agent-mini[data-agent-id]');
    if (agentTarget) {
      state.selectedAgentId = agentTarget.dataset.agentId;
      state.currentView = 'agents';
      saveState();
      renderView();
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    if (action === 'close-modal') {
      closeModal();
      return;
    }
    if (action === 'summarize-group') {
      closeModal();
      generateSummary({ agentId: getGroup().agentId });
      return;
    }
    if (action === 'summarize-selected-agent') {
      closeModal();
      generateSummary({ agentId: state.selectedAgentId });
      return;
    }
    if (action === 'show-summary-modal') {
      openSummaryModal();
      return;
    }
    if (action === 'open-import') {
      openImportModal();
      return;
    }
    if (action === 'open-agent-create') {
      openAgentCreateModal();
      return;
    }
    if (action === 'open-new-booking' || action === 'draft-booking' || action === 'open-booking') {
      if (!canBook()) {
        toast('当前群是普通群管理，不能预约设备。请在「设备预约管理员」的群里发起预约。', 'error');
        return;
      }
      openBookingModal(actionTarget.dataset.instrumentId || '');
      return;
    }
    if (action === 'booking-detail') {
      openBookingDetail(actionTarget.dataset.bookingId);
      return;
    }
    if (action === 'scan-in') {
      openScanModal(actionTarget.dataset.bookingId, 'check-in');
      return;
    }
    if (action === 'scan-out') {
      openScanModal(actionTarget.dataset.bookingId, 'check-out');
      return;
    }
    if (action === 'cancel-booking') {
      cancelBooking(actionTarget.dataset.bookingId);
      return;
    }
    if (action === 'focus-message') {
      closeModal();
      scrollToMessage(actionTarget.dataset.messageId);
      return;
    }
    if (action === 'save-summary') {
      saveSummaryToWorkspace();
      return;
    }
    if (action === 'mention-agent') {
      const input = $('#chat-input');
      if (input) {
        input.value = `@${getAgent(getGroup().agentId).name} `;
        input.focus();
      }
      return;
    }
    if (action === 'send-message') {
      sendChatMessage();
      return;
    }
    if (action === 'fill-demo-scan') {
      const input = $('#scan-code');
      if (input) input.value = actionTarget.dataset.code || '';
      return;
    }
    if (action === 'select-agent') {
      state.selectedAgentId = actionTarget.dataset.agentId;
      state.currentView = 'agents';
      saveState();
      renderView();
      return;
    }
    if (action === 'bind-agent') {
      const agent = getAgent(actionTarget.dataset.agentId);
      getGroup().agentId = agent.id;
      getGroup().messages.push({
        id: uid('msg'),
        type: 'system',
        content: `${agent.name} 已设为当前群聊的 Team Agent。`,
        createdAt: new Date().toISOString()
      });
      saveState();
      renderView();
      toast(`${agent.name} 已绑定到「${getGroup().name}」。`);
      return;
    }
    if (action === 'agent-permissions') {
      openAgentPermissionsModal();
      return;
    }
    if (action === 'export-ledger') {
      exportLedgerCsv();
      return;
    }
    if (action === 'reset-ledger-filters') {
      state.ledgerStatus = 'all';
      state.ledgerDate = 'all';
      state.ledgerSearch = '';
      saveState();
      renderView();
      return;
    }
    if (action === 'today-booking') {
      state.selectedDate = todayKey();
      saveState();
      renderView();
      return;
    }
    if (action === 'booking-help') {
      openAgentPermissionsModal();
      return;
    }
    if (action === 'reset-demo') {
      resetDemo();
      return;
    }
    if (action === 'attachment-hint') {
      toast('生产版会在这里上传实验图片、表格和 PDF；演示版先聚焦群聊、预约与台账闭环。');
      return;
    }
    if (action === 'emoji-hint') {
      toast('表情面板将在移动端输入优化阶段接入。');
      return;
    }
    if (action === 'scan-hint') {
      state.currentView = 'ledger';
      saveState();
      renderView();
      toast('选择一条已预约记录，即可执行扫码上机或扫码下机。');
      return;
    }
    if (action === 'project-settings') {
      toast('当前项目：先进材料实验室 / 微流控芯片组。权限与预算由生产后台配置。');
    }
    if (action === 'open-admin') {
      setView('admin');
      return;
    }
    if (action === 'admin-logout') {
      adminLogout();
      return;
    }
    if (action === 'admin-tab') {
      adminTab = actionTarget.dataset.tab || 'devices';
      renderView();
      return;
    }
    if (action === 'admin-device-new') {
      openAdminDeviceModal();
      return;
    }
    if (action === 'admin-device-edit') {
      openAdminDeviceModal(actionTarget.dataset.deviceId);
      return;
    }
    if (action === 'admin-device-delete') {
      adminDeleteDevice(actionTarget.dataset.deviceId);
      return;
    }
    if (action === 'admin-device-qr') {
      downloadInstrumentQr(actionTarget.dataset.deviceId);
      return;
    }
    if (action === 'admin-booking-edit') {
      openAdminBookingModal(actionTarget.dataset.bookingId);
      return;
    }
    if (action === 'admin-booking-cancel') {
      adminCancelBooking(actionTarget.dataset.bookingId);
      return;
    }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.id === 'booking-form') createBookingFromForm(form);
    else if (form.id === 'import-form') handleImport(form);
    else if (form.id === 'agent-form') handleAgentCreate(form);
    else if (form.id === 'group-form') handleGroupCreate(form);
    else if (form.id === 'scan-form') handleScanSubmit(form);
    else if (form.id === 'admin-login-form') handleAdminLogin(form);
    else if (form.id === 'admin-device-form') handleAdminDeviceSave(form);
    else if (form.id === 'admin-booking-form') handleAdminBookingSave(form);
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.id === 'booking-date') {
      state.selectedDate = target.value || todayKey();
      saveState();
      renderView();
    } else if (target.id === 'ledger-status-filter' || target.id === 'ledger-date-filter') {
      setLedgerFilterState();
    } else if (target.id === 'migration-file' && target.files?.[0]) {
      const file = target.files[0];
      file.text().then((text) => {
        const textarea = $('#migration-text');
        if (textarea) {
          textarea.value = text;
          textarea.focus();
        }
      }).catch(() => toast('文件读取失败，请改为粘贴文本。', 'error'));
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'ledger-search') {
      updateLedgerSearch(event.target.value);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (modalRoot.innerHTML) closeModal();
      else if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
      }
    }

    if (event.key === 'Enter' && event.target.id === 'chat-input' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }

    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('agent-card')) {
      event.preventDefault();
      event.target.click();
    }
  });

  $('#new-agent-mini-button').addEventListener('click', openAgentCreateModal);
  $('#new-group-button').addEventListener('click', openNewGroupModal);
  $('#user-menu-button').addEventListener('click', openUserMenu);
  $('#mobile-menu-button').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
  $('#workspace-switcher').addEventListener('click', () => {
    toast('当前演示空间：先进材料实验室 · 公共仪器平台。');
  });
  $('#sidebar-collapse').addEventListener('click', () => {
    if (window.innerWidth <= 900) document.body.classList.remove('sidebar-open');
  });
  backdrop.addEventListener('click', closeModal);

  // 启动时把后台（sqlite）里的预约合并进本地状态，保证扫码 agent 看到的预约和这里一致。
  async function syncBookingsFromServer() {
    try {
      const response = await fetch('/api/instruments', { headers: apiHeaders() });
      if (!response.ok) return;
      const { instruments = [] } = await response.json();
      let changed = false;
      // 仪器列表以后台为准：用后端返回的完整字段更新本地（id/code/name/model/location/status/manager/category/utilization）。
      if (instruments.length) {
        const byId = new Map(instruments.map((item) => [item.id, item]));
        const merged = state.instruments.map((item) => {
          const server = byId.get(item.id);
          return server ? { ...item, ...server } : item;
        });
        if (JSON.stringify(merged) !== JSON.stringify(state.instruments)) {
          state.instruments = merged;
          changed = true;
        }
      }
      for (const instrument of instruments) {
        const res = await fetch(`/api/bookings/instrument/${encodeURIComponent(instrument.id)}`, { headers: apiHeaders() });
        if (!res.ok) continue;
        const { bookings = [] } = await res.json();
        for (const booking of bookings) {
          const existing = state.bookings.find((item) => item.id === booking.id);
          if (existing) {
            // 把扫码 agent 回写的上机 / 下机时间同步到本地，台账状态随之更新。
            if (booking.checkInAt && existing.checkInAt !== booking.checkInAt) {
              existing.checkInAt = booking.checkInAt;
              changed = true;
            }
            if (booking.checkOutAt && existing.checkOutAt !== booking.checkOutAt) {
              existing.checkOutAt = booking.checkOutAt;
              changed = true;
            }
            continue;
          }
          state.bookings.push({
            id: booking.id,
            instrumentId: booking.instrumentId,
            groupId: state.currentGroupId,
            applicant: booking.applicant,
            purpose: booking.purpose || '',
            date: booking.date,
            start: booking.start,
            end: booking.end,
            checkInAt: booking.checkInAt || null,
            checkOutAt: booking.checkOutAt || null,
            cancelledAt: null,
            scans: [],
            createdAt: booking.createdAt || new Date().toISOString()
          });
          changed = true;
        }
      }
      if (changed) {
        saveState();
        renderView();
      }
    } catch {
      // 预约后台不可用时，前端仍按本地演示数据工作。
    }
  }

  renderView();
  // 刷新后若停留在管理后台，补拉一次后台数据（登录态保存在 localStorage）。
  if (state.currentView === 'admin' && isAdminLoggedIn()) loadAdminData();
  syncBookingsFromServer();
  // 定期拉取扫码回写的上机 / 下机状态，让打开的页面能看到反馈。
  setInterval(syncBookingsFromServer, 15000);
})();
