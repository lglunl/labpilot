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

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const SEED_USERS = [
  { id: 'user_linyu', name: '林雨', email: 'linyu@lab.local', password: 'linyu123', role: '课题组 · 管理员' },
  { id: 'user_zhouqun', name: '周群', email: 'zhouqun@lab.local', password: 'zhouqun123', role: '课题组成员' },
  { id: 'user_wangchen', name: '王晨', email: 'wangchen@lab.local', password: 'wangchen123', role: '课题组成员' },
  { id: 'user_chen', name: '陈老师', email: 'chen@lab.local', password: 'chen123', role: '平台管理员' },
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
  ensureColumn(db, 'bookings', 'check_in_at', 'TEXT');
  ensureColumn(db, 'bookings', 'check_out_at', 'TEXT');
  ensureColumn(db, 'bookings', 'cancelled_at', 'TEXT');
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
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
  );
  for (const user of SEED_USERS) {
    insertUser.run(user.id, user.name, user.email, hashPassword(user.password), user.role);
  }

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
  return { id: row.id, name: row.name, email: row.email, role: row.role };
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
  };
}

export function createApi(db) {
  const findUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
  const insertBooking = db.prepare(
    `INSERT INTO bookings
      (id, instrument_id, applicant, purpose, date, start, end, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  );
  const selectActive = db.prepare(
    `SELECT * FROM bookings
      WHERE instrument_id = ? AND applicant = ? AND date = ? AND status = 'active'
        AND start <= ? AND end >= ?
      ORDER BY start LIMIT 1`,
  );
  const selectByInstrument = db.prepare(
    `SELECT * FROM bookings WHERE instrument_id = ? AND status = 'active' ORDER BY date, start`,
  );
  const selectById = db.prepare('SELECT * FROM bookings WHERE id = ?');
  const markCheckIn = db.prepare(
    `UPDATE bookings SET check_in_at = ? WHERE id = ? AND check_in_at IS NULL`,
  );
  const markCheckOut = db.prepare(
    `UPDATE bookings SET check_out_at = ? WHERE id = ? AND check_in_at IS NOT NULL AND check_out_at IS NULL`,
  );
  const markCancelled = db.prepare(
    `UPDATE bookings SET cancelled_at = ?, status = 'cancelled' WHERE id = ? AND check_in_at IS NULL`,
  );

  return {
    instruments: SEED_INSTRUMENTS,

    authenticate(name, password) {
      const row = findUserByName.get(String(name || '').trim());
      if (!row) return { ok: false, reason: 'not_registered' };
      if (password && !verifyPassword(password, row.password_hash)) {
        return { ok: false, reason: 'bad_password' };
      }
      return { ok: true, user: publicUser(row) };
    },

    activeBooking({ instrumentId, applicant, date, time }) {
      const row = selectActive.get(instrumentId, applicant, date, time, time);
      return publicBooking(row);
    },

    bookingsForInstrument(instrumentId) {
      return selectByInstrument.all(instrumentId).map(publicBooking);
    },

    bookingById(id) {
      return publicBooking(selectById.get(id));
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
      const known = SEED_INSTRUMENTS.some((item) => item.id === instrumentId);
      if (!known) return { ok: false, reason: 'unknown_instrument' };
      const id = `BK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      insertBooking.run(id, instrumentId, user.name, purpose || '', date, start, end, new Date().toISOString());
      return { ok: true, booking: publicBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)) };
    },
  };
}
