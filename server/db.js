import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

const NO_PASSWORD = 'none';

function verifyPassword(password, stored) {
  if (!stored || stored === NO_PASSWORD || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// isAdmin：后台管理权限标志。admin 为独立的管理后台账号；业务角色(role)仅作展示标签。
const SEED_USERS = [
  { id: 'user_linyu', name: '林雨', email: 'linyu@lab.local', password: 'linyu123', role: '课题组 · 管理员', isAdmin: 0 },
  { id: 'user_zhouqun', name: '周群', email: 'zhouqun@lab.local', password: 'zhouqun123', role: '课题组成员', isAdmin: 0 },
  { id: 'user_wangchen', name: '王晨', email: 'wangchen@lab.local', password: 'wangchen123', role: '课题组成员', isAdmin: 0 },
  { id: 'user_chen', name: '陈老师', email: 'chen@lab.local', password: 'chen123', role: '平台管理员', isAdmin: 0 },
  { id: 'user_admin', name: 'admin', email: 'admin@lab.local', password: 'admin123', role: '平台管理员', isAdmin: 1 },
];

const SEED_INSTRUMENTS = [
  { id: 'inst_fc', code: 'FC-01', name: '流式细胞仪', model: 'BD FACSCelesta', location: 'B2-107', status: 'available', manager: '陈老师', category: '细胞分析', utilization: 78 },
  { id: 'inst_clsm', code: 'CLSM-02', name: '激光共聚焦显微镜', model: 'Zeiss LSM 900', location: 'B2-109', status: 'in-use', manager: '周群', category: '显微成像', utilization: 86 },
  { id: 'inst_pcr', code: 'PCR-03', name: '实时荧光定量 PCR', model: 'QuantStudio 5', location: 'A1-203', status: 'available', manager: '王晨', category: '分子检测', utilization: 64 },
  { id: 'inst_centrifuge', code: 'CENT-04', name: '高速冷冻离心机', model: 'Eppendorf 5910Ri', location: 'B1-102', status: 'maintenance', manager: '陈老师', category: '样品处理', utilization: 52 },
];

function dateKey(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function openDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'labpilot.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT
    );
    CREATE TABLE IF NOT EXISTS instruments (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      model TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      manager TEXT,
      category TEXT,
      utilization INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scan_visits (
      id TEXT PRIMARY KEY,
      instrument_id TEXT NOT NULL,
      visited_at TEXT NOT NULL,
      redirected INTEGER NOT NULL DEFAULT 0,
      public_url TEXT
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      instrument_id TEXT NOT NULL,
      applicant TEXT NOT NULL,
      purpose TEXT,
      date TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      check_in_at TEXT,
      check_out_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, 'users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'instruments', 'public_url', 'TEXT');
  ensureColumn(db, 'instruments', 'presence_at', 'TEXT');
  ensureColumn(db, 'bookings', 'check_in_at', 'TEXT');
  ensureColumn(db, 'bookings', 'check_out_at', 'TEXT');
  ensureColumn(db, 'bookings', 'cancelled_at', 'TEXT');
  ensureColumn(db, 'bookings', 'scan_email', 'TEXT');
  ensureColumn(db, 'bookings', 'folder_path', 'TEXT');
  ensureColumn(db, 'bookings', 'send_status', 'TEXT');
  ensureColumn(db, 'bookings', 'send_error', 'TEXT');
  seed(db);
  return db;
}

function ensureColumn(db, table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function seed(db) {
  seedUsers(db);
  seedInstruments(db);
  seedBookings(db);
}

function seedUsers(db) {
  const find = db.prepare('SELECT id FROM users WHERE name = ?');
  const insert = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const user of SEED_USERS) {
    if (!find.get(user.name)) {
      insert.run(user.id, user.name, user.email, hashPassword(user.password), user.role, user.isAdmin ? 1 : 0);
    }
  }
}

function seedInstruments(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM instruments').get().n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO instruments (id, code, name, model, location, status, manager, category, utilization)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of SEED_INSTRUMENTS) {
    insert.run(item.id, item.code, item.name, item.model, item.location, item.status, item.manager, item.category, item.utilization);
  }
}

function seedBookings(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n;
  if (count > 0) return;

  const insertBooking = db.prepare(
    `INSERT INTO bookings
      (id, instrument_id, applicant, purpose, date, start, end, status, check_in_at, check_out_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  const today = dateKey(0);
  const tomorrow = dateKey(1);
  const yesterday = dateKey(-1);
  const isoOn = (dayOffset, time) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  // [id, instrumentId, applicant, purpose, date, start, end, status, checkInAt, checkOutAt]
  const samples = [
    ['BK-SEED-01', 'inst_fc', '林雨', 'PDMS 芯片细胞上样验证', today, '09:00', '12:00', 'active', isoOn(0, '09:06'), isoOn(0, '11:42')],
    ['BK-SEED-02', 'inst_clsm', '周群', '共聚焦背景偏高问题重扫', today, '10:30', '15:00', 'active', isoOn(0, '10:36'), null],
    ['BK-SEED-03', 'inst_pcr', '王晨', '引物扩增效率复测', today, '14:00', '17:00', 'active', null, null],
    ['BK-SEED-04', 'inst_fc', '王晨', '配比验证后的细胞表型检测', tomorrow, '10:30', '12:00', 'active', null, null],
    ['BK-SEED-05', 'inst_pcr', '陈老师', '公共平台质控样本检测', yesterday, '15:00', '16:00', 'active', isoOn(-1, '15:08'), isoOn(-1, '16:12')],
  ];
  for (const row of samples) insertBooking.run(...row, now);
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, isAdmin: Boolean(row.is_admin) };
}

function publicInstrument(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || '',
    name: row.name,
    model: row.model || '',
    location: row.location || '',
    status: row.status || 'available',
    manager: row.manager || '',
    category: row.category || '',
    utilization: row.utilization || 0,
    publicUrl: row.public_url || '',
    presenceAt: row.presence_at || null,
    lastScanAt: row.last_scan_at || null,
  };
}

function normalizePublicUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(text) || text.length > 300) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function scanRedirectUrl(publicUrl, instrumentId) {
  const url = new URL(publicUrl);
  url.searchParams.set('instrument', instrumentId);
  return url.toString();
}

function publicBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    applicant: row.applicant,
    purpose: row.purpose,
    date: row.date,
    start: row.start,
    end: row.end,
    status: row.status,
    checkInAt: row.check_in_at || null,
    checkOutAt: row.check_out_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    email: row.scan_email || '',
    folderPath: row.folder_path || '',
    sendStatus: row.send_status || '',
    sendError: row.send_error || '',
  };
}

export function createApi(db) {
  const findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, 0)',
  );
  const insertBooking = db.prepare(
    `INSERT INTO bookings
      (id, instrument_id, applicant, purpose, date, start, end, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  );
  const selectActive = db.prepare(
    `SELECT * FROM bookings
      WHERE instrument_id = ? AND applicant = ? AND date = ? AND status = 'active'
        AND check_in_at IS NULL AND check_out_at IS NULL
        AND start <= ? AND end >= ?
      ORDER BY start LIMIT 1`,
  );
  const selectOpenOnInstrument = db.prepare(
    `SELECT * FROM bookings
      WHERE instrument_id = ? AND status = 'active'
        AND check_in_at IS NOT NULL AND check_out_at IS NULL
      ORDER BY check_in_at DESC LIMIT 1`,
  );
  const selectPendingSend = db.prepare(
    `SELECT * FROM bookings
      WHERE instrument_id = ? AND send_status = 'pending'
      ORDER BY check_out_at DESC LIMIT 1`,
  );
  const selectByInstrument = db.prepare(
    `SELECT * FROM bookings WHERE instrument_id = ? AND status = 'active' ORDER BY date, start`,
  );
  const selectById = db.prepare('SELECT * FROM bookings WHERE id = ?');
  const selectAllBookings = db.prepare('SELECT * FROM bookings ORDER BY date DESC, start');
  const markCheckIn = db.prepare(
    `UPDATE bookings SET check_in_at = ? WHERE id = ? AND check_in_at IS NULL`,
  );
  const markCheckOut = db.prepare(
    `UPDATE bookings SET check_out_at = ? WHERE id = ? AND check_in_at IS NOT NULL AND check_out_at IS NULL`,
  );
  const markCancelled = db.prepare(
    `UPDATE bookings SET cancelled_at = ?, status = 'cancelled' WHERE id = ? AND check_in_at IS NULL`,
  );

  // 仪器表查询
  const instrumentSelect = `
    SELECT i.*,
      (SELECT MAX(visited_at) FROM scan_visits v WHERE v.instrument_id = i.id) AS last_scan_at
    FROM instruments i`;
  const selectInstruments = db.prepare(`${instrumentSelect} ORDER BY i.id`);
  const selectInstrumentById = db.prepare(`${instrumentSelect} WHERE i.id = ?`);
  const markPresence = db.prepare('UPDATE instruments SET public_url = ?, presence_at = ? WHERE id = ?');
  const insertScanVisit = db.prepare(
    'INSERT INTO scan_visits (id, instrument_id, visited_at, redirected, public_url) VALUES (?, ?, ?, ?, ?)',
  );
  const insertInstrument = db.prepare(
    `INSERT INTO instruments (id, code, name, model, location, status, manager, category, utilization)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateInstrument = db.prepare(
    `UPDATE instruments SET code = ?, name = ?, model = ?, location = ?, status = ?, manager = ?, category = ?, utilization = ? WHERE id = ?`,
  );
  const deleteInstrument = db.prepare('DELETE FROM instruments WHERE id = ?');
  const countBookingsForInstrument = db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE instrument_id = ?');

  // 用户列表
  const selectAllUsers = db.prepare('SELECT * FROM users ORDER BY name');

  // 预约改单（管理后台）
  const updateBooking = db.prepare(
    `UPDATE bookings SET instrument_id = ?, applicant = ?, purpose = ?, date = ?, start = ?, end = ?, status = ? WHERE id = ?`,
  );

  const instruments = () => selectInstruments.all().map(publicInstrument);

  return {
    instruments: instruments(),

    refreshInstruments() {
      // 保持返回引用一致（前端可能反复调用 instruments 属性）。这里返回一份新数组。
      return instruments();
    },

    authenticate(name, password) {
      const row = findUserByName.get(String(name || '').trim());
      if (!row) return { ok: false, reason: 'not_registered' };
      const given = String(password || '');
      if (row.password_hash === NO_PASSWORD) {
        if (given) return { ok: false, reason: 'no_password' };
        return { ok: true, user: publicUser(row) };
      }
      if (!given || !verifyPassword(given, row.password_hash)) {
        return { ok: false, reason: 'bad_password' };
      }
      return { ok: true, user: publicUser(row) };
    },

    userById(id) {
      return publicUser(findUserById.get(id));
    },

    registerUser({ name, password, email }) {
      const cleanName = String(name || '').trim();
      const cleanEmail = String(email || '').trim();
      const cleanPassword = String(password || '');
      if (!cleanName || cleanName.length > 40) return { ok: false, reason: 'bad_name' };
      if (cleanPassword && (cleanPassword.length < 6 || cleanPassword.length > 72)) {
        return { ok: false, reason: 'bad_password' };
      }
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, reason: 'bad_email' };
      if (findUserByName.get(cleanName)) return { ok: false, reason: 'name_taken' };
      const id = `user_${crypto.randomBytes(6).toString('hex')}`;
      const storedPassword = cleanPassword ? hashPassword(cleanPassword) : NO_PASSWORD;
      insertUser.run(id, cleanName, cleanEmail, storedPassword, '实验室成员');
      return { ok: true, user: publicUser(findUserById.get(id)) };
    },

    // 管理后台登录：必须是 is_admin 用户。
    adminLogin(name, password) {
      const result = this.authenticate(name, password);
      if (!result.ok) return result;
      if (!result.user.isAdmin) return { ok: false, reason: 'not_admin' };
      return { ok: true, user: result.user };
    },

    listUsers() {
      return selectAllUsers.all().map(publicUser);
    },

    listInstruments() {
      return instruments();
    },

    instrumentById(id) {
      return publicInstrument(selectInstrumentById.get(id));
    },

    // 扫码 agent 上报当前公网地址。返回更新后的仪器。
    recordPresence(id, publicUrl) {
      const existing = selectInstrumentById.get(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      const url = normalizePublicUrl(publicUrl);
      if (!url) return { ok: false, reason: 'bad_url' };
      const at = new Date().toISOString();
      markPresence.run(url, at, id);
      return { ok: true, instrument: publicInstrument(selectInstrumentById.get(id)) };
    },

    // 手机打开二维码：记一条扫码访问，有登记地址则给出跳转目标。
    openScan(id) {
      const existing = selectInstrumentById.get(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      const instrument = publicInstrument(existing);
      const redirectUrl = instrument.publicUrl ? scanRedirectUrl(instrument.publicUrl, instrument.id) : '';
      insertScanVisit.run(
        `SV-${crypto.randomBytes(6).toString('hex')}`,
        instrument.id,
        new Date().toISOString(),
        redirectUrl ? 1 : 0,
        instrument.publicUrl || null,
      );
      return { ok: true, instrument: publicInstrument(selectInstrumentById.get(id)), redirectUrl };
    },

    createInstrument({ id, code, name, model, location, status, manager, category, utilization }) {
      const normalizedId = String(id || '').trim();
      if (!normalizedId || !String(name || '').trim()) return { ok: false, reason: 'missing_fields' };
      if (selectInstrumentById.get(normalizedId)) return { ok: false, reason: 'duplicate_id' };
      insertInstrument.run(
        normalizedId,
        String(code || '').trim(),
        String(name).trim(),
        String(model || '').trim(),
        String(location || '').trim(),
        String(status || 'available').trim() || 'available',
        String(manager || '').trim(),
        String(category || '').trim(),
        Number(utilization || 0),
      );
      return { ok: true, instrument: publicInstrument(selectInstrumentById.get(normalizedId)) };
    },

    updateInstrument(id, patch = {}) {
      const existing = selectInstrumentById.get(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      const next = {
        code: patch.code ?? existing.code,
        name: patch.name ?? existing.name,
        model: patch.model ?? existing.model,
        location: patch.location ?? existing.location,
        status: patch.status ?? existing.status,
        manager: patch.manager ?? existing.manager,
        category: patch.category ?? existing.category,
        utilization: patch.utilization ?? existing.utilization,
      };
      if (!String(next.name || '').trim()) return { ok: false, reason: 'missing_name' };
      updateInstrument.run(
        String(next.code || '').trim(),
        String(next.name).trim(),
        String(next.model || '').trim(),
        String(next.location || '').trim(),
        String(next.status || 'available').trim() || 'available',
        String(next.manager || '').trim(),
        String(next.category || '').trim(),
        Number(next.utilization || 0),
        id,
      );
      return { ok: true, instrument: publicInstrument(selectInstrumentById.get(id)) };
    },

    deleteInstrument(id) {
      const existing = selectInstrumentById.get(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      const { n } = countBookingsForInstrument.get(id);
      if (n > 0) return { ok: false, reason: 'has_bookings' };
      deleteInstrument.run(id);
      return { ok: true };
    },

    activeBooking({ instrumentId, applicant, date, time }) {
      const row = selectActive.get(instrumentId, applicant, date, time, time);
      return publicBooking(row);
    },

    openCheckIn(instrumentId) {
      return publicBooking(selectOpenOnInstrument.get(instrumentId));
    },

    desk(instrumentId) {
      if (!selectInstrumentById.get(instrumentId)) return { ok: false, reason: 'not_found' };
      const open = selectOpenOnInstrument.get(instrumentId);
      if (open) return { ok: true, phase: 'checked-in', booking: publicBooking(open) };
      const pending = selectPendingSend.get(instrumentId);
      if (pending) return { ok: true, phase: 'need-send', booking: publicBooking(pending) };
      return { ok: true, phase: 'idle', booking: null };
    },

    setScanMail(id, email) {
      const row = selectById.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      const status = String(email || '').trim() ? 'pending' : 'skipped';
      db.prepare('UPDATE bookings SET scan_email = ?, send_status = ?, send_error = NULL WHERE id = ?')
        .run(String(email || '').trim(), status, id);
      return { ok: true, booking: publicBooking(selectById.get(id)) };
    },

    reportDesk(instrumentId, { bookingId, folderPath, sendStatus, sendError }) {
      const row = selectById.get(String(bookingId || ''));
      if (!row || row.instrument_id !== instrumentId) return { ok: false, reason: 'not_found' };
      if (folderPath && !row.folder_path) {
        db.prepare('UPDATE bookings SET folder_path = ? WHERE id = ?').run(String(folderPath).slice(0, 500), row.id);
      }
      const status = String(sendStatus || '');
      if (status === 'sent' || status === 'failed' || status === 'skipped') {
        db.prepare('UPDATE bookings SET send_status = ?, send_error = ? WHERE id = ?')
          .run(status, String(sendError || '').slice(0, 300), row.id);
      }
      return { ok: true, booking: publicBooking(selectById.get(row.id)) };
    },

    bookingsForInstrument(instrumentId) {
      return selectByInstrument.all(instrumentId).map(publicBooking);
    },

    bookingById(id) {
      return publicBooking(selectById.get(id));
    },

    listBookings() {
      return selectAllBookings.all().map(publicBooking);
    },

    // 管理后台改预约：改仪器 / 申请人 / 用途 / 日期 / 时段 / 状态。
    updateBooking(id, patch = {}) {
      const existing = selectById.get(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      const next = {
        instrument_id: patch.instrumentId ?? existing.instrument_id,
        applicant: patch.applicant ?? existing.applicant,
        purpose: patch.purpose ?? existing.purpose,
        date: patch.date ?? existing.date,
        start: patch.start ?? existing.start,
        end: patch.end ?? existing.end,
        status: patch.status ?? existing.status,
      };
      if (!String(next.date || '').trim() || !String(next.start || '').trim() || !String(next.end || '').trim()) {
        return { ok: false, reason: 'missing_fields' };
      }
      const nextStatus = String(next.status || 'active');
      if (nextStatus === 'cancelled' && existing.check_in_at) {
        return { ok: false, reason: 'already_checked_in' };
      }
      updateBooking.run(
        String(next.instrument_id),
        String(next.applicant),
        String(next.purpose || ''),
        String(next.date),
        String(next.start),
        String(next.end),
        nextStatus,
        id,
      );
      // 让 cancelled_at 与 status 保持一致：取消则记时间，恢复有效则清空。
      if (nextStatus === 'cancelled' && !existing.cancelled_at) {
        db.prepare('UPDATE bookings SET cancelled_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      } else if (nextStatus !== 'cancelled' && existing.cancelled_at) {
        db.prepare('UPDATE bookings SET cancelled_at = NULL WHERE id = ?').run(id);
      }
      return { ok: true, booking: publicBooking(selectById.get(id)) };
    },

    // 回写扫码上机 / 下机时间。返回 { ok, reason }。
    recordScan(id, action, at) {
      const row = selectById.get(id);
      if (!row || row.status !== 'active') return { ok: false, reason: 'not_found' };
      const stamp = at || new Date().toISOString();
      if (action === 'check-in') {
        if (row.check_in_at) return { ok: true, booking: publicBooking(selectById.get(id)), already: true };
        markCheckIn.run(stamp, id);
      } else if (action === 'check-out') {
        if (!row.check_in_at) return { ok: false, reason: 'not_checked_in' };
        if (row.check_out_at) return { ok: true, booking: publicBooking(selectById.get(id)), already: true };
        markCheckOut.run(stamp, id);
      } else {
        return { ok: false, reason: 'bad_action' };
      }
      return { ok: true, booking: publicBooking(selectById.get(id)) };
    },

    cancelBooking(id) {
      const row = selectById.get(id);
      if (!row || row.status !== 'active') return { ok: false, reason: 'not_found' };
      if (row.check_in_at) return { ok: false, reason: 'already_checked_in' };
      markCancelled.run(new Date().toISOString(), id);
      return { ok: true, booking: publicBooking(selectById.get(id)) };
    },

    createBooking({ instrumentId, applicant, purpose, date, start, end }) {
      const user = findUserByName.get(String(applicant || '').trim());
      if (!user) return { ok: false, reason: 'applicant_not_registered' };
      const known = selectInstrumentById.get(instrumentId);
      if (!known) return { ok: false, reason: 'unknown_instrument' };
      const id = `BK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      insertBooking.run(id, instrumentId, user.name, purpose || '', date, start, end, new Date().toISOString());
      return { ok: true, booking: publicBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)) };
    },
  };
}
