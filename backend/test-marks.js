/**
 * Test Điểm 10 phút + Điểm danh ở mục "Nhận xét": PUT /homework/:id/marks, dữ liệu trả kèm roster
 * của GET /homework/:id, phân quyền, kiểm tra giá trị. Tự tạo dữ liệu riêng rồi dọn.
 * Run: node test-marks.js   (server phải chạy trên :5000, hoặc đặt API_BASE)
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? `  → ${extra}` : ''}`); };
async function req(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const r = await fetch(BASE + url, { method, headers, body });
  const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const login = async (u, p) => (await req('POST', '/auth/login', { json: { username: u, password: p } })).data.token;

(async () => {
  console.log('\n═══ TEST ĐIỂM 10 PHÚT + ĐIỂM DANH ═══\n');
  const admin = await login('admin', 'admin123');
  const u = 'mk' + Date.now();
  await req('POST', '/admin/users', { token: admin, json: { username: u, password: '123456', full_name: 'GV Điểm danh', role: 'teacher' } });
  await req('POST', '/admin/users', { token: admin, json: { username: u + 'x', password: '123456', full_name: 'GV khác', role: 'teacher' } });
  const tt = await login(u, '123456');
  const other = await login(u + 'x', '123456');
  const course = (await req('POST', '/teacher/courses', { token: tt, json: { title: 'Khóa ĐD' } })).data.id;
  const cls = (await req('POST', `/teacher/courses/${course}/classes`, { token: tt, json: { title: 'Lớp ĐD' } })).data.id;
  const ids = [];
  for (const n of ['a', 'b', 'c']) {
    const id = (await req('POST', '/teacher/students', { token: tt, json: { username: u + n, password: '123456', full_name: 'HS ' + n } })).data.id;
    await req('POST', `/teacher/classes/${cls}/students`, { token: tt, json: { student_id: id } });
    ids.push(id);
  }
  const outsider = (await req('POST', '/admin/users', { token: admin, json: { username: u + 'out', password: '123456', full_name: 'Ngoài', role: 'student' } })).data.id;
  const f = new FormData(); f.append('title', 'Buổi 1'); f.append('max_score', '10');
  const hw = (await req('POST', `/classes/${cls}/homework`, { token: tt, form: f })).data.id;

  let r = await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: ids[0], quiz_score: '8,5', attendance: 'present' }, { student_id: ids[1], attendance: 'other_shift' }] } });
  ok('Lưu điểm 10p (nhận dấu phẩy) + điểm danh', r.status === 200 && r.data.marks.length === 2, JSON.stringify(r.data));
  r = await req('GET', `/homework/${hw}`, { token: tt });
  const by = Object.fromEntries(r.data.roster.map((s) => [s.student_id, s]));
  ok('Roster trả kèm quiz_score / attendance', by[ids[0]].quiz_score === 8.5 && by[ids[0]].attendance === 'present' && by[ids[1]].attendance === 'other_shift' && by[ids[2]].attendance === null);

  await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: ids[0], attendance: 'online' }] } });
  r = await req('GET', `/homework/${hw}`, { token: tt });
  const s0 = r.data.roster.find((s) => s.student_id === ids[0]);
  ok('Chỉ đổi điểm danh, giữ nguyên điểm 10p', s0.attendance === 'online' && s0.quiz_score === 8.5);
  await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: ids[0], quiz_score: null, attendance: null }] } });
  r = await req('GET', `/homework/${hw}`, { token: tt });
  const s0b = r.data.roster.find((s) => s.student_id === ids[0]);
  ok('Xóa được (null)', s0b.attendance === null && s0b.quiz_score === null);

  r = await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: ids[0], quiz_score: 11 }] } });
  ok('Điểm > 10 bị từ chối', r.status === 400);
  r = await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: ids[0], attendance: 'late' }] } });
  ok('Trạng thái lạ bị từ chối', r.status === 400);
  r = await req('PUT', `/homework/${hw}/marks`, { token: tt, json: { marks: [{ student_id: outsider, attendance: 'present' }] } });
  ok('HS ngoài lớp bị từ chối', r.status === 400);
  r = await req('PUT', `/homework/${hw}/marks`, { token: other, json: { marks: [{ student_id: ids[0], attendance: 'present' }] } });
  ok('GV lớp khác không sửa được (403)', r.status === 403);
  const st = await login(u + 'a', '123456');
  r = await req('PUT', `/homework/${hw}/marks`, { token: st, json: { marks: [{ student_id: ids[0], attendance: 'present' }] } });
  ok('Học sinh không sửa được (403)', r.status === 403);
  r = await req('PUT', `/homework/${hw}/marks`, { token: admin, json: { marks: ids.map((id) => ({ student_id: id, attendance: 'present' })) } });
  ok('Admin tích đi học cả lớp một lần', r.status === 200 && r.data.marks.every((m) => m.attendance === 'present'));

  r = await req('DELETE', `/homework/${hw}`, { token: tt });
  ok('Xóa bài tập (kèm điểm danh) không lỗi', r.status === 200, JSON.stringify(r.data));

  await req('DELETE', `/admin/courses/${course}`, { token: admin });
  const users = (await req('GET', '/admin/users', { token: admin })).data;
  await req('POST', '/admin/users/bulk-delete', { token: admin, json: { ids: users.filter((x) => String(x.username).startsWith(u)).map((x) => x.id) } });

  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
