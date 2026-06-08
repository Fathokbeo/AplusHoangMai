// Test: ghi chú AI (grading_note) + chi tiết câu đúng/sai (grading_details)
const fs = require('fs'); const path = require('path');
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

function makePdf(p, text) {
  fs.writeFileSync(p, `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 70>>stream
BT /F1 12 Tf 20 100 Td (${text}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`);
}
function pdfForm(fields, fileField, filePath) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (filePath) fd.append(fileField, new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' }), 'f.pdf');
  return fd;
}

(async () => {
  console.log('\n═══ TEST GHI CHÚ AI + CHI TIẾT CHẤM ═══\n');
  const tmp = path.join(__dirname, 'test-tmp'); if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  const ans = path.join(tmp, 'ans.pdf'); const sub = path.join(tmp, 'sub.pdf');
  makePdf(ans, 'Cau 1: 2+2=4. Cau 2: 5x3=15. Cau 3: 10-7=3');
  makePdf(sub, 'Cau 1: 2+2=4. Cau 2: 5x3=20 (sai). Cau 3: 10-7=3');

  const ts = Date.now();
  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;
  const gvU = `gvg_${ts}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: gvU, password: 'p', full_name: 'GV Grade', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: gvU, password: 'p' } })).data.token;

  const courseId = (await req('POST', '/teacher/courses', { token: gvTok, json: { title: 'K_' + ts } })).data.id;
  const classId = (await req('POST', `/teacher/courses/${courseId}/classes`, { token: gvTok, json: { title: 'Lop G' } })).data.id;
  const hsId = (await req('POST', `/teacher/classes/${classId}/students`, { token: gvTok, json: { username: 'hsg_' + ts, password: 'p', full_name: 'HS Grade' } })).data.student_id;
  const hsTok = (await req('POST', '/auth/login', { json: { username: 'hsg_' + ts, password: 'p' } })).data.token;

  // Tạo bài tập kèm đáp án + GHI CHÚ AI
  const note = 'Chấm cả 3 câu. Mỗi câu đúng được điểm, câu sai giải thích rõ sai ở đâu.';
  let r = await req('POST', `/classes/${classId}/homework`, { token: gvTok, form: pdfForm({ title: 'BT Grade', max_score: '10', grading_note: note }, 'answer_file', ans) });
  const hwId = r.data.id;
  log('Tạo bài tập kèm ghi chú AI', r.ok && hwId, JSON.stringify(r.data));

  // Teacher GET thấy grading_note
  r = await req('GET', `/homework/${hwId}`, { token: gvTok });
  log('Giáo viên thấy grading_note', r.data.grading_note === note, `note=${r.data.grading_note}`);

  // Học sinh nộp bài → AI chấm
  console.log('   ⏳ Đang nộp + AI chấm (10-30s)...');
  r = await req('POST', `/homework/${hwId}/submit`, { token: hsTok, form: pdfForm({}, 'file', sub) });
  log('Học sinh nộp bài', r.ok && r.data.submission, JSON.stringify(r.data).slice(0, 80));
  const submission = r.data.submission;
  log('AI chấm có điểm', submission && submission.score !== null, `score=${submission?.score}`);

  // grading_details là JSON mảng có phần tử
  let details = [];
  try { details = JSON.parse(submission.grading_details || '[]'); } catch {}
  log('Có chi tiết từng câu (grading_details)', Array.isArray(details) && details.length > 0, `len=${details.length}`);
  if (details.length) {
    const valid = details.every(d => d.question !== undefined && ['correct', 'wrong', 'partial'].includes(d.status));
    log('Mỗi câu có status đúng/sai/một phần hợp lệ', valid, JSON.stringify(details).slice(0, 200));
    const hasWrong = details.some(d => d.status === 'wrong' || d.status === 'partial');
    log('AI phát hiện câu sai (câu 2: 5x3=20)', hasWrong, JSON.stringify(details.map(d => d.status)));
  }

  // Học sinh xem lại: grading_details có, grading_note KHÔNG lộ
  r = await req('GET', `/student/my-classes/${classId}`, { token: hsTok });
  const hwForStudent = r.data.homework.find(h => h.id === hwId);
  log('Học sinh nhận được grading_details', hwForStudent && hwForStudent.grading_details, '');
  log('Học sinh KHÔNG thấy grading_note (ẩn)', hwForStudent && hwForStudent.grading_note === undefined, `note=${hwForStudent?.grading_note}`);

  // GET /homework/:id cho học sinh cũng ẩn grading_note
  r = await req('GET', `/homework/${hwId}`, { token: hsTok });
  log('GET homework (HS) ẩn grading_note', r.data.grading_note === undefined, `note=${r.data.grading_note}`);

  // cleanup
  await req('DELETE', `/admin/courses/${courseId}`, { token: adminTok });
  const ids = [hsId, (await req('GET', '/admin/users', { token: adminTok })).data.find(u => u.username === gvU)?.id].filter(Boolean);
  await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids } });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

  console.log(out.join('\n'));
  console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
