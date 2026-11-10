export function phonePage({ title, instrumentName, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #f3f5f1; color: #17231f; font-family: "Microsoft YaHei UI", sans-serif; }
    main { max-width: 420px; margin: 0 auto; padding: 28px 18px 40px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 14px; line-height: 1.6; color: #37453f; }
    label { display: block; margin: 12px 0 6px; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #d5ddd8; border-radius: 8px; font: inherit; }
    button { width: 100%; margin-top: 16px; padding: 12px; border: 0; border-radius: 8px; background: #0e6e64; color: white; font: inherit; }
    button:disabled { background: #c5cdc8; color: #5d6a64; }
    .error { padding: 10px 12px; border-radius: 8px; background: #fae8e3; color: #8c3b2a; }
    .ok { color: #0e6e64; font-weight: 650; }
  </style>
</head>
<body>
<main>
  <p>${escapeHtml(instrumentName || '')}</p>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</main>
</body>
</html>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function loginBody(instrumentId, error) {
  return `
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <p>使用预约系统里的姓名登录。没有设置过密码就留空。</p>
    <form method="post" action="/s/${encodeURIComponent(instrumentId)}/login">
      <label for="name">姓名</label>
      <input id="name" name="name" autocomplete="username" required maxlength="40">
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password">
      <button type="submit">登录</button>
    </form>`;
}

export function checkInBody(booking, allowed, reason) {
  if (!allowed) {
    return `<p class="error">${escapeHtml(reason)}</p><button type="button" disabled>开始上机</button>`;
  }
  return `
    <p>预约 ${escapeHtml(booking.start)}–${escapeHtml(booking.end)}${booking.purpose ? ` · ${escapeHtml(booking.purpose)}` : ''}。可以上机。</p>
    <form method="post" action="/s/${encodeURIComponent(booking.instrumentId)}/check-in">
      <button type="submit">开始上机</button>
    </form>`;
}

export function occupiedBody(holder) {
  return `<p class="error">${escapeHtml(holder)} 正在使用这台仪器，现在不能上机。</p><button type="button" disabled>开始上机</button>`;
}

export function checkedInBody(booking) {
  return `<p class="ok">已上机</p><p>${escapeHtml(booking.applicant)} 从 ${escapeHtml(booking.start)} 开始使用。再次扫描这张二维码后，才会进入下机。</p>`;
}

export function checkOutBody(booking) {
  return `
    <p>${escapeHtml(booking.applicant)} 正在使用这台仪器。下机后，仪器电脑会把本次文件夹里的数据发到下面的邮箱。可以不填。</p>
    <form method="post" action="/s/${encodeURIComponent(booking.instrumentId)}/check-out">
      <label for="email">数据接收邮箱</label>
      <input id="email" name="email" type="email" autocomplete="email" placeholder="可以不填">
      <button type="submit">下机</button>
    </form>`;
}

export function doneBody(booking) {
  const mail = booking.email ? `数据将发到 ${booking.email}。` : '没有填写邮箱，这次不发送数据。';
  return `<p class="ok">已下机</p><p>${escapeHtml(mail)}</p>`;
}
