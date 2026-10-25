/**
 * Test trang "Tổng quát": GET /student/overview (việc cần làm, kết quả mới, tình hình lớp) và
 * GET /teacher/overview (hôm nay, sắp đến hạn, lớp học, bài chờ chấm). Tự tạo dữ liệu riêng.
 * Run: node test-overview.js   (server phải chạy trên :5000, hoặc đặt API_BASE)
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
  return { status: r.status, ok: r.ok, data };
}
const fd = (obj) => { const f = new FormData(); Object.entries(obj).forEach(([k, v]) => f.append(k, v)); return f; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = async (u, p) => (await req('POST', '/auth/login', { json: { username: u, password: p } })).data;

(async () => {
  console.log('\n═══ TEST TRANG TỔNG QUÁT ═══\n');
  const admin = (await login('admin', 'admin123')).token;
  const u = 'ov' + Date.now();
  await req('POST', '/admin/users', { token: admin, json: { username: u, password: '123456', full_name: 'GV Tổng quát', role: 'teacher' } });
  const tt = (await login(u, '123456')).token;
  const course = (await req('POST', '/teacher/courses', { token: tt, json: { title: 'Khóa TQ' } })).data.id;
  const cls = (await req('POST', `/teacher/courses/${course}/classes`, { token: tt, json: { title: 'Lớp TQ' } })).data.id;
  const mk = async (sfx, name) => {
    const id = (await req('POST', '/teacher/students', { token: tt, json: { username: u + sfx, password: '123456', full_name: name } })).data.id;
    await req('POST', `/teacher/classes/${cls}/students`, { token: tt, json: { student_id: id } });
    return { id, token: (await login(u + sfx, '123456')).token };
  };
  const A = await mk('a', 'Nguyễn Văn An');
  const B = await mk('b', 'Trần Thị Bình');
  await req('POST', '/admin/users', { token: admin, json: { username: u + 'out', password: '123456', full_name: 'Ngoài lớp', role: 'student' } });
  const out = (await login(u + 'out', '123456')).token;

  const t0 = Date.now();
  const tomorrow = new Date(t0 + 30 * 3600e3).toISOString();
  const parts = JSON.stringify({ multiple_choice: { enabled: true, count: 4, answers: ['A', 'B', 'C', 'D'], points: [1, 1, 1, 1] } });
  const hwTN = (await req('POST', `/classes/${cls}/homework`, { token: tt, form: fd({ title: 'Trắc nghiệm tuần', max_score: '10', due_date: tomorrow, parts_config: parts }) })).data.id;
  const hwSoon = (await req('POST', `/classes/${cls}/homework`, { token: tt, form: fd({ title: 'Hạn trong 1 giờ', max_score: '10', due_date: new Date(t0 + 3600e3).toISOString() }) })).data.id;
  const hwPassed = (await req('POST', `/classes/${cls}/homework`, { token: tt, form: fd({ title: 'Vừa hết hạn', max_score: '10', due_date: new Date(t0 - 3600e3).toISOString() }) })).data.id;

  // ── Học sinh ──
  console.log('── Học sinh ──');
  let r = await req('GET', '/student/overview', { token: B.token });
  const todo = (r.data.todo || []).map((x) => x.id);
  ok('Việc cần làm có bài còn hạn, chưa nộp', r.status === 200 && todo.includes(hwTN) && todo.includes(hwSoon), JSON.stringify((r.data.todo || []).map((x) => x.title)));
  ok('Không có bài đã hết hạn', !todo.includes(hwPassed));
  ok('Sắp theo hạn gần nhất trước', todo.indexOf(hwSoon) < todo.indexOf(hwTN));
  ok('Có tình hình lớp (điểm TB, hạng)', r.data.classes.length === 1 && r.data.classes[0].id === cls && 'my_rank' in r.data.classes[0]);

  await req('POST', `/homework/${hwTN}/submit`, { token: A.token, form: fd({ structured_answers: JSON.stringify({ multiple_choice: ['A', 'B', 'C', 'X'], true_false: [], short_answer: [] }) }) });
  for (let i = 0; i < 30; i++) {
    r = await req('GET', '/student/overview', { token: A.token });
    if (r.data.recent.some((x) => x.homework_id === hwTN)) break;
    await sleep(300);
  }
  ok('Nộp xong → bài rời khỏi Việc cần làm', !r.data.todo.some((x) => x.id === hwTN));
  ok('Kết quả mới có điểm vừa chấm (7,5)', r.data.recent.some((x) => x.homework_id === hwTN && x.score === 7.5), JSON.stringify(r.data.recent));
  r = await req('GET', '/student/overview', { token: out });
  ok('HS ngoài lớp không thấy bài của lớp', r.status === 200 && !r.data.todo.some((x) => x.class_id === cls));

  // ── Giáo viên ──
  console.log('\n── Giáo viên ──');
  const f = new FormData(); f.append('files', new Blob([Buffer.from('%PDF-1.4 b')], { type: 'application/pdf' }), 'b.pdf');
  await req('POST', `/homework/${hwSoon}/submit`, { token: B.token, form: f });
  const dayQ = `?from=${new Date(t0 - 3 * 3600e3).toISOString()}&to=${new Date(t0 + 3 * 3600e3).toISOString()}`;
  r = await req('GET', '/teacher/overview' + dayQ, { token: tt });
  const today = r.data.today || [];
  ok('Hôm nay có bài sắp đến hạn trong ngày', r.status === 200 && today.some((x) => x.id === hwSoon), JSON.stringify(today.map((x) => x.title)));
  ok('Hôm nay có bài đã hết hạn trong ngày', today.some((x) => x.id === hwPassed));
  ok('Bài hạn ngày mai không nằm trong Hôm nay', !today.some((x) => x.id === hwTN));
  ok('Sắp đến hạn chỉ còn bài sau hôm nay', r.data.upcoming.some((x) => x.id === hwTN) && !r.data.upcoming.some((x) => x.id === hwSoon));
  const soon = today.find((x) => x.id === hwSoon);
  ok('Có số đã nộp / sĩ số / chờ chấm', soon && soon.submitted === 1 && soon.total === 2 && soon.to_grade === 1, JSON.stringify(soon));
  const row = r.data.classes.find((x) => x.id === cls);
  ok('Danh sách lớp kèm sĩ số, số bài, chờ chấm, điểm TB', row && row.student_count === 2 && row.homework_count === 3 && row.to_grade === 1 && typeof row.class_avg === 'number', JSON.stringify(row));
  r = await req('GET', '/teacher/overview', { token: admin });
  ok('Admin xem được (mọi lớp)', r.status === 200 && r.data.classes.some((x) => x.id === cls));
  r = await req('GET', '/teacher/overview', { token: out });
  ok('Học sinh không gọi được tổng quát giáo viên (403)', r.status === 403);

  // Dọn dữ liệu thử
  await req('DELETE', `/admin/courses/${course}`, { token: admin });
  const users = (await req('GET', '/admin/users', { token: admin })).data;
  const ids = users.filter((x) => String(x.username).startsWith(u)).map((x) => x.id);
  await req('POST', '/admin/users/bulk-delete', { token: admin, json: { ids } });

  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
