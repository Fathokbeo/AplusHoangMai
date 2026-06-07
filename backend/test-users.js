// Test tính năng quản lý tài khoản mới: xem mật khẩu, xóa thật, xóa hàng loạt, vô hiệu hóa
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const out = [];
const log = (n, ok, d = '') => { ok ? (pass++, out.push(`  ✅ ${n}`)) : (fail++, out.push(`  ❌ ${n} → ${d}`)); };

async function req(method, url, { token, json } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const res = await fetch(BASE + url, { method, headers, body });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

(async () => {
  console.log('\n═══ TEST QUẢN LÝ TÀI KHOẢN ═══\n');
  const ts = Date.now();
  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;

  // 1. Tạo tài khoản và xem mật khẩu
  const u1 = `tk1_${ts}`, p1 = 'matkhau123';
  let r = await req('POST', '/admin/users', { token: adminTok, json: { username: u1, password: p1, full_name: 'User 1', role: 'student' } });
  const id1 = r.data?.id;
  log('Tạo tài khoản học sinh', r.ok && id1, JSON.stringify(r.data));

  r = await req('GET', '/admin/users', { token: adminTok });
  const found = r.data.find(u => u.id === id1);
  log('GET users trả về plain_password', found && found.plain_password === p1, `plain=${found?.plain_password}`);

  // 2. Admin đổi mật khẩu → plain_password cập nhật
  const p1b = 'matkhaumoi456';
  await req('PUT', `/admin/users/${id1}`, { token: adminTok, json: { password: p1b } });
  r = await req('GET', '/admin/users', { token: adminTok });
  const f2 = r.data.find(u => u.id === id1);
  log('Đổi mật khẩu cập nhật plain_password', f2?.plain_password === p1b, `plain=${f2?.plain_password}`);
  // và đăng nhập được bằng mật khẩu mới
  r = await req('POST', '/auth/login', { json: { username: u1, password: p1b } });
  log('Đăng nhập bằng mật khẩu mới', r.ok && r.data.token, JSON.stringify(r.data));

  // 3. Vô hiệu hóa (active=0) — KHÔNG xóa
  r = await req('PUT', `/admin/users/${id1}`, { token: adminTok, json: { active: false } });
  log('Vô hiệu hóa tài khoản', r.ok, JSON.stringify(r.data));
  r = await req('GET', '/admin/users', { token: adminTok });
  const f3 = r.data.find(u => u.id === id1);
  log('Tài khoản vẫn tồn tại sau vô hiệu hóa', f3 && f3.active === 0, `active=${f3?.active}`);
  // Bị vô hiệu thì không đăng nhập được
  r = await req('POST', '/auth/login', { json: { username: u1, password: p1b } });
  log('Tài khoản vô hiệu không đăng nhập được', r.status === 401, `status ${r.status}`);
  // Kích hoạt lại
  await req('PUT', `/admin/users/${id1}`, { token: adminTok, json: { active: true } });
  r = await req('POST', '/auth/login', { json: { username: u1, password: p1b } });
  log('Kích hoạt lại → đăng nhập được', r.ok, '');

  // 4. Xóa thật (hard delete) — biến mất luôn
  r = await req('DELETE', `/admin/users/${id1}`, { token: adminTok });
  log('Xóa thật tài khoản', r.ok, JSON.stringify(r.data));
  r = await req('GET', '/admin/users', { token: adminTok });
  log('Tài khoản BIẾN MẤT khỏi DB', !r.data.find(u => u.id === id1), 'vẫn còn trong list');

  // 5. Giáo viên tạo học sinh → plain_password cũng lưu
  const tU = `gv_${ts}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: tU, password: 'gv123', full_name: 'GV', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: tU, password: 'gv123' } })).data.token;
  const hsU = `hsgv_${ts}`;
  await req('POST', '/teacher/students', { token: gvTok, json: { username: hsU, password: 'hs999', full_name: 'HS của GV' } });
  r = await req('GET', '/admin/users', { token: adminTok });
  const hsFound = r.data.find(u => u.username === hsU);
  log('Admin xem được mật khẩu HS do GV tạo', hsFound?.plain_password === 'hs999', `plain=${hsFound?.plain_password}`);

  // 6. Xóa hàng loạt
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const rr = await req('POST', '/admin/users', { token: adminTok, json: { username: `bulk${i}_${ts}`, password: '123', full_name: `Bulk ${i}`, role: 'student' } });
    ids.push(rr.data.id);
  }
  r = await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids } });
  log('Xóa hàng loạt 3 tài khoản', r.ok && r.data.deleted === 3, JSON.stringify(r.data));
  r = await req('GET', '/admin/users', { token: adminTok });
  log('Cả 3 tài khoản đã biến mất', ids.every(id => !r.data.find(u => u.id === id)), 'còn sót');

  // 7. Không tự xóa được chính mình
  const me = (await req('GET', '/auth/me', { token: adminTok })).data;
  r = await req('DELETE', `/admin/users/${me.id}`, { token: adminTok });
  log('Không thể tự xóa chính mình', r.status === 400, `status ${r.status}`);

  // 8. Phân quyền: giáo viên không gọi được bulk-delete
  r = await req('POST', '/admin/users/bulk-delete', { token: gvTok, json: { ids: [1] } });
  log('Giáo viên KHÔNG xóa được tài khoản', r.status === 403, `status ${r.status}`);

  // cleanup
  r = await req('GET', '/admin/users', { token: adminTok });
  const leftover = r.data.filter(u => u.username === tU || u.username === hsU).map(u => u.id);
  if (leftover.length) await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids: leftover } });

  console.log(out.join('\n'));
  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
