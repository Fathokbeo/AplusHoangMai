/**
 * Test các tính năng mới:
 *  1. Bulk import học sinh (nhập Excel) — POST /teacher/classes/:id/students/bulk
 *  2. Roster bài tập (cả lớp, đã nộp/chưa nộp, quá hạn) — GET /homework/:id
 *  3. Xếp hạng theo tháng (xem lại lịch sử) — GET /teacher/classes/:id/ranking
 *  4. File đính kèm bài giảng (tài liệu + đáp án BT trên lớp) — /teacher/lessons/:id/attachments
 * Run: node test-newfeatures.js   (server phải chạy trên :5000)
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const results = [];

function log(name, ok, detail = '') {
  if (ok) { pass++; results.push(`  ✅ ${name}`); }
  else { fail++; results.push(`  ❌ ${name}  →  ${detail}`); }
}

async function req(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

function makePdf(filePath, text) {
  const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 60>>stream
BT /F1 14 Tf 20 100 Td (${text}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
trailer<</Root 1 0 R/Size 6>>
startxref
0
%%EOF`;
  fs.writeFileSync(filePath, content);
}

async function main() {
  const uniq = Date.now().toString(36);
  const tmp = path.join(__dirname, `tmp-newfeat-${uniq}`);
  fs.mkdirSync(tmp, { recursive: true });

  // ── Đăng nhập & dựng dữ liệu nền ──
  let r = await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } });
  log('Admin đăng nhập', r.ok && r.data.token, JSON.stringify(r.data));
  const adminTok = r.data.token;

  const tUser = `gv_nf_${uniq}`;
  r = await req('POST', '/admin/users', { token: adminTok, json: { username: tUser, password: '123456', full_name: 'GV Test NF', role: 'teacher' } });
  log('Tạo giáo viên', r.ok, JSON.stringify(r.data));
  const teacherId = r.data.id;

  r = await req('POST', '/auth/login', { json: { username: tUser, password: '123456' } });
  const teacherTok = r.data.token;

  r = await req('POST', '/teacher/courses', { token: teacherTok, json: { title: 'Khóa NF ' + uniq } });
  const courseId = r.data.id;
  r = await req('POST', `/teacher/courses/${courseId}/classes`, { token: teacherTok, json: { title: 'Lớp NF ' + uniq } });
  const classId = r.data.id;
  log('Tạo khóa + lớp', !!courseId && !!classId, '');

  // ══ 1. BULK IMPORT HỌC SINH ══
  const su = (n) => `hs_nf_${uniq}_${n}`;
  r = await req('POST', `/teacher/classes/${classId}/students/bulk`, {
    token: teacherTok,
    json: {
      students: [
        { row: 2, full_name: 'Nguyễn Văn An', username: su('an'), password: '123456', parent_phone: '0912345678' },
        { row: 3, full_name: 'Trần Thị Bình', username: su('binh'), password: '123456', parent_phone: '' },
        { row: 4, full_name: 'Lê Văn Cường', username: su('cuong'), password: '123456' },
        { row: 5, full_name: '', username: su('loi1'), password: '123456' },       // thiếu họ tên
        { row: 6, full_name: 'Trùng Tên', username: su('an'), password: '123456' }, // trùng username
      ],
    },
  });
  log('Bulk import: 3 tạo, 2 lỗi', r.status === 201 && r.data.created === 3 && r.data.failed === 2, JSON.stringify(r.data));
  log('Bulk import: báo đúng dòng lỗi', (r.data.errors || []).map(e => e.row).sort().join(',') === '5,6', JSON.stringify(r.data.errors));

  r = await req('GET', `/teacher/classes/${classId}`, { token: teacherTok });
  log('Lớp có 3 học sinh sau import', r.ok && r.data.students.length === 3, `students=${r.data.students?.length}`);
  const students = r.data.students;
  const anId = students.find(s => s.username === su('an')).id;

  // Bulk vào lớp không phải của mình → Forbidden (dùng giáo viên khác)
  const t2User = `gv2_nf_${uniq}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: t2User, password: '123456', full_name: 'GV2', role: 'teacher' } });
  r = await req('POST', '/auth/login', { json: { username: t2User, password: '123456' } });
  const teacher2Tok = r.data.token;
  r = await req('POST', `/teacher/classes/${classId}/students/bulk`, { token: teacher2Tok, json: { students: [{ full_name: 'X', username: su('x'), password: '1' }] } });
  log('Bulk import lớp người khác bị chặn (403)', r.status === 403, `status=${r.status}`);

  // ══ 2. ROSTER BÀI TẬP ══
  // HS "an" đăng nhập và nộp bài cho bài tập còn hạn
  r = await req('POST', '/auth/login', { json: { username: su('an'), password: '123456' } });
  const anTok = r.data.token;

  const future = new Date(Date.now() + 86400000).toISOString(); // +1 ngày
  const past = new Date(Date.now() - 86400000).toISOString();   // -1 ngày (quá hạn, cùng tháng)

  const fd1 = new FormData();
  fd1.append('title', 'BT còn hạn ' + uniq);
  fd1.append('due_date', future);
  fd1.append('max_score', '10');
  r = await req('POST', `/classes/${classId}/homework`, { token: teacherTok, form: fd1 });
  const hw1 = r.data.id;

  const fd2 = new FormData();
  fd2.append('title', 'BT quá hạn ' + uniq);
  fd2.append('due_date', past);
  fd2.append('max_score', '10');
  r = await req('POST', `/classes/${classId}/homework`, { token: teacherTok, form: fd2 });
  const hw2 = r.data.id;
  log('Tạo 2 bài tập (còn hạn + quá hạn)', !!hw1 && !!hw2, '');

  // HS an nộp bài hw1 (file PDF)
  const pdfPath = path.join(tmp, 'bai-lam.pdf');
  makePdf(pdfPath, 'Bai lam cua An');
  const fdSub = new FormData();
  fdSub.append('files', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'bai-lam.pdf');
  r = await req('POST', `/homework/${hw1}/submit`, { token: anTok, form: fdSub });
  log('HS nộp bài hw1', r.ok, JSON.stringify(r.data?.message));

  // GV xem hw1: roster đủ 3 HS, 1 đã nộp, chưa quá hạn
  r = await req('GET', `/homework/${hw1}`, { token: teacherTok });
  const roster1 = r.data.roster || [];
  log('Roster hw1 đủ cả lớp (3 HS)', roster1.length === 3, `roster=${roster1.length}`);
  log('Roster hw1: đúng 1 bạn đã nộp', roster1.filter(s => s.submission_id).length === 1, '');
  log('Roster hw1: chưa quá hạn (is_overdue=false)', r.data.is_overdue === false, `is_overdue=${r.data.is_overdue}`);
  const anSubmissionId = roster1.find(s => s.submission_id)?.submission_id;

  // GV xem hw2: không ai nộp, đã quá hạn → giao diện hiện "Chưa nộp bài" + 0 điểm
  r = await req('GET', `/homework/${hw2}`, { token: teacherTok });
  const roster2 = r.data.roster || [];
  log('Roster hw2: 3 HS đều chưa nộp', roster2.length === 3 && roster2.every(s => !s.submission_id), '');
  log('Roster hw2: đã quá hạn (is_overdue=true)', r.data.is_overdue === true, `is_overdue=${r.data.is_overdue}`);

  // ══ 3. XẾP HẠNG THEO THÁNG ══
  // Chấm 8 điểm cho bài của An → An: hw1=8/10, hw2 quá hạn=0 → TB=(0.8+0)/2*10=4
  r = await req('PUT', `/submissions/${anSubmissionId}/grade`, { token: teacherTok, json: { score: 8, feedback: 'Tốt' } });
  log('GV chấm điểm bài của An', r.ok, JSON.stringify(r.data));

  r = await req('GET', `/teacher/classes/${classId}/ranking`, { token: teacherTok });
  const rk = r.data;
  const nowYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  log('Ranking: trả về tháng hiện tại', r.ok && rk.month === nowYm, `month=${rk?.month}`);
  log('Ranking: months chứa tháng hiện tại', Array.isArray(rk.months) && rk.months.includes(nowYm), JSON.stringify(rk?.months));
  const anRow = rk.students.find(s => s.id === anId);
  log('Ranking: An hạng 1, TB=4 (8/10 + 0 quá hạn)', anRow && anRow.rank === 1 && anRow.avg === 4, JSON.stringify(anRow));
  const others = rk.students.filter(s => s.id !== anId);
  log('Ranking: 2 bạn còn lại TB=0, đồng hạng 2', others.every(s => s.avg === 0 && s.rank === 2), JSON.stringify(others.map(o => ({ avg: o.avg, rank: o.rank }))));

  // Xem lại tháng cũ (không có bài tập) → không ai có điểm
  r = await req('GET', `/teacher/classes/${classId}/ranking?month=2020-01`, { token: teacherTok });
  log('Ranking tháng cũ (2020-01): không ai có điểm TB', r.ok && r.data.students.every(s => s.avg === null && s.rank === null), '');

  // GV khác xem ranking lớp này → 403
  r = await req('GET', `/teacher/classes/${classId}/ranking`, { token: teacher2Tok });
  log('Ranking lớp người khác bị chặn (403)', r.status === 403, `status=${r.status}`);

  // ══ 4. FILE ĐÍNH KÈM BÀI GIẢNG ══
  // Bài giảng KHÔNG có video — chỉ có file
  r = await req('POST', `/teacher/classes/${classId}/lessons`, { token: teacherTok, json: { title: 'Bài giảng NF (không video)' } });
  const lessonId = r.data.id;
  log('Tạo bài giảng không cần video', r.ok && !!lessonId, JSON.stringify(r.data));

  const docPath = path.join(tmp, 'tai-lieu.pdf');
  makePdf(docPath, 'Tai lieu bai giang');
  const fdDoc = new FormData();
  fdDoc.append('files', new Blob([fs.readFileSync(docPath)], { type: 'application/pdf' }), 'Tài liệu chương 1.pdf');
  fdDoc.append('kind', 'doc');
  r = await req('POST', `/teacher/lessons/${lessonId}/attachments`, { token: teacherTok, form: fdDoc });
  log('Gắn file tài liệu bài giảng', r.status === 201 && r.data.attachments.length === 1, JSON.stringify(r.data));
  log('Tên file tiếng Việt giữ đúng', r.data.attachments?.[0]?.name === 'Tài liệu chương 1.pdf', JSON.stringify(r.data.attachments?.[0]?.name));

  const ansPath = path.join(tmp, 'dap-an.pdf');
  makePdf(ansPath, 'Dap an bai tap tren lop');
  const fdAns = new FormData();
  fdAns.append('files', new Blob([fs.readFileSync(ansPath)], { type: 'application/pdf' }), 'dap-an-bt.pdf');
  fdAns.append('kind', 'answer');
  r = await req('POST', `/teacher/lessons/${lessonId}/attachments`, { token: teacherTok, form: fdAns });
  const atts = r.data.attachments || [];
  log('Gắn file đáp án BT trên lớp (tổng 2 file)', atts.length === 2 && atts.some(a => a.kind === 'answer') && atts.some(a => a.kind === 'doc'), JSON.stringify(atts));

  // File phục vụ được qua /uploads/lessons/
  const fileName = atts[0].file;
  const fres = await fetch(`http://localhost:5000/uploads/lessons/${fileName}`);
  log('File đính kèm tải được qua /uploads/lessons', fres.ok, `status=${fres.status}`);

  // Học sinh thấy attachments trong trang lớp
  r = await req('GET', `/student/my-classes/${classId}`, { token: anTok });
  const stuLesson = (r.data.lessons || []).find(l => l.id === lessonId);
  log('HS thấy file đính kèm bài giảng', stuLesson && JSON.parse(stuLesson.attachments || '[]').length === 2, '');

  // Xóa 1 file đính kèm
  r = await req('DELETE', `/teacher/lessons/${lessonId}/attachments/${fileName}`, { token: teacherTok });
  log('Xóa 1 file đính kèm (còn 1)', r.ok && r.data.attachments.length === 1, JSON.stringify(r.data));
  const fres2 = await fetch(`http://localhost:5000/uploads/lessons/${fileName}`);
  log('File đã xóa không còn trên đĩa', fres2.status === 404, `status=${fres2.status}`);

  // Xóa bài giảng → dọn nốt file còn lại
  const remainFile = r.data.attachments[0].file;
  r = await req('DELETE', `/teacher/lessons/${lessonId}`, { token: teacherTok });
  log('Xóa bài giảng', r.ok, '');
  const fres3 = await fetch(`http://localhost:5000/uploads/lessons/${remainFile}`);
  log('File của bài giảng đã xóa cũng bị dọn', fres3.status === 404, `status=${fres3.status}`);

  // ── Dọn dẹp ──
  r = await req('DELETE', `/teacher/classes/${classId}`, { token: teacherTok });
  log('Dọn: xóa lớp (kèm HS import)', r.ok, '');
  r = await req('DELETE', `/teacher/courses/${courseId}`, { token: teacherTok });
  log('Dọn: xóa khóa học', r.ok, '');
  r = await req('GET', '/teacher/all-students', { token: adminTok });
  log('Dọn: HS import đã bị xóa theo lớp', !r.data.some(s => String(s.username).startsWith(`hs_nf_${uniq}`)), '');
  await req('DELETE', `/admin/users/${teacherId}`, { token: adminTok });
  const t2 = await req('GET', '/admin/users', { token: adminTok });
  const gv2 = Array.isArray(t2.data) ? t2.data.find(u => u.username === t2User) : null;
  if (gv2) await req('DELETE', `/admin/users/${gv2.id}`, { token: adminTok });

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('\n══════ KẾT QUẢ TEST TÍNH NĂNG MỚI ══════');
  results.forEach(l => console.log(l));
  console.log(`\n  Tổng: ${pass + fail} | Đạt: ${pass} | Lỗi: ${fail}\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('LỖI:', e); process.exit(1); });
