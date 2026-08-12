/**
 * Comprehensive end-to-end test for APLUS Hoàng Mai app.
 * Exercises every API endpoint across admin / teacher / student roles.
 * Run: node test-all.js   (server must be running on :5000)
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

// minimal valid 1-page PDF
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

function fileForm(fields, fileField, filePath, mime) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (filePath) {
    const buf = fs.readFileSync(filePath);
    fd.append(fileField, new Blob([buf], { type: mime }), path.basename(filePath));
  }
  return fd;
}

(async () => {
  console.log('\n═══════════════════════════════════════════');
  console.log('   APLUS HOÀNG MAI — FULL FEATURE TEST');
  console.log('═══════════════════════════════════════════\n');

  const ts = Date.now();
  const tmp = path.join(__dirname, 'test-tmp');
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  const answerPdf = path.join(tmp, 'answer.pdf');
  const subPdf = path.join(tmp, 'submission.pdf');
  const adImg = path.join(tmp, 'ad.png');
  makePdf(answerPdf, 'Dap an: 1+1=2, 2x3=6');
  makePdf(subPdf, 'Bai lam: 1+1=2, 2x3=6');
  // tiny 1x1 PNG
  fs.writeFileSync(adImg, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5f0000000049454e44ae426082', 'hex'));

  // ─── AUTH ───────────────────────────────────────────────
  console.log('── 1. XÁC THỰC (AUTH) ──');
  let adminTok, teacherTok, studentTok;

  let r = await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } });
  log('Admin đăng nhập', r.ok && r.data.token, JSON.stringify(r.data));
  adminTok = r.data?.token;

  r = await req('POST', '/auth/login', { json: { username: 'admin', password: 'sai_mat_khau' } });
  log('Từ chối mật khẩu sai', r.status === 401, `status ${r.status}`);

  r = await req('GET', '/auth/me', { token: adminTok });
  log('GET /auth/me trả về user', r.ok && r.data.role === 'admin', JSON.stringify(r.data));

  r = await req('GET', '/admin/stats', {});
  log('Chặn truy cập không token', r.status === 401, `status ${r.status}`);

  // ─── ADMIN: USERS ───────────────────────────────────────
  console.log('\n── 2. ADMIN: QUẢN LÝ TÀI KHOẢN ──');
  r = await req('GET', '/admin/stats', { token: adminTok });
  log('Xem thống kê', r.ok && typeof r.data.totalStudents === 'number', JSON.stringify(r.data));

  const tUser = `gv_${ts}`;
  r = await req('POST', '/admin/users', { token: adminTok, json: { username: tUser, password: '123456', full_name: 'GV Test', role: 'teacher' } });
  log('Tạo tài khoản giáo viên', r.ok && r.data.id, JSON.stringify(r.data));
  const newTeacherId = r.data?.id;

  const sUser = `hs_${ts}`;
  r = await req('POST', '/admin/users', { token: adminTok, json: { username: sUser, password: '123456', full_name: 'HS Test', role: 'student' } });
  log('Tạo tài khoản học sinh', r.ok && r.data.id, JSON.stringify(r.data));

  r = await req('POST', '/admin/users', { token: adminTok, json: { username: tUser, password: '123456', full_name: 'Trùng', role: 'teacher' } });
  log('Chặn username trùng', r.status === 400, `status ${r.status}`);

  r = await req('GET', '/admin/users?role=teacher', { token: adminTok });
  log('Liệt kê giáo viên', r.ok && Array.isArray(r.data), JSON.stringify(r.data).slice(0, 80));

  r = await req('PUT', `/admin/users/${newTeacherId}`, { token: adminTok, json: { full_name: 'GV Đã Sửa' } });
  log('Cập nhật tài khoản', r.ok, JSON.stringify(r.data));

  // login as the new teacher
  r = await req('POST', '/auth/login', { json: { username: tUser, password: '123456' } });
  log('Giáo viên mới đăng nhập', r.ok && r.data.token, JSON.stringify(r.data));
  teacherTok = r.data?.token;

  r = await req('POST', '/auth/login', { json: { username: sUser, password: '123456' } });
  log('Học sinh đăng nhập', r.ok && r.data.token, JSON.stringify(r.data));
  studentTok = r.data?.token;

  // ─── ADMIN: ADVERTISEMENTS ──────────────────────────────
  console.log('\n── 3. ADMIN: QUẢNG CÁO ──');
  r = await req('POST', '/admin/ads', { token: adminTok, form: fileForm({ title: 'QC Test', order: '1' }, 'image', adImg, 'image/png') });
  log('Tải lên banner quảng cáo', r.ok && r.data.id, JSON.stringify(r.data));
  const adId = r.data?.id;

  r = await req('GET', '/admin/ads', { token: adminTok });
  log('Liệt kê quảng cáo', r.ok && Array.isArray(r.data), '');

  r = await req('PUT', `/admin/ads/${adId}`, { token: adminTok, json: { title: 'QC Sửa', active: true } });
  log('Cập nhật quảng cáo', r.ok, JSON.stringify(r.data));

  r = await req('GET', '/public/ads', {});
  log('Public xem quảng cáo (không cần login)', r.ok && Array.isArray(r.data), '');

  // ─── TEACHER: COURSES ───────────────────────────────────
  console.log('\n── 4. GIÁO VIÊN: KHÓA HỌC ──');
  r = await req('POST', '/teacher/courses', { token: teacherTok, json: { title: 'Toán 9', description: 'Ôn thi vào 10' } });
  log('Giáo viên tạo khóa học', r.ok && r.data.id, JSON.stringify(r.data));
  const courseId = r.data?.id;

  r = await req('POST', `/teacher/courses/${courseId}/thumbnail`, { token: teacherTok, form: fileForm({}, 'thumbnail', adImg, 'image/png') });
  log('Tải ảnh đại diện khóa học', r.ok && r.data.thumbnail, JSON.stringify(r.data));

  r = await req('GET', '/teacher/my-courses', { token: teacherTok });
  log('Giáo viên xem khóa học của mình', r.ok && r.data.some(c => c.id === courseId), `count=${r.data?.length}`);

  r = await req('GET', `/teacher/courses/${courseId}`, { token: teacherTok });
  log('Xem chi tiết khóa học + danh sách lớp', r.ok && Array.isArray(r.data.classes), JSON.stringify(r.data).slice(0, 80));

  r = await req('PUT', `/teacher/courses/${courseId}`, { token: teacherTok, json: { description: 'Mô tả mới' } });
  log('Cập nhật khóa học', r.ok, JSON.stringify(r.data));

  // ─── TEACHER: CLASSES (inside course) ───────────────────
  console.log('\n── 5. GIÁO VIÊN: LỚP HỌC (trong khóa) ──');
  r = await req('POST', `/teacher/courses/${courseId}/classes`, { token: teacherTok, json: { title: 'Lớp 9A', description: 'Buổi tối' } });
  log('Tạo lớp học trong khóa', r.ok && r.data.id, JSON.stringify(r.data));
  const classId = r.data?.id;

  r = await req('GET', `/teacher/courses/${courseId}`, { token: teacherTok });
  log('Lớp xuất hiện trong khóa', r.ok && r.data.classes.some(c => c.id === classId), `classes=${r.data?.classes?.length}`);

  r = await req('GET', `/teacher/classes/${classId}`, { token: teacherTok });
  log('Xem chi tiết lớp (students/lessons/homework)', r.ok && Array.isArray(r.data.students) && Array.isArray(r.data.lessons), '');

  // ─── TEACHER: STUDENTS ──────────────────────────────────
  console.log('\n── 6. GIÁO VIÊN: HỌC SINH ──');
  const tsUser = `hsgv_${ts}`;
  r = await req('POST', '/teacher/students', { token: teacherTok, json: { username: tsUser, password: '123456', full_name: 'HS Của GV' } });
  log('Giáo viên tạo học sinh', r.ok && r.data.id, JSON.stringify(r.data));
  const teacherStudentId = r.data?.id;

  r = await req('GET', '/teacher/all-students', { token: teacherTok });
  log('Xem tất cả học sinh', r.ok && Array.isArray(r.data), `count=${r.data?.length}`);

  r = await req('POST', `/teacher/classes/${classId}/students`, { token: teacherTok, json: { student_id: teacherStudentId } });
  log('Thêm học sinh vào lớp', r.ok, JSON.stringify(r.data));

  r = await req('POST', `/teacher/classes/${classId}/students`, { token: teacherTok, json: { student_id: teacherStudentId } });
  log('Chặn thêm học sinh trùng', r.status === 400, `status ${r.status}`);

  r = await req('GET', `/teacher/classes/${classId}`, { token: teacherTok });
  log('Học sinh có trong danh sách lớp', r.ok && r.data.students.some(s => s.id === teacherStudentId), '');

  // ─── TEACHER: LESSONS ───────────────────────────────────
  console.log('\n── 7. GIÁO VIÊN: BÀI GIẢNG ──');
  r = await req('POST', `/teacher/classes/${classId}/lessons`, { token: teacherTok, json: { title: 'Bài 1: Hàm số', video_url: 'https://youtube.com/watch?v=abc', video_type: 'youtube', lesson_order: 1 } });
  log('Tạo bài giảng (YouTube)', r.ok && r.data.id, JSON.stringify(r.data));
  const lessonId = r.data?.id;

  r = await req('PUT', `/teacher/lessons/${lessonId}`, { token: teacherTok, json: { title: 'Bài 1: Hàm số bậc nhất' } });
  log('Cập nhật bài giảng', r.ok, JSON.stringify(r.data));

  // ─── TEACHER: HOMEWORK (with AI answer key) ─────────────
  console.log('\n── 8. GIÁO VIÊN: BÀI TẬP (kèm đáp án AI) ──');
  r = await req('POST', `/classes/${classId}/homework`, { token: teacherTok, form: fileForm({ title: 'BT số 1', description: 'Làm hết', max_score: '10' }, 'answer_file', answerPdf, 'application/pdf') });
  log('Tạo bài tập kèm file đáp án', r.ok && r.data.id, JSON.stringify(r.data));
  const hwId = r.data?.id;

  r = await req('GET', `/homework/${hwId}`, { token: teacherTok });
  log('Giáo viên xem bài tập + submissions', r.ok && Array.isArray(r.data.submissions), '');

  // ─── STUDENT: VIEW & SUBMIT ─────────────────────────────
  console.log('\n── 9. HỌC SINH: XEM & NỘP BÀI ──');
  // need to log in as the teacher-created student who is enrolled
  r = await req('POST', '/auth/login', { json: { username: tsUser, password: '123456' } });
  const enrolledStudentTok = r.data?.token;
  log('Học sinh (đã vào lớp) đăng nhập', r.ok && enrolledStudentTok, '');

  r = await req('GET', '/student/my-classes', { token: enrolledStudentTok });
  log('Học sinh xem lớp của mình', r.ok && r.data.some(c => c.id === classId), `count=${r.data?.length}`);

  r = await req('GET', `/student/my-classes/${classId}`, { token: enrolledStudentTok });
  log('Xem chi tiết lớp (bài giảng + bài tập)', r.ok && Array.isArray(r.data.lessons) && Array.isArray(r.data.homework), '');

  r = await req('GET', '/student/stats', { token: enrolledStudentTok });
  log('Xem thống kê học sinh', r.ok && typeof r.data.classCount === 'number', JSON.stringify(r.data));

  r = await req('GET', `/student/my-classes/${classId}`, { token: studentTok });
  log('Chặn học sinh không thuộc lớp', r.status === 403, `status ${r.status}`);

  console.log('   ⏳ Đang nộp bài + chấm điểm bằng AI (Gemini, có thể mất 10-30s)...');
  r = await req('POST', `/homework/${hwId}/submit`, { token: enrolledStudentTok, form: fileForm({}, 'file', subPdf, 'application/pdf') });
  log('Học sinh nộp bài', r.ok && r.data.submission, JSON.stringify(r.data).slice(0, 120));
  const submission = r.data?.submission;
  const submissionId = submission?.id;
  log('AI tự động chấm điểm (có score)', submission && submission.score !== null && submission.score !== undefined, `score=${submission?.score}, feedback=${(submission?.feedback||'').slice(0,60)}`);

  // ─── TEACHER: GRADE / REGRADE ───────────────────────────
  console.log('\n── 10. GIÁO VIÊN: CHẤM ĐIỂM ──');
  if (submissionId) {
    r = await req('PUT', `/submissions/${submissionId}/grade`, { token: teacherTok, json: { score: 9.5, feedback: 'Tốt, trình bày đẹp' } });
    log('Giáo viên chấm điểm thủ công', r.ok, JSON.stringify(r.data));

    console.log('   ⏳ Đang chấm lại bằng AI...');
    r = await req('POST', `/submissions/${submissionId}/regrade`, { token: teacherTok });
    log('Chấm lại bằng AI', r.ok && r.data.score !== undefined, `score=${r.data?.score}`);
  } else {
    log('Giáo viên chấm điểm thủ công', false, 'không có submissionId');
  }

  // ─── ADMIN: COURSES & CLASSES OVERSIGHT ─────────────────
  console.log('\n── 11. ADMIN: GIÁM SÁT KHÓA HỌC & LỚP ──');
  r = await req('POST', '/admin/courses', { token: adminTok, json: { title: 'Khóa Admin', description: 'Do admin tạo' } });
  log('Admin tạo khóa học', r.ok && r.data.id, JSON.stringify(r.data));
  const adminCourseId = r.data?.id;

  r = await req('POST', `/admin/courses/${adminCourseId}/classes`, { token: adminTok, json: { title: 'Lớp do Admin tạo' } });
  log('Admin thêm lớp vào khóa', r.ok && r.data.id, JSON.stringify(r.data));

  // Admin thêm lớp vào khóa của GIÁO VIÊN khác (courseId, do teacherTok/newTeacherId phụ trách)
  // → lớp phải theo giáo viên phụ trách khóa đó, không phải bị gán cho admin.
  r = await req('POST', `/admin/courses/${courseId}/classes`, { token: adminTok, json: { title: 'Lớp do Admin thêm vào khóa GV' } });
  const adminAddedClassId = r.data?.id;
  r = await req('GET', '/admin/classes', { token: adminTok });
  const adminAddedClass = r.data?.find(c => c.id === adminAddedClassId);
  log('Lớp do admin thêm vào khóa GV vẫn thuộc GV phụ trách khóa (không phải admin)', adminAddedClass && adminAddedClass.teacher_id === newTeacherId, `teacher_id=${adminAddedClass?.teacher_id}, expected=${newTeacherId}`);

  r = await req('GET', `/admin/courses/${adminCourseId}/detail`, { token: adminTok });
  log('Admin xem chi tiết khóa + lớp', r.ok && Array.isArray(r.data.classes) && r.data.classes.length > 0, `classes=${r.data?.classes?.length}`);

  r = await req('GET', '/admin/courses', { token: adminTok });
  log('Admin xem tất cả khóa học', r.ok && Array.isArray(r.data), `count=${r.data?.length}`);

  r = await req('GET', '/admin/classes', { token: adminTok });
  log('Admin xem tất cả lớp học', r.ok && Array.isArray(r.data), `count=${r.data?.length}`);

  r = await req('POST', `/admin/courses/${courseId}/teachers`, { token: adminTok, json: { teacher_id: newTeacherId, can_edit: true } });
  log('Admin gán giáo viên vào khóa', r.ok, JSON.stringify(r.data));

  r = await req('GET', `/admin/courses/${courseId}/teachers`, { token: adminTok });
  log('Xem giáo viên của khóa', r.ok && Array.isArray(r.data), '');

  // ─── PERMISSION CHECKS ──────────────────────────────────
  console.log('\n── 12. KIỂM TRA PHÂN QUYỀN ──');
  r = await req('GET', '/admin/stats', { token: teacherTok });
  log('Giáo viên KHÔNG vào được admin', r.status === 403, `status ${r.status}`);

  r = await req('GET', '/teacher/my-courses', { token: studentTok });
  log('Học sinh KHÔNG vào được teacher', r.status === 403, `status ${r.status}`);

  r = await req('POST', '/teacher/courses', { token: studentTok, json: { title: 'Hack' } });
  log('Học sinh KHÔNG tạo được khóa học', r.status === 403, `status ${r.status}`);

  // teacher cannot edit another teacher's course
  r = await req('PUT', `/teacher/courses/${adminCourseId}`, { token: teacherTok, json: { title: 'Chiếm khóa' } });
  log('GV không sửa được khóa của người khác', r.status === 403, `status ${r.status}`);

  // ─── CLEANUP ────────────────────────────────────────────
  console.log('\n── 13. DỌN DẸP (DELETE) ──');
  r = await req('DELETE', `/teacher/lessons/${lessonId}`, { token: teacherTok });
  log('Xóa bài giảng', r.ok, '');
  r = await req('DELETE', `/homework/${hwId}`, { token: teacherTok });
  log('Xóa bài tập', r.ok, '');
  r = await req('DELETE', `/teacher/classes/${classId}/students/${teacherStudentId}`, { token: teacherTok });
  log('Xóa học sinh khỏi lớp', r.ok, '');
  r = await req('DELETE', `/teacher/classes/${classId}`, { token: teacherTok });
  log('Xóa lớp học', r.ok, '');
  r = await req('DELETE', `/teacher/courses/${courseId}`, { token: teacherTok });
  log('Xóa khóa học', r.ok, '');
  r = await req('DELETE', `/admin/ads/${adId}`, { token: adminTok });
  log('Xóa quảng cáo', r.ok, '');
  r = await req('DELETE', `/admin/users/${newTeacherId}`, { token: adminTok });
  log('Xóa tài khoản (vô hiệu hóa)', r.ok, '');

  // ─── REPORT ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('   KẾT QUẢ CHI TIẾT');
  console.log('═══════════════════════════════════════════');
  results.forEach(l => console.log(l));
  console.log('\n═══════════════════════════════════════════');
  console.log(`   TỔNG: ${pass + fail} test  |  ✅ ${pass} PASS  |  ❌ ${fail} FAIL`);
  console.log('═══════════════════════════════════════════\n');

  // cleanup tmp
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
