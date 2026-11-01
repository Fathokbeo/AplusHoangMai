// Thi thử cho khách vãng lai (trang chủ).
//  - publicRouter (/api/public/mock-exams): không cần đăng nhập — xem danh sách đề, nộp bài kèm thông tin
//    học sinh, xem kết quả bằng mã bí mật trả về lúc nộp.
//  - adminRouter (/api/admin/mock-exams): admin soạn đề (giống form bài tập) và xem danh sách bài làm.
// Bài làm được chấm bằng đúng hàng đợi chấm AI của bài tập (gradingQueue, loại 'mock').
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadMockExam, uploadMockSubmission } = require('../middleware/upload');
const { enqueue, gradeMock } = require('../services/gradingQueue');
const { needsAiGrading, stripAnswers, stripHsaAnswers } = require('../services/homeworkParts');
const { computeMaxScore } = require('../services/homeworkScoring');
const { scheduleRubricGeneration, sanitizePartsConfig, sanitizeHsaConfig, sanitizeTimeLimit, originalName } = require('../services/homeworkForm');

const UPLOADS = path.join(__dirname, '../../uploads');
const rmFile = (dir, name) => {
  if (!name) return;
  const f = path.join(UPLOADS, dir, name);
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
};
const parseFiles = (json) => { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

// Kiểu bài + cấu hình câu hỏi + thang điểm từ form (dùng chung cho tạo/sửa đề)
function examConfigFromBody(body) {
  const examType = body.exam_type === 'hsa' ? 'hsa' : 'thpt';
  if (examType === 'hsa') {
    const hsaJson = sanitizeHsaConfig(body.hsa_config);
    const hsaCfg = hsaJson ? JSON.parse(hsaJson) : null;
    return { examType, partsJson: null, hsaJson, maxScore: hsaCfg ? hsaCfg.questions.length : 0 };
  }
  const partsJson = sanitizePartsConfig(body.parts_config);
  const rawSum = computeMaxScore(partsJson);
  const provided = parseFloat(body.max_score);
  return { examType, partsJson, hsaJson: null, maxScore: isFinite(provided) && provided > 0 ? provided : (rawSum != null ? rawSum : 10) };
}

// Khối lớp 1–12 (số nguyên), khác → null
function parseGrade(v) {
  const n = parseInt(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

// Đề gửi cho khách: KHÔNG có đáp án, không có file đáp án / ghi chú chấm / quy chuẩn nhận xét
function publicExam(e) {
  return {
    id: e.id, title: e.title, description: e.description, max_score: e.max_score, grade: e.grade ?? null,
    exam_type: e.exam_type === 'hsa' ? 'hsa' : 'thpt', time_limit_minutes: e.time_limit_minutes,
    has_pdf: !!e.pdf_file,
    parts_config: e.exam_type === 'hsa' ? null : stripAnswers(e.parts_config),
    hsa_config: e.exam_type === 'hsa' ? stripHsaAnswers(e.hsa_config) : null,
  };
}

// ════════════════════════════════ Công khai ════════════════════════════════
const publicRouter = express.Router();

// Chống gửi bài ồ ạt (mỗi bài làm tốn lượt AI chấm): tối đa 6 bài / giờ / IP
const RATE_WINDOW_MS = 60 * 60e3;
const RATE_MAX = 6;
const recentByIp = new Map();
function recentOf(ip) {
  const now = Date.now();
  const list = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length) recentByIp.set(ip, list); else recentByIp.delete(ip);
  return list;
}
const rateLimited = (ip) => recentOf(ip).length >= RATE_MAX;
// Chỉ tính các lần nộp THÀNH CÔNG (nhập sai thông tin rồi sửa lại không bị trừ lượt)
const recordSubmit = (ip) => recentByIp.set(ip, [...recentOf(ip), Date.now()]);

// ?grade=9 → chỉ các đề dành cho khối 9 + đề dùng chung mọi khối (grade NULL)
publicRouter.get('/', (req, res) => {
  const grade = parseGrade(req.query.grade);
  const rows = getDb().prepare(`SELECT * FROM mock_exams WHERE active=1 ${grade ? 'AND (grade IS NULL OR grade=?)' : ''} ORDER BY display_order, created_at DESC`)
    .all(...(grade ? [grade] : []));
  res.json(rows.map(publicExam));
});

publicRouter.get('/:id', (req, res) => {
  const e = getDb().prepare('SELECT * FROM mock_exams WHERE id=? AND active=1').get(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy đề thi' });
  res.json(publicExam(e));
});

// File đề (chỉ file ĐỀ — file đáp án không bao giờ phục vụ ra ngoài)
publicRouter.get('/:id/pdf', (req, res) => {
  const e = getDb().prepare('SELECT pdf_file FROM mock_exams WHERE id=? AND active=1').get(req.params.id);
  const f = e?.pdf_file ? path.join(UPLOADS, 'mock', e.pdf_file) : null;
  if (!f || !fs.existsSync(f)) return res.status(404).json({ message: 'Không tìm thấy đề thi' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(f);
});

// Nộp bài: thông tin học sinh + ảnh/PDF bài làm và/hoặc đáp án điền trên giao diện (structured_answers)
publicRouter.post('/:id/attempts', (req, res, next) => {
  if (rateLimited(req.ip)) return res.status(429).json({ message: 'Bạn đã nộp quá nhiều bài trong một giờ. Vui lòng thử lại sau.' });
  next();
}, uploadMockSubmission.any(), (req, res) => {
  const uploaded = req.files || [];
  const cleanup = () => uploaded.forEach((f) => rmFile('mock_submissions', f.filename));
  const fail = (code, message) => { cleanup(); res.status(code).json({ message }); };

  const db = getDb();
  const exam = db.prepare('SELECT * FROM mock_exams WHERE id=? AND active=1').get(req.params.id);
  if (!exam) return fail(404, 'Không tìm thấy đề thi');

  const b = req.body || {};
  const fullName = String(b.full_name || '').trim().replace(/\s+/g, ' ');
  const className = String(b.class_name || '').trim();
  const school = String(b.school || '').trim();
  const phone = String(b.parent_phone || '').replace(/[\s.-]/g, '');
  const gpa = Number(String(b.gpa ?? '').replace(',', '.'));
  if (fullName.length < 2 || fullName.length > 80) return fail(400, 'Vui lòng nhập họ tên học sinh');
  const grade = parseGrade(b.grade);
  if (!grade) return fail(400, 'Vui lòng chọn khối lớp');
  if (!className || className.length > 30) return fail(400, 'Vui lòng nhập lớp');
  if (!school || school.length > 120) return fail(400, 'Vui lòng nhập trường');
  if (String(b.gpa ?? '').trim() === '' || !Number.isFinite(gpa) || gpa < 0 || gpa > 10) return fail(400, 'Điểm trung bình kì gần nhất phải từ 0 đến 10');
  if (!/^(\+84|0)\d{9,10}$/.test(phone)) return fail(400, 'Số điện thoại phụ huynh không hợp lệ');

  let structuredJson = null;
  if (b.structured_answers) {
    try {
      const parsed = JSON.parse(b.structured_answers);
      if (parsed && typeof parsed === 'object') structuredJson = JSON.stringify(parsed);
    } catch { /* bỏ qua nếu không hợp lệ */ }
  }
  if (uploaded.length === 0 && !structuredJson) return fail(400, 'Cần điền bài làm hoặc nộp ít nhất một file');

  const aiGrade = needsAiGrading(exam);
  const token = crypto.randomBytes(18).toString('hex');
  const r = db.prepare(`
    INSERT INTO mock_attempts (exam_id,full_name,grade,class_name,school,gpa,parent_phone,files,structured_answers,access_token,ip,submitted_at,grading_status,grading_attempts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)
  `).run(exam.id, fullName, grade, className, school, Math.round(gpa * 100) / 100, phone,
    uploaded.length ? JSON.stringify(uploaded.map((f) => f.filename)) : null, structuredJson,
    token, req.ip, new Date().toISOString(), aiGrade ? 'pending' : null);
  recordSubmit(req.ip);
  if (aiGrade) enqueue(r.lastInsertRowid, 'mock');
  res.status(201).json({ id: r.lastInsertRowid, token, grading: aiGrade });
});

// Kết quả bài làm — chỉ người giữ mã bí mật (trả về lúc nộp) xem được
publicRouter.get('/attempts/:id', (req, res) => {
  const a = getDb().prepare(`
    SELECT a.*, e.title exam_title, e.max_score, e.exam_type FROM mock_attempts a JOIN mock_exams e ON a.exam_id=e.id WHERE a.id=?
  `).get(req.params.id);
  const token = String(req.query.token || '');
  if (!a || !token || token.length !== a.access_token.length
    || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(a.access_token))) {
    return res.status(404).json({ message: 'Không tìm thấy bài làm' });
  }
  let details = null;
  try { details = a.grading_details ? JSON.parse(a.grading_details) : null; } catch { details = null; }
  res.json({
    id: a.id, exam_title: a.exam_title, exam_type: a.exam_type, max_score: a.max_score, full_name: a.full_name,
    grade: a.grade, class_name: a.class_name, school: a.school, gpa: a.gpa, parent_phone: a.parent_phone,
    submitted_at: a.submitted_at, grading_status: a.grading_status,
    score: a.score, feedback: a.score !== null ? a.feedback : null, grading_details: a.score !== null ? details : null,
  });
});

// ════════════════════════════════ Admin ════════════════════════════════
const adminRouter = express.Router();
adminRouter.use(authMiddleware, requireRole('admin'));

adminRouter.get('/', (req, res) => {
  res.json(getDb().prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM mock_attempts a WHERE a.exam_id=e.id) attempt_count
    FROM mock_exams e ORDER BY e.display_order, e.created_at DESC
  `).all());
});

const examFiles = uploadMockExam.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]);

adminRouter.post('/', examFiles, (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ message: 'Cần tiêu đề đề thi' });
  const { examType, partsJson, hsaJson, maxScore } = examConfigFromBody(b);
  const pdf = req.files?.pdf_file?.[0];
  const ans = req.files?.answer_file?.[0];
  const r = getDb().prepare(`
    INSERT INTO mock_exams (title,description,pdf_file,pdf_name,answer_file,answer_name,max_score,grading_note,parts_config,exam_type,hsa_config,time_limit_minutes,display_order,active,created_by,grade)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(String(b.title).trim(), b.description || null, pdf?.filename || null, originalName(pdf), ans?.filename || null, originalName(ans),
    maxScore, b.grading_note || null, partsJson, examType, hsaJson, sanitizeTimeLimit(b.time_limit_minutes),
    parseInt(b.display_order) || 0, b.active === '0' || b.active === 'false' ? 0 : 1, req.user.id, parseGrade(b.grade));
  scheduleRubricGeneration(r.lastInsertRowid, ans?.filename || null, partsJson, { table: 'mock_exams', uploadDir: 'mock' });
  res.status(201).json({ id: r.lastInsertRowid });
});

adminRouter.put('/:id', examFiles, (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM mock_exams WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy đề thi' });
  const b = req.body || {};
  const sets = []; const vals = [];
  const set = (col, v) => { sets.push(`${col}=?`); vals.push(v); };
  if (b.title !== undefined) { if (!String(b.title).trim()) return res.status(400).json({ message: 'Cần tiêu đề đề thi' }); set('title', String(b.title).trim()); }
  if (b.description !== undefined) set('description', b.description || null);
  if (b.grading_note !== undefined) set('grading_note', b.grading_note || null);
  if (b.time_limit_minutes !== undefined) set('time_limit_minutes', sanitizeTimeLimit(b.time_limit_minutes));
  if (b.display_order !== undefined) set('display_order', parseInt(b.display_order) || 0);
  if (b.grade !== undefined) set('grade', parseGrade(b.grade));
  if (b.active !== undefined) set('active', b.active === '0' || b.active === 'false' ? 0 : 1);
  let partsJson;
  if (b.exam_type !== undefined) {
    const cfg = examConfigFromBody(b);
    partsJson = cfg.partsJson;
    set('exam_type', cfg.examType); set('parts_config', cfg.partsJson); set('hsa_config', cfg.hsaJson); set('max_score', cfg.maxScore);
  }
  const pdf = req.files?.pdf_file?.[0];
  const ans = req.files?.answer_file?.[0];
  if (pdf) { set('pdf_file', pdf.filename); set('pdf_name', originalName(pdf)); rmFile('mock', e.pdf_file); }
  if (ans) { set('answer_file', ans.filename); set('answer_name', originalName(ans)); rmFile('mock', e.answer_file); }
  if (sets.length) { vals.push(e.id); db.prepare(`UPDATE mock_exams SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  if (partsJson !== undefined || ans) {
    scheduleRubricGeneration(e.id, ans?.filename || e.answer_file, partsJson !== undefined ? partsJson : e.parts_config, { table: 'mock_exams', uploadDir: 'mock' });
  }
  res.json({ message: 'Đã cập nhật' });
});

// Xóa file đề / file đáp án đã đính kèm (kind: 'pdf' | 'answer')
adminRouter.delete('/:id/files/:kind', (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM mock_exams WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy đề thi' });
  if (req.params.kind === 'pdf') { rmFile('mock', e.pdf_file); db.prepare('UPDATE mock_exams SET pdf_file=NULL,pdf_name=NULL WHERE id=?').run(e.id); }
  else if (req.params.kind === 'answer') { rmFile('mock', e.answer_file); db.prepare('UPDATE mock_exams SET answer_file=NULL,answer_name=NULL,feedback_rubric=NULL WHERE id=?').run(e.id); }
  else return res.status(400).json({ message: 'Loại file không hợp lệ' });
  res.json({ message: 'Đã xóa file' });
});

// Xóa đề: xóa luôn mọi bài làm của đề đó (kèm file)
adminRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM mock_exams WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ message: 'Không tìm thấy đề thi' });
  const attempts = db.prepare('SELECT files FROM mock_attempts WHERE exam_id=?').all(e.id);
  attempts.forEach((a) => parseFiles(a.files).forEach((f) => rmFile('mock_submissions', f)));
  db.transaction(() => {
    db.prepare('DELETE FROM mock_attempts WHERE exam_id=?').run(e.id);
    db.prepare('DELETE FROM mock_exams WHERE id=?').run(e.id);
  })();
  rmFile('mock', e.pdf_file); rmFile('mock', e.answer_file);
  res.json({ message: 'Đã xóa đề thi' });
});

// Danh sách bài làm (mới nhất trước); ?exam_id= để lọc theo đề
adminRouter.get('/attempts/list', (req, res) => {
  const examId = parseInt(req.query.exam_id);
  const rows = getDb().prepare(`
    SELECT a.id, a.exam_id, a.full_name, a.grade, a.class_name, a.school, a.gpa, a.parent_phone, a.files, a.structured_answers,
           a.submitted_at, a.score, a.feedback, a.grading_details, a.graded_by_ai, a.grading_status,
           e.title exam_title, e.max_score, e.exam_type
    FROM mock_attempts a JOIN mock_exams e ON a.exam_id=e.id
    ${Number.isFinite(examId) ? 'WHERE a.exam_id=?' : ''}
    ORDER BY a.submitted_at DESC
  `).all(...(Number.isFinite(examId) ? [examId] : []));
  res.json(rows.map((r) => ({ ...r, files: parseFiles(r.files) })));
});

adminRouter.post('/attempts/:id/regrade', async (req, res) => {
  try {
    const result = await gradeMock(Number(req.params.id), { force: true });
    if (!result) return res.status(400).json({ message: 'Đề chưa có đáp án để chấm tự động' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: `Chấm lại lỗi: ${err.message}` });
  }
});

adminRouter.delete('/attempts/:id', (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT files FROM mock_attempts WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy bài làm' });
  parseFiles(a.files).forEach((f) => rmFile('mock_submissions', f));
  db.prepare('DELETE FROM mock_attempts WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa bài làm' });
});

module.exports = { publicRouter, adminRouter };
