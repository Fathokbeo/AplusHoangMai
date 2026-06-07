// Test xóa khóa học / lớp học (hard delete + cascade)
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0; const out = [];
const log = (n, ok, d = '') => { ok ? (pass++, out.push(`  ✅ ${n}`)) : (fail++, out.push(`  ❌ ${n} → ${d}`)); };
async function req(method, url, { token, json } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let body; if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const res = await fetch(BASE + url, { method, headers, body });
  const t = await res.text(); let data; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { status: res.status, data, ok: res.ok };
}

(async () => {
  console.log('\n═══ TEST XÓA KHÓA HỌC / LỚP HỌC ═══\n');
  const ts = Date.now();
  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;

  // 1. Admin tạo khóa rồi xóa → biến mất khỏi danh sách
  let r = await req('POST', '/admin/courses', { token: adminTok, json: { title: `AdminKhoa_${ts}` } });
  const cId = r.data.id;
  r = await req('GET', '/admin/courses', { token: adminTok });
  log('Khóa mới hiện trong danh sách admin', r.data.some(c => c.id === cId), '');

  r = await req('DELETE', `/admin/courses/${cId}`, { token: adminTok });
  log('Admin xóa khóa học', r.ok, JSON.stringify(r.data));
  r = await req('GET', '/admin/courses', { token: adminTok });
  log('Khóa BIẾN MẤT khỏi danh sách admin', !r.data.some(c => c.id === cId), 'vẫn còn');

  // 2. Xóa khóa có lớp + bài giảng + bài tập → cascade
  const gvU = `gvdel_${ts}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: gvU, password: 'p', full_name: 'GV Del', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: gvU, password: 'p' } })).data.token;

  const courseId = (await req('POST', '/teacher/courses', { token: gvTok, json: { title: `Khoa_${ts}` } })).data.id;
  const classId = (await req('POST', `/teacher/courses/${courseId}/classes`, { token: gvTok, json: { title: 'Lop X' } })).data.id;
  await req('POST', `/teacher/classes/${classId}/lessons`, { token: gvTok, json: { title: 'Bai 1', video_url: 'https://youtu.be/x', video_type: 'youtube' } });
  // tạo HS + thêm vào lớp
  const hsId = (await req('POST', `/teacher/classes/${classId}/students`, { token: gvTok, json: { username: `hsdel_${ts}`, password: 'p', full_name: 'HS Del' } })).data.student_id;

  r = await req('GET', `/teacher/courses/${courseId}`, { token: gvTok });
  log('Chuẩn bị: khóa có 1 lớp', r.ok && r.data.classes.length === 1, '');

  // Admin xóa khóa của giáo viên → cascade xóa lớp
  r = await req('DELETE', `/admin/courses/${courseId}`, { token: adminTok });
  log('Admin xóa khóa (có lớp) thành công', r.ok, JSON.stringify(r.data));

  r = await req('GET', `/teacher/courses/${courseId}`, { token: gvTok });
  log('Khóa đã bị xóa (404)', r.status === 404, `status ${r.status}`);
  r = await req('GET', `/teacher/classes/${classId}`, { token: gvTok });
  log('Lớp con cũng bị xóa theo (404)', r.status === 404, `status ${r.status}`);

  // HS vẫn còn (chỉ gỡ khỏi lớp, không xóa tài khoản)
  r = await req('GET', '/admin/users', { token: adminTok });
  log('Tài khoản HS vẫn còn (không bị xóa)', r.data.some(u => u.id === hsId), '');

  // 3. Xóa riêng 1 lớp (cascade)
  const c2 = (await req('POST', '/teacher/courses', { token: gvTok, json: { title: `Khoa2_${ts}` } })).data.id;
  const cl2 = (await req('POST', `/teacher/courses/${c2}/classes`, { token: gvTok, json: { title: 'Lop Y' } })).data.id;
  r = await req('DELETE', `/teacher/classes/${cl2}`, { token: gvTok });
  log('Giáo viên xóa lớp học', r.ok, JSON.stringify(r.data));
  r = await req('GET', `/teacher/courses/${c2}`, { token: gvTok });
  log('Lớp biến mất khỏi khóa', r.ok && r.data.classes.length === 0, `classes=${r.data?.classes?.length}`);

  // 4. Phân quyền: GV không xóa được khóa người khác
  const c3 = (await req('POST', '/admin/courses', { token: adminTok, json: { title: `AdminOnly_${ts}` } })).data.id;
  r = await req('DELETE', `/teacher/courses/${c3}`, { token: gvTok });
  log('GV không xóa được khóa của admin', r.status === 403, `status ${r.status}`);

  // cleanup
  await req('DELETE', `/admin/courses/${c2}`, { token: adminTok });
  await req('DELETE', `/admin/courses/${c3}`, { token: adminTok });
  const ids = [hsId, (await req('GET', '/admin/users', { token: adminTok })).data.find(u => u.username === gvU)?.id].filter(Boolean);
  await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids } });

  console.log(out.join('\n'));
  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
