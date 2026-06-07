// Test: thêm HS = tạo tài khoản, đổi lớp, chỉ định lớp, danh sách HS hiện lớp
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
  console.log('\n═══ TEST QUẢN LÝ HỌC SINH THEO LỚP ═══\n');
  const ts = Date.now();
  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;

  // Tạo giáo viên + đăng nhập
  const tU = `gvcs_${ts}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: tU, password: 'gv123', full_name: 'GV ClassTest', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: tU, password: 'gv123' } })).data.token;

  // Tạo khóa + 2 lớp
  const courseId = (await req('POST', '/teacher/courses', { token: gvTok, json: { title: `Khóa ${ts}` } })).data.id;
  const classA = (await req('POST', `/teacher/courses/${courseId}/classes`, { token: gvTok, json: { title: 'Lớp A' } })).data.id;
  const classB = (await req('POST', `/teacher/courses/${courseId}/classes`, { token: gvTok, json: { title: 'Lớp B' } })).data.id;
  log('Chuẩn bị: tạo khóa + 2 lớp', courseId && classA && classB, `course=${courseId} A=${classA} B=${classB}`);

  // 1. Thêm HS vào lớp = TẠO TÀI KHOẢN MỚI
  const hsU = `hsmoi_${ts}`;
  let r = await req('POST', `/teacher/classes/${classA}/students`, { token: gvTok, json: { username: hsU, password: 'hs123', full_name: 'HS Mới', email: 'hs@test.vn' } });
  log('Thêm HS vào lớp = tạo tài khoản mới', r.ok && r.data.student_id, JSON.stringify(r.data));
  const hsId = r.data?.student_id;

  // tài khoản mới đăng nhập được
  r = await req('POST', '/auth/login', { json: { username: hsU, password: 'hs123' } });
  log('Tài khoản HS vừa tạo đăng nhập được', r.ok && r.data.token, '');

  // admin xem được mật khẩu (plain_password)
  r = await req('GET', '/admin/users', { token: adminTok });
  const adminView = r.data.find(u => u.id === hsId);
  log('Admin xem được mật khẩu HS tạo qua lớp', adminView?.plain_password === 'hs123', `plain=${adminView?.plain_password}`);

  // HS xuất hiện trong lớp A
  r = await req('GET', `/teacher/classes/${classA}`, { token: gvTok });
  log('HS có trong danh sách lớp A', r.data.students.some(s => s.id === hsId), '');

  // 2. Danh sách HS hiện cột lớp
  r = await req('GET', '/teacher/students', { token: gvTok });
  const sInList = r.data.find(s => s.id === hsId);
  log('Danh sách HS hiển thị lớp đang học', sInList && Array.isArray(sInList.classes) && sInList.classes.some(c => c.id === classA), JSON.stringify(sInList?.classes));

  // 3. Chặn tạo HS trùng username
  r = await req('POST', `/teacher/classes/${classB}/students`, { token: gvTok, json: { username: hsU, password: 'x', full_name: 'Trùng' } });
  log('Chặn username trùng khi tạo trong lớp', r.status === 400, `status ${r.status}`);

  // 4. Thiếu thông tin khi tạo mới
  r = await req('POST', `/teacher/classes/${classB}/students`, { token: gvTok, json: { full_name: 'Thiếu' } });
  log('Chặn tạo HS thiếu thông tin', r.status === 400, `status ${r.status}`);

  // 5. Đổi lớp: A → B
  r = await req('PUT', `/teacher/students/${hsId}/move`, { token: gvTok, json: { from_class_id: classA, to_class_id: classB } });
  log('Đổi lớp A → B', r.ok, JSON.stringify(r.data));
  r = await req('GET', `/teacher/classes/${classA}`, { token: gvTok });
  const stillInA = r.data.students.some(s => s.id === hsId);
  r = await req('GET', `/teacher/classes/${classB}`, { token: gvTok });
  const nowInB = r.data.students.some(s => s.id === hsId);
  log('Sau đổi: rời lớp A, vào lớp B', !stillInA && nowInB, `inA=${stillInA} inB=${nowInB}`);

  // 6. Tạo HS chưa có lớp rồi CHỈ ĐỊNH lớp
  const hs2U = `hsfree_${ts}`;
  const hs2Id = (await req('POST', '/teacher/students', { token: gvTok, json: { username: hs2U, password: 'p', full_name: 'HS Tự Do' } })).data.id;
  r = await req('GET', '/teacher/students', { token: gvTok });
  const free = r.data.find(s => s.id === hs2Id);
  log('HS mới tạo chưa có lớp nào', free && free.classes.length === 0, `classes=${free?.classes?.length}`);

  r = await req('PUT', `/teacher/students/${hs2Id}/move`, { token: gvTok, json: { to_class_id: classA } });
  log('Chỉ định lớp cho HS chưa có lớp', r.ok, JSON.stringify(r.data));
  r = await req('GET', '/teacher/students', { token: gvTok });
  const assigned = r.data.find(s => s.id === hs2Id);
  log('HS đã có lớp sau khi chỉ định', assigned && assigned.classes.some(c => c.id === classA), JSON.stringify(assigned?.classes));

  // 7. Chặn đổi vào lớp đã ở
  r = await req('PUT', `/teacher/students/${hs2Id}/move`, { token: gvTok, json: { to_class_id: classA } });
  log('Chặn chỉ định lớp đã ở', r.status === 400, `status ${r.status}`);

  // 8. GET /teacher/classes (danh sách lớp phẳng cho dropdown)
  r = await req('GET', '/teacher/classes', { token: gvTok });
  log('Lấy danh sách lớp (dropdown)', r.ok && r.data.length >= 2 && r.data.every(c => c.title), `count=${r.data?.length}`);

  // 9. Thêm HS có sẵn vào lớp (chế độ existing)
  r = await req('POST', `/teacher/classes/${classB}/students`, { token: gvTok, json: { student_id: hs2Id } });
  log('Thêm HS có sẵn vào lớp (student_id)', r.ok, JSON.stringify(r.data));

  // cleanup
  const ids = [hsId, hs2Id].filter(Boolean);
  const gvId = (await req('GET', '/admin/users', { token: adminTok })).data.find(u => u.username === tU)?.id;
  if (gvId) ids.push(gvId);
  await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids } });

  console.log(out.join('\n'));
  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
