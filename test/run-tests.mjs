// 预约系统 × 扫码系统联动测试（后端 API + 扫码页状态机）
// 用法：node test/run-tests.mjs
// 前置：预约服务已在 8080 跑起来，.env 里配好 LAB_API_TOKEN。
// A6（重启后会话失效）需要在脚本外单独验证。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:8080';

function readEnv() {
  const out = {};
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const ENV = readEnv();
const TOKEN = process.env.LAB_API_TOKEN || ENV.LAB_API_TOKEN || '';

const RUN = Date.now().toString(36);
const results = [];
function check(id, name, cond, detail = '') {
  const ok = Boolean(cond);
  results.push({ id, name, ok, detail });
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${String(id).padEnd(4)} ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
}
function section(t) { console.log(`\n===== ${t} =====`); }

async function raw(pathname, { method = 'GET', token, json, form, redirect = 'follow', cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = `labpilot_scan=${cookie}`;
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body, redirect });
  const setCookie = res.headers.get('set-cookie') || '';
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, setCookie, data, text };
}

const cookieToken = (sc) => String(sc).match(/labpilot_scan=([^;]+)/)?.[1] || '';
const pad = (n) => String(n).padStart(2, '0');
const dstr = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const todayStr = () => dstr(0);

let adminToken = '';
async function admin() { if (!adminToken) adminToken = (await raw('/api/admin/login', { method: 'POST', json: { name: 'admin', password: 'admin123' } })).data?.token || ''; return adminToken; }
async function register(name, password, email = '') { return raw('/api/users/register', { method: 'POST', json: { name, password, email } }); }
async function createInstrument(id, name) { return raw('/api/admin/instruments', { method: 'POST', token: await admin(), json: { id, name, code: id, status: 'available' } }); }
async function createBooking(instrumentId, applicant, date, start, end, purpose = '') { return raw('/api/bookings', { method: 'POST', token: TOKEN, json: { instrumentId, applicant, purpose, date, start, end } }); }
async function scanLogin(instrId, name, password) { return raw(`/s/${instrId}/login`, { method: 'POST', form: { name, password }, redirect: 'manual' }); }
async function scanPage(instrId, cookie) { return raw(`/s/${instrId}`, { cookie }); }
async function scanAction(instrId, action, cookie, form) { return raw(`/s/${instrId}/${action}`, { method: 'POST', form, cookie, redirect: 'manual' }); }
async function deskGet(instrId, token = TOKEN) { return raw(`/api/instruments/${instrId}/desk`, { token }); }
async function deskPost(instrId, json, token = TOKEN) { return raw(`/api/instruments/${instrId}/desk`, { method: 'POST', token, json }); }
async function scanApi(bookingId, action, at) { return raw(`/api/bookings/${bookingId}/scan`, { method: 'POST', token: TOKEN, json: { action, at } }); }
async function activeBooking(instrId, user, date, time) { return raw(`/api/bookings/active?instrument=${instrId}&user=${encodeURIComponent(user)}&date=${date}&time=${time}`, { token: TOKEN }); }
async function adminBookings() { return (await raw('/api/admin/bookings', { token: await admin() })).data?.bookings || []; }

const main = async () => {
  console.log(`RUN=${RUN} BASE=${BASE} token=${TOKEN ? 'set' : 'MISSING'}`);
  if (!TOKEN) console.log('!! 未配置 LAB_API_TOKEN，desk/booking 接口鉴权会被跳过，D1 等用例会失效');

  section('setup');
  const u = { u1: `t1_${RUN}`, u2: `t2_${RUN}`, u3: `t3_${RUN}`, u4: `t4_${RUN}` };
  await register(u.u1, 'tester1pass', 'u1@lab.local');
  await register(u.u2, '', '');
  await register(u.u3, 'tester3pass', '');
  await register(u.u4, '', '');
  const keys = ['conf', 'b3', 'sm', 'sm2', 'idem', 'fail', 'e1', 'e5', 'e6'];
  const I = {};
  let allOk = true;
  for (const k of keys) { I[k] = `i_${k}_${RUN}`; allOk = (await createInstrument(I[k], `${k}_${RUN}`)).status === 201 && allOk; }
  check('SET', '造 4 用户 + 9 仪器', allOk);

  // ================= 3.1 账号与登录 =================
  section('3.1 账号与登录');
  const A1 = await scanLogin(I.sm, u.u2, '');
  check('A1', '无密码账号密码留空登录', A1.status === 303 && Boolean(cookieToken(A1.setCookie)), `status=${A1.status}`);
  const A2 = await scanLogin(I.sm, u.u1, 'tester1pass');
  check('A2', '有密码账号正确密码登录', A2.status === 303 && Boolean(cookieToken(A2.setCookie)), `status=${A2.status}`);
  const A3 = await scanLogin(I.sm, u.u1, '');
  check('A3', '有密码账号密码留空拒绝', A3.status === 403 && String(A3.text).includes('密码不正确'), `status=${A3.status}`);
  const A4 = await scanLogin(I.sm, u.u2, 'wrongpass');
  check('A4', '无密码账号误填密码拒绝', A4.status === 403 && String(A4.text).includes('这个账号没有设置密码，请留空'), `status=${A4.status}`);
  const A5 = await scanLogin(I.sm, `不存在_${RUN}`, '');
  check('A5', '未注册姓名拒绝', A5.status === 403 && String(A5.text).includes('该账号未注册'), `status=${A5.status}`);

  const c1 = cookieToken(A2.setCookie);
  const c2 = cookieToken(A1.setCookie);
  const c3 = cookieToken((await scanLogin(I.sm, u.u3, 'tester3pass')).setCookie);
  const c4 = cookieToken((await scanLogin(I.sm, u.u4, '')).setCookie);

  // ================= 3.2 预约冲突 =================
  section('3.2 预约冲突');
  const b1a = await createBooking(I.conf, u.u1, todayStr(), '09:00', '11:00');
  const b1b = await createBooking(I.conf, u.u1, todayStr(), '10:00', '12:00');
  check('B1', '同仪器重叠时段第二条应被拒', b1a.status === 201 && b1b.status !== 201 && b1b.data?.reason === 'conflict',
    `first=${b1a.status} second=${b1b.status} reason=${b1b.data?.reason}`);
  check('B1b', '冲突返回含冲突单号', b1a.status === 201 && String(b1b.data?.message || '').includes(b1a.data?.booking?.id),
    `msg=${b1b.data?.message}`);
  const b1c = await createBooking(I.conf, u.u1, todayStr(), '12:00', '11:00');
  check('B1c', '结束时间早于开始被拒', b1c.status === 400 && b1c.data?.reason === 'bad_time_range', `reason=${b1c.data?.reason}`);
  const b3a = await createBooking(I.conf, u.u1, todayStr(), '13:00', '14:00');
  const b3b = await createBooking(I.b3, u.u1, todayStr(), '13:00', '14:00');
  check('B3', '不同仪器同时段都成功', b3a.status === 201 && b3b.status === 201, `a=${b3a.status} b=${b3b.status}`);

  // ================= 3.3 扫码状态机 =================
  section('3.3 扫码状态机');
  const bk1 = await createBooking(I.sm, u.u1, todayStr(), '00:00', '23:59', '状态机测试');
  const bk1Id = bk1.data?.booking?.id;
  check('C0', '造 u1 当前有效预约', bk1.status === 201 && Boolean(bk1Id), `id=${bk1Id}`);

  const C1 = await scanPage(I.sm, c1);
  check('C1', '有预约者扫码可上机', C1.status === 200 && String(C1.text).includes('可以上机'));
  const C2 = await scanPage(I.sm, c4);
  check('C2', '无预约者扫码按钮灰', C2.status === 200 && String(C2.text).includes('当前时间没有这台仪器的有效预约'));

  const C3 = await scanAction(I.sm, 'check-in', c1);
  check('C3', '有预约者点上机 303', C3.status === 303, `status=${C3.status}`);
  const C3in = await raw(`/s/${I.sm}/in`, { cookie: c1 });
  check('C3b', '上机后 /in 显示已上机', C3in.status === 200 && String(C3in.text).includes('已上机'));

  const C4 = await scanPage(I.sm, c1);
  check('C4', '本人再扫显示下机页', C4.status === 200 && String(C4.text).includes('下机后'));
  const C5 = await scanPage(I.sm, c3);
  check('C5', '他人扫已占用仪器显示占用', C5.status === 200 && String(C5.text).includes('正在使用这台仪器'));

  const d3 = await deskGet(I.sm);
  check('D3', '有人上机后 desk=checked-in', d3.data?.phase === 'checked-in' && Boolean(d3.data?.booking?.checkInAt), `phase=${d3.data?.phase}`);

  const d4a = await deskPost(I.sm, { bookingId: bk1Id, folderPath: 'D:/Experiment Data/测试文件夹' });
  const d4b = await deskPost(I.sm, { bookingId: bk1Id, folderPath: 'D:/Experiment Data/测试文件夹2' });
  check('D4', '回报 folderPath 写入且重复不覆盖', d4a.data?.booking?.folderPath === 'D:/Experiment Data/测试文件夹'
    && d4b.data?.booking?.folderPath === 'D:/Experiment Data/测试文件夹', `second="${d4b.data?.booking?.folderPath}"`);

  const C6 = await scanAction(I.sm, 'check-out', c1, { email: 'u1@lab.local' });
  check('C6', '下机填邮箱 303', C6.status === 303, `status=${C6.status}`);
  const d5 = await deskGet(I.sm);
  check('D5', '下机填邮箱后 desk=need-send', d5.data?.phase === 'need-send' && d5.data?.booking?.sendStatus === 'pending',
    `phase=${d5.data?.phase} sendStatus=${d5.data?.booking?.sendStatus}`);

  const C8 = await scanPage(I.sm, c1);
  check('C8', '下机后再次扫不能上机', C8.status === 200 && String(C8.text).includes('当前时间没有这台仪器的有效预约'));

  const d6 = await deskPost(I.sm, { bookingId: bk1Id, sendStatus: 'sent' });
  const d6b = await deskGet(I.sm);
  check('D6', '回报 sent 后 desk=idle', d6.data?.booking?.sendStatus === 'sent' && d6b.data?.phase === 'idle',
    `sendStatus=${d6.data?.booking?.sendStatus} phase=${d6b.data?.phase}`);

  // C7/C8：换一台仪器，避免与 bk1 的全天预约冲突
  const bk2 = await createBooking(I.sm2, u.u1, todayStr(), '00:00', '23:59', '状态机测试2');
  const bk2Id = bk2.data?.booking?.id;
  const c1sm2 = cookieToken((await scanLogin(I.sm2, u.u1, 'tester1pass')).setCookie);
  await scanAction(I.sm2, 'check-in', c1sm2);
  const C7 = await scanAction(I.sm2, 'check-out', c1sm2, {});
  check('C7', '下机不填邮箱 303', C7.status === 303, `status=${C7.status}`);
  const d8 = await deskGet(I.sm2);
  check('D8', '下机未填邮箱 desk=idle', d8.data?.phase === 'idle' && d8.data?.booking === null, `phase=${d8.data?.phase}`);
  const bk2row = (await adminBookings()).find((x) => x.id === bk2Id);
  check('C7b', '下机不填邮箱 sendStatus=skipped', bk2row?.sendStatus === 'skipped', `sendStatus=${bk2row?.sendStatus}`);

  // C9 重复上机幂等（scan API，不依赖「现在」）
  const bk3 = await createBooking(I.idem, u.u1, todayStr(), '09:00', '10:00', '幂等');
  await scanApi(bk3.data.booking.id, 'check-in', '2026-01-01T00:00:00.000Z');
  const c9b = await scanApi(bk3.data.booking.id, 'check-in', '2026-02-02T00:00:00.000Z');
  check('C9', '重复上机幂等不覆盖首次 check_in_at', c9b.data?.booking?.checkInAt === '2026-01-01T00:00:00.000Z',
    `after2nd=${c9b.data?.booking?.checkInAt}`);

  // C10 未上机直接下机
  const bk4 = await createBooking(I.idem, u.u1, todayStr(), '11:00', '12:00', '未上机下机');
  const c10 = await scanApi(bk4.data.booking.id, 'check-out');
  check('C10', '未上机直接下机被拒', c10.status === 404 && c10.data?.reason === 'not_checked_in', `status=${c10.status} reason=${c10.data?.reason}`);

  // ================= 3.4 desk 接口 =================
  section('3.4 desk 接口');
  const d1a = await raw(`/api/instruments/${I.sm}/desk`, {});
  const d1b = await raw(`/api/instruments/${I.sm}/desk`, { token: 'wrong-token' });
  check('D1', '无/错 token 轮询 401', d1a.status === 401 && d1b.status === 401, `none=${d1a.status} wrong=${d1b.status}`);
  const d2 = await deskGet(I.e5);
  check('D2', '空闲仪器 desk=idle', d2.data?.phase === 'idle' && d2.data?.booking === null, `phase=${d2.data?.phase}`);

  const bk5 = await createBooking(I.fail, u.u1, todayStr(), '09:00', '10:00', '失败回报');
  const bk5Id = bk5.data?.booking?.id;
  const d7 = await deskPost(I.fail, { bookingId: bk5Id, sendStatus: 'failed', sendError: '文件夹为空' });
  check('D7', '回报 failed 写入 send_error', d7.data?.booking?.sendStatus === 'failed' && d7.data?.booking?.sendError === '文件夹为空',
    `status=${d7.data?.booking?.sendStatus} err=${d7.data?.booking?.sendError}`);

  const d9 = await deskGet(`nonexist_${RUN}`);
  check('D9', '仪器不存在 404', d9.status === 404, `status=${d9.status}`);

  const d10 = await deskPost(I.idem, { bookingId: bk5Id, sendStatus: 'sent' });
  check('D10', '跨仪器 bookingId 拒绝', d10.status === 404, `status=${d10.status}`);

  // ================= 3.5 边界与异常 =================
  section('3.5 边界与异常');
  // E1：pending 未发时新人上机 → checked-in 优先，pending 不丢。
  // bkA 当天全天（u1 走扫码），bkB 放明天（u3 走 scan API 直接上机，避免与 bkA 时窗冲突）。
  const e1bkA = await createBooking(I.e1, u.u1, todayStr(), '00:00', '23:59', 'E1-u1');
  const e1bkB = await createBooking(I.e1, u.u3, dstr(1), '00:00', '23:59', 'E1-u3');
  const e1c1 = cookieToken((await scanLogin(I.e1, u.u1, 'tester1pass')).setCookie);
  await scanAction(I.e1, 'check-in', e1c1);
  await scanAction(I.e1, 'check-out', e1c1, { email: 'u1@lab.local' }); // → pending
  const e1pend = await deskGet(I.e1);
  const e1preOk = e1pend.data?.phase === 'need-send';
  await scanApi(e1bkB.data.booking.id, 'check-in'); // 下一个人上机
  const e1during = await deskGet(I.e1);
  check('E1', 'pending 未发时新人上机 desk=checked-in', e1during.data?.phase === 'checked-in' && e1during.data?.booking?.applicant === u.u3,
    `phase=${e1during.data?.phase} applicant=${e1during.data?.booking?.applicant} (pre=${e1preOk ? 'need-send' : e1pend.data?.phase})`);
  await scanApi(e1bkB.data.booking.id, 'check-out'); // 新人下机（不触发发送）
  const e1after = await deskGet(I.e1);
  check('E1b', '新人下机后 pending 不丢(u1 待发)', e1after.data?.phase === 'need-send' && e1after.data?.booking?.applicant === u.u1,
    `phase=${e1after.data?.phase} applicant=${e1after.data?.booking?.applicant}`);

  // E5 边界含等号
  await createBooking(I.e5, u.u1, todayStr(), '10:00', '11:00', 'E5');
  const e5s = await activeBooking(I.e5, u.u1, todayStr(), '10:00');
  const e5e = await activeBooking(I.e5, u.u1, todayStr(), '11:00');
  const e5b = await activeBooking(I.e5, u.u1, todayStr(), '09:59');
  const e5a = await activeBooking(I.e5, u.u1, todayStr(), '11:01');
  check('E5', '预约边界含等号', e5s.data?.ok === true && e5e.data?.ok === true && e5b.data?.ok === false && e5a.data?.ok === false,
    `s=${e5s.data?.ok} e=${e5e.data?.ok} b=${e5b.data?.ok} a=${e5a.data?.ok}`);

  // E6 并发两人同时上机：u1 先上机，u3（无预约）再点 → 被 open 检查拦住，只一条 open check-in
  await createBooking(I.e6, u.u1, todayStr(), '00:00', '23:59', 'E6-u1');
  const e6c1 = cookieToken((await scanLogin(I.e6, u.u1, 'tester1pass')).setCookie);
  const e6c3 = cookieToken((await scanLogin(I.e6, u.u3, 'tester3pass')).setCookie);
  await scanAction(I.e6, 'check-in', e6c1);
  const e6second = await scanAction(I.e6, 'check-in', e6c3);
  const e6desk = await deskGet(I.e6);
  const e6rows = (await adminBookings()).filter((x) => x.instrumentId === I.e6 && x.checkInAt);
  check('E6', '并发上机只一条 open check-in', e6desk.data?.phase === 'checked-in' && e6desk.data?.booking?.applicant === u.u1 && e6rows.length === 1,
    `phase=${e6desk.data?.phase} checkedInCount=${e6rows.length} secondStatus=${e6second.status}`);

  // ================= 汇总 =================
  const fails = results.filter((r) => !r.ok);
  console.log(`\n===== 结果 =====`);
  console.log(`通过 ${results.length - fails.length} / ${results.length}`);
  if (fails.length) { console.log(`失败用例：${fails.map((f) => f.id).join(', ')}`); process.exitCode = 1; }
  else console.log('全部通过 ✅');
};

main().catch((e) => { console.error('测试脚本异常：', e); process.exit(2); });
