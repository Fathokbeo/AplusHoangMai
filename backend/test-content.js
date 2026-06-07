// Test nội dung trang công khai: public GET, admin CRUD, upload ảnh, site-settings
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0; const out = [];
const log = (n, ok, d = '') => { ok ? (pass++, out.push(`  ✅ ${n}`)) : (fail++, out.push(`  ❌ ${n} → ${d}`)); };

async function req(method, url, { token, json, form } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body });
  const t = await res.text(); let data; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { status: res.status, data, ok: res.ok };
}

function imgForm(fields, filePath) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (filePath) fd.append('image', new Blob([fs.readFileSync(filePath)], { type: 'image/png' }), 'pic.png');
  return fd;
}

(async () => {
  console.log('\n═══ TEST NỘI DUNG TRANG GIỚI THIỆU ═══\n');
  const tmp = path.join(__dirname, 'test-tmp'); if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  const png = path.join(tmp, 'pic.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5f0000000049454e44ae426082', 'hex'));

  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;
  log('Admin đăng nhập', !!adminTok, '');

  // ── Các bộ sưu tập ──
  const collections = {
    'featured-students': { name: 'HS Giỏi', exam: 'Thi vào 10', achievement: '9.5 điểm' },
    'staff': { name: 'Thầy A', role_title: 'GV Toán', staff_type: 'teacher' },
    'featured-courses': { title: 'Toán 9 Nâng Cao', student_count: '120 học sinh' },
    'achievements': { year: '2024', title: 'Top 1 tỉnh' },
  };

  const createdIds = {};
  for (const [col, fields] of Object.entries(collections)) {
    // tạo kèm ảnh
    let r = await req('POST', `/admin/content/${col}`, { token: adminTok, form: imgForm({ ...fields, display_order: '1' }, png) });
    log(`[${col}] Tạo mục kèm ảnh`, r.ok && r.data.id, JSON.stringify(r.data));
    createdIds[col] = r.data?.id;

    // admin list thấy mục vừa tạo + có ảnh
    r = await req('GET', `/admin/content/${col}`, { token: adminTok });
    const item = r.data.find(x => x.id === createdIds[col]);
    log(`[${col}] Admin list có mục + ảnh`, item && item.image, `image=${item?.image}`);

    // public GET thấy (active=1)
    r = await req('GET', `/public/${col}`, {});
    log(`[${col}] Public GET hiển thị`, r.ok && r.data.some(x => x.id === createdIds[col]), `count=${r.data?.length}`);

    // cập nhật (đổi 1 field)
    r = await req('PUT', `/admin/content/${col}/${createdIds[col]}`, { token: adminTok, form: imgForm({ display_order: '5' }) });
    log(`[${col}] Cập nhật mục`, r.ok, JSON.stringify(r.data));

    // ẩn (active=0) → public không thấy
    r = await req('PUT', `/admin/content/${col}/${createdIds[col]}`, { token: adminTok, form: imgForm({ active: '0' }) });
    r = await req('GET', `/public/${col}`, {});
    log(`[${col}] Ẩn mục → public không thấy`, !r.data.some(x => x.id === createdIds[col]), 'vẫn thấy');
    // admin vẫn thấy
    r = await req('GET', `/admin/content/${col}`, { token: adminTok });
    log(`[${col}] Admin vẫn thấy mục đã ẩn`, r.data.some(x => x.id === createdIds[col]), '');
  }

  // staff_type filter: tạo 1 trợ giảng
  let r = await req('POST', '/admin/content/staff', { token: adminTok, form: imgForm({ name: 'Cô B', role_title: 'Trợ giảng', staff_type: 'assistant', active: '1' }) });
  const assistId = r.data?.id;
  r = await req('GET', '/public/staff', {});
  const hasAssistant = r.data.some(x => x.id === assistId && x.staff_type === 'assistant');
  log('[staff] Phân biệt trợ giảng (staff_type)', hasAssistant, '');

  // ── Site settings ──
  r = await req('GET', '/public/settings', {});
  log('Public lấy được settings mặc định', r.ok && r.data.contact_phone, `phone=${r.data?.contact_phone}`);

  r = await req('PUT', '/admin/content/settings', { token: adminTok, json: { contact_phone: '0987 111 222', hero_title: 'APLUS Tuyệt Vời', stats_students: '999+' } });
  log('Admin lưu settings', r.ok, JSON.stringify(r.data));

  r = await req('GET', '/public/settings', {});
  log('Settings đã cập nhật (public thấy)', r.data.contact_phone === '0987 111 222' && r.data.hero_title === 'APLUS Tuyệt Vời', JSON.stringify({ p: r.data.contact_phone, h: r.data.hero_title }));

  // ── Phân quyền ──
  r = await req('GET', '/admin/content/featured-students', {});
  log('Chặn truy cập admin content khi không token', r.status === 401, `status ${r.status}`);

  // tạo teacher để thử
  const tU = `gvc_${Date.now()}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: tU, password: 'p', full_name: 'GV', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: tU, password: 'p' } })).data.token;
  r = await req('POST', '/admin/content/staff', { token: gvTok, form: imgForm({ name: 'Hack' }) });
  log('Giáo viên KHÔNG sửa được nội dung', r.status === 403, `status ${r.status}`);

  // collection không hợp lệ
  r = await req('GET', '/admin/content/khong-co', { token: adminTok });
  log('Loại nội dung không hợp lệ → 404', r.status === 404, `status ${r.status}`);

  // ── Xóa (cleanup) ──
  for (const [col, id] of Object.entries(createdIds)) {
    r = await req('DELETE', `/admin/content/${col}/${id}`, { token: adminTok });
    log(`[${col}] Xóa mục`, r.ok, '');
  }
  await req('DELETE', `/admin/content/staff/${assistId}`, { token: adminTok });
  const gvId = (await req('GET', '/admin/users', { token: adminTok })).data.find(u => u.username === tU)?.id;
  if (gvId) await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids: [gvId] } });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

  console.log(out.join('\n'));
  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
