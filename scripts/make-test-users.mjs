// 造测试账号：用于 3.1「账号与登录」用例。
// 用法（预约服务已在 8080 跑起来时）：
//   node scripts/make-test-users.mjs
// 可选指定服务地址：LAB_BASE=https://xxx.trycloudflare.com node scripts/make-test-users.mjs

const BASE = (process.env.LAB_BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '');

const users = [
  { name: 'tester1', password: 'tester1pass', email: 'tester1@lab.local', desc: '有密码账号（用例 A2 / A3）' },
  { name: 'tester2', password: '', email: '', desc: '无密码账号（用例 A1 / A4）' },
];

async function register(user) {
  const res = await fetch(`${BASE}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: user.name,
      password: user.password,
      email: user.email,
    }),
  });
  return { status: res.status, data: await res.json() };
}

for (const u of users) {
  const { status, data } = await register(u);
  if (data.ok) {
    console.log(`[OK]   ${u.name} 已注册（${u.desc}），id=${data.user.id}`);
  } else if (data.reason === 'name_taken') {
    console.log(`[跳过] ${u.name} 已存在（${u.desc}）`);
  } else {
    console.log(`[失败] ${u.name}（${u.desc}）: status=${status} ${data.message || JSON.stringify(data)}`);
  }
}
