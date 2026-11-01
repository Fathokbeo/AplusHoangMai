const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadHomework, uploadSubmission } = require('../middleware/upload');
const { enqueue, gradeOne } = require('../services/gradingQueue');
const { needsAiGrading, stripAnswers, stripHsaAnswers } = require('../services/homeworkParts');
const { computeMaxScore } = require('../services/homeworkScoring');
const { compareVietnameseName } = require('../services/vietnameseName');
const { redactSecrets } = require('../services/security');
const { scheduleRubricGeneration, sanitizePartsConfig, sanitizeHsaConfig, sanitizeTimeLimit, originalName } = require('../services/homeworkForm');
const { archiveBeforeResubmit, settleBest, parseBest, bestFilenames } = require('../services/bestAttempt');

router.use(authMiddleware);

function rmHomeworkFile(name) {
  if (!name) return;
  const f = path.join(__dirname, '../../uploads/homework', name);
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
}

// Lấy danh sách tên file của một bài nộp (hỗ trợ cũ: file_path đơn, mới: files JSON)
function submissionFilenames(sub) {
  if (sub && sub.files) {
    try { const a = JSON.parse(sub.files); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ }
  }
  return sub && sub.file_path ? [sub.file_path] : [];
}

// Bài nộp đang chờ chấm lần mới (score NULL) nhưng có lần trước đã có điểm → trả về kết quả lần
// trước (điểm cao nhất hiện có), kèm cờ showing_best để giao diện báo "đang chấm lần nộp mới".
function withBestFallback(sub) {
  const best = sub.score === null || sub.score === undefined ? parseBest(sub.best_attempt) : null;
  if (!best) return sub;
  return { ...sub, score: best.score, feedback: best.feedback, grading_details: best.grading_details, graded_at: best.graded_at, graded_by_ai: best.graded_by_ai, showing_best: true };
}

// ── Create homework (teacher/admin) ────────────────────────────────────
router.post(
  '/classes/:classId/homework',
  requireRole('teacher', 'admin'),
  uploadHomework.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]),
  (req, res) => {
    const { title, description, due_date, answer_visible_date, max_score, grading_note, chapter_id, solution_video_url, parts_config, hw_order, max_attempts, exam_type, hsa_config, time_limit_minutes } = req.body;
    if (!title) return res.status(400).json({ message: 'Cần tiêu đề bài tập' });
    const db = getDb();
    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
    if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const examType = exam_type === 'hsa' ? 'hsa' : 'thpt';
    let partsJson = null;
    let hsaJson = null;
    let finalMax;
    if (examType === 'hsa') {
      // HSA: mỗi câu 1 điểm, thang điểm = số câu — KHÔNG cho giáo viên chọn/quy đổi.
      hsaJson = sanitizeHsaConfig(hsa_config);
      const hsaCfg = hsaJson ? JSON.parse(hsaJson) : null;
      finalMax = hsaCfg ? hsaCfg.questions.length : 0;
    } else {
      partsJson = sanitizePartsConfig(parts_config);
      // Thang điểm = thang giáo viên chọn (để quy đổi). Nếu không nhập → mặc định = tổng điểm thô các câu.
      const rawSum = computeMaxScore(partsJson);
      const provided = parseFloat(max_score);
      finalMax = isFinite(provided) && provided > 0 ? provided : (rawSum != null ? rawSum : 10);
    }
    // Giới hạn số lần nộp bài: số nguyên dương, để trống/0 = không giới hạn
    const attemptsLimit = parseInt(max_attempts);
    const finalMaxAttempts = Number.isFinite(attemptsLimit) && attemptsLimit > 0 ? attemptsLimit : null;
    // Thời gian làm bài (phút, tính từ lúc bấm "Làm bài") — chỉ có ý nghĩa với bài HSA.
    const finalTimeLimit = examType === 'hsa' ? sanitizeTimeLimit(time_limit_minutes) : null;

    const result = db.prepare(`
      INSERT INTO homework (class_id,title,description,pdf_file,answer_file,due_date,answer_visible_date,max_score,grading_note,chapter_id,solution_video_url,parts_config,hw_order,max_attempts,exam_type,hsa_config,time_limit_minutes,pdf_name,answer_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.params.classId, title, description || null,
      req.files?.pdf_file?.[0]?.filename || null,
      req.files?.answer_file?.[0]?.filename || null,
      due_date || null, answer_visible_date || null, finalMax,
      grading_note || null, chapter_id || null, solution_video_url || null,
      partsJson, parseInt(hw_order) || 0, finalMaxAttempts, examType, hsaJson, finalTimeLimit,
      originalName(req.files?.pdf_file?.[0]), originalName(req.files?.answer_file?.[0])
    );
    scheduleRubricGeneration(result.lastInsertRowid, req.files?.answer_file?.[0]?.filename || null, partsJson);
    res.status(201).json({ id: result.lastInsertRowid, title });
  }
);

// ── Update homework ────────────────────────────────────────────────────
router.put(
  '/homework/:id',
  requireRole('teacher', 'admin'),
  uploadHomework.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]),
  (req, res) => {
    const { title, description, due_date, answer_visible_date, max_score, grading_note, chapter_id, solution_video_url, parts_config, hw_order, max_attempts, exam_type, hsa_config, time_limit_minutes } = req.body;
    const db = getDb();
    const hw = db.prepare('SELECT h.*,c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
    if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
    if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const sets = []; const vals = [];
    if (title) { sets.push('title=?'); vals.push(title); }
    if (description !== undefined) { sets.push('description=?'); vals.push(description); }
    if (due_date !== undefined) { sets.push('due_date=?'); vals.push(due_date || null); }
    if (answer_visible_date !== undefined) { sets.push('answer_visible_date=?'); vals.push(answer_visible_date || null); }
    if (grading_note !== undefined) { sets.push('grading_note=?'); vals.push(grading_note || null); }
    if (chapter_id !== undefined) { sets.push('chapter_id=?'); vals.push(chapter_id || null); }
    if (solution_video_url !== undefined) { sets.push('solution_video_url=?'); vals.push(solution_video_url || null); }
    if (hw_order !== undefined) { sets.push('hw_order=?'); vals.push(parseInt(hw_order) || 0); }
    if (max_attempts !== undefined) {
      const attemptsLimit = parseInt(max_attempts);
      sets.push('max_attempts=?'); vals.push(Number.isFinite(attemptsLimit) && attemptsLimit > 0 ? attemptsLimit : null);
    }

    // Kiểu bài (THPT/HSA) + cấu hình câu hỏi + thang điểm: cập nhật ATOMIC khi request có "exam_type"
    // (form giáo viên luôn gửi kèm cả 3) — tránh lẫn cấu hình THPT/HSA cũ khi đổi kiểu bài giữa 2 lần lưu.
    let partsJson; // hoisted: dùng lại bên dưới để biết có cần soạn lại "quy chuẩn nhận xét" không
    if (exam_type !== undefined) {
      const newExamType = exam_type === 'hsa' ? 'hsa' : 'thpt';
      sets.push('exam_type=?'); vals.push(newExamType);
      // Thời gian làm bài (phút): chỉ có ý nghĩa với HSA — đổi sang THPT thì bỏ giới hạn này.
      sets.push('time_limit_minutes=?'); vals.push(newExamType === 'hsa' ? sanitizeTimeLimit(time_limit_minutes) : null);
      if (newExamType === 'hsa') {
        const hsaJson = sanitizeHsaConfig(hsa_config);
        sets.push('hsa_config=?'); vals.push(hsaJson);
        sets.push('parts_config=?'); vals.push(null);
        partsJson = null;
        const hsaCfg = hsaJson ? JSON.parse(hsaJson) : null;
        sets.push('max_score=?'); vals.push(hsaCfg ? hsaCfg.questions.length : 0);
      } else {
        partsJson = sanitizePartsConfig(parts_config);
        sets.push('parts_config=?'); vals.push(partsJson);
        sets.push('hsa_config=?'); vals.push(null);
        const rawSum = computeMaxScore(partsJson);
        const provided = parseFloat(max_score);
        sets.push('max_score=?'); vals.push(isFinite(provided) && provided > 0 ? provided : (rawSum != null ? rawSum : 10));
      }
    } else if (parts_config !== undefined) {
      // Gọi không kèm exam_type (vd tích hợp cũ): giữ hành vi trước đây, chỉ cập nhật parts_config + max_score
      partsJson = sanitizePartsConfig(parts_config);
      sets.push('parts_config=?'); vals.push(partsJson);
      const rawSum = computeMaxScore(partsJson);
      const provided = parseFloat(max_score);
      if (isFinite(provided) && provided > 0) { sets.push('max_score=?'); vals.push(provided); }
      else if (rawSum != null) { sets.push('max_score=?'); vals.push(rawSum); }
      // Sửa thời gian làm bài mà không đổi kiểu bài (giữ nguyên HSA hiện tại)
      if (time_limit_minutes !== undefined && hw.exam_type === 'hsa') { sets.push('time_limit_minutes=?'); vals.push(sanitizeTimeLimit(time_limit_minutes)); }
    } else {
      if (time_limit_minutes !== undefined && hw.exam_type === 'hsa') { sets.push('time_limit_minutes=?'); vals.push(sanitizeTimeLimit(time_limit_minutes)); }
      const provided = parseFloat(max_score);
      if (isFinite(provided) && provided > 0) { sets.push('max_score=?'); vals.push(provided); }
    }

    const newAnswerFile = req.files?.answer_file?.[0]?.filename;
    // Thay file mới → xóa file cũ trên đĩa, lưu kèm tên gốc để hiện trong form sửa
    if (req.files?.pdf_file?.[0]) {
      sets.push('pdf_file=?', 'pdf_name=?'); vals.push(req.files.pdf_file[0].filename, originalName(req.files.pdf_file[0]));
      rmHomeworkFile(hw.pdf_file);
    }
    if (newAnswerFile) {
      sets.push('answer_file=?', 'answer_name=?'); vals.push(newAnswerFile, originalName(req.files.answer_file[0]));
      rmHomeworkFile(hw.answer_file);
    }

    if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE homework SET ${sets.join(',')} WHERE id=?`).run(...vals); }

    // Đáp án (file hoặc key objective) vừa đổi → soạn lại "quy chuẩn nhận xét" (đọc file đáp án đúng 1 lần).
    // Không đổi gì liên quan đáp án → giữ nguyên quy chuẩn cũ, không tốn thêm lượt AI nào.
    if (partsJson !== undefined || newAnswerFile) {
      scheduleRubricGeneration(hw.id, newAnswerFile || hw.answer_file, partsJson !== undefined ? partsJson : hw.parts_config);
    }
    res.json({ message: 'Đã cập nhật' });
  }
);

// ── Xóa file đề / file đáp án đã đính kèm của bài tập (kind: 'pdf' | 'answer') ──
router.delete('/homework/:id/files/:kind', requireRole('teacher', 'admin'), (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'pdf' && kind !== 'answer') return res.status(400).json({ message: 'Loại file không hợp lệ' });
  const db = getDb();
  const hw = db.prepare('SELECT h.*,c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  if (kind === 'pdf') {
    rmHomeworkFile(hw.pdf_file);
    db.prepare('UPDATE homework SET pdf_file=NULL,pdf_name=NULL WHERE id=?').run(hw.id);
  } else {
    rmHomeworkFile(hw.answer_file);
    // Quy chuẩn nhận xét soạn từ file đáp án → bỏ luôn
    db.prepare('UPDATE homework SET answer_file=NULL,answer_name=NULL,feedback_rubric=NULL WHERE id=?').run(hw.id);
  }
  res.json({ message: 'Đã xóa file' });
});

router.delete('/homework/:id', requireRole('teacher', 'admin'), (req, res) => {
  const db = getDb();
  // Xóa các bài nộp tham chiếu trước (tránh lỗi FOREIGN KEY)
  const subs = db.prepare('SELECT file_path,files,best_attempt FROM submissions WHERE homework_id=?').all(req.params.id);
  subs.forEach(s => {
    [...submissionFilenames(s), ...bestFilenames(s)].forEach(name => {
      const f = path.join(__dirname, '../../uploads/submissions', name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  });
  db.prepare('DELETE FROM submissions WHERE homework_id=?').run(req.params.id);
  db.prepare('DELETE FROM homework_attempts WHERE homework_id=?').run(req.params.id);
  db.prepare('DELETE FROM homework_marks WHERE homework_id=?').run(req.params.id);
  db.prepare('DELETE FROM homework WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa' });
});

// ── Get homework detail ────────────────────────────────────────────────
router.get('/homework/:id', (req, res) => {
  const db = getDb();
  const hw = db.prepare('SELECT h.*,c.teacher_id,c.title class_title,c.custom_student_order FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
  delete hw.feedback_rubric; // nội bộ, không hiển thị trên web dù giáo viên hay học sinh

  if (req.user.role === 'student') {
    const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
    if (!enrolled) return res.status(403).json({ message: 'Bạn không thuộc lớp này' });
  }

  const now = new Date().toISOString();
  const canSeeAnswer = hw.answer_visible_date ? now >= hw.answer_visible_date : false;

  if (req.user.role === 'student') {
    const submission = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
    const { grading_note, ...hwPublic } = hw; // ẩn ghi chú chấm của giáo viên
    // Nhận xét + chi tiết từng câu chỉ hiện cùng lúc với đáp án (theo "Thời gian xem đáp án").
    // Lần nộp mới đang chờ chấm mà đã có lần trước có điểm → hiện kết quả lần trước (điểm cao nhất)
    const view = submission ? withBestFallback(submission) : null;
    const safeSubmission = view
      ? { ...view, feedback: canSeeAnswer ? view.feedback : null, grading_details: canSeeAnswer ? view.grading_details : null }
      : null;
    if (safeSubmission) delete safeSubmission.best_attempt;
    // Giới hạn số lần nộp bài (nếu giáo viên có đặt): hết hạn hoặc hết lượt đều không cho nộp nữa.
    const attemptsUsed = submission?.submit_count || 0;
    const attemptsLeft = hw.max_attempts ? Math.max(0, hw.max_attempts - attemptsUsed) : null;
    return res.json({
      ...hwPublic,
      parts_config: stripAnswers(hw.parts_config), // ẩn đáp án (key) khỏi học sinh
      hsa_config: stripHsaAnswers(hw.hsa_config),   // HSA: ẩn đáp án, chỉ giữ kiểu câu (TN/TLN) + ghi chú
      answer_file: canSeeAnswer ? hw.answer_file : null,
      solution_video_url: canSeeAnswer ? hw.solution_video_url : null,
      submission: safeSubmission,
      can_submit: (!hw.due_date || now <= hw.due_date) && (attemptsLeft === null || attemptsLeft > 0),
      can_see_answer: canSeeAnswer,
      attempts_left: attemptsLeft,
    });
  }

  // Teacher/admin: all submissions
  const submissions = db.prepare(`
    SELECT s.*,u.full_name,u.username,sb.full_name submitted_by_name FROM submissions s
    JOIN users u ON s.student_id=u.id LEFT JOIN users sb ON s.submitted_by=sb.id
    WHERE s.homework_id=? ORDER BY s.submitted_at DESC
  `).all(req.params.id);

  // Danh sách CẢ LỚP kèm bài nộp (nếu có) → giáo viên thấy cả bạn chưa nộp.
  // Quá hạn mà chưa nộp → giao diện hiện "Chưa nộp bài" + 0 điểm (khớp cách tính xếp hạng).
  const roster = db.prepare(`
    SELECT u.id student_id, u.username, u.full_name, cs.sort_order,
           s.id submission_id, s.file_path, s.files, s.structured_answers, s.submitted_at,
           s.score, s.feedback, s.graded_at, s.graded_by_ai, s.grading_details, s.grading_status, s.submit_count, s.best_score,
           s.submitted_by, sb.full_name submitted_by_name,
           m.quiz_score, m.attendance
    FROM class_students cs JOIN users u ON cs.student_id=u.id
    LEFT JOIN submissions s ON s.homework_id=? AND s.student_id=u.id
    LEFT JOIN users sb ON s.submitted_by=sb.id
    LEFT JOIN homework_marks m ON m.homework_id=? AND m.student_id=u.id
    WHERE cs.class_id=? AND u.active=1
  `).all(req.params.id, req.params.id, hw.class_id);
  // Khớp thứ tự với danh sách học sinh đã kéo thả trong lớp (xem teacher.js GET /classes/:id)
  roster.sort((a, b) => (hw.custom_student_order ? (a.sort_order - b.sort_order) : 0) || compareVietnameseName(a.full_name, b.full_name));
  roster.forEach((s) => { delete s.sort_order; });

  res.json({ ...hw, submissions, roster, is_overdue: hw.due_date ? now > hw.due_date : false });
});

// ── Bắt đầu làm bài (student) — chỉ dùng cho bài HSA có/không giới hạn thời gian ────────
// Ghi (hoặc trả lại nếu đã có sẵn) thời điểm bắt đầu lượt làm hiện tại, để tính hạn "hết giờ"
// = started_at + time_limit_minutes. Gọi lại nhiều lần (vd học sinh tải lại trang) khi lượt làm
// CHƯA nộp sẽ trả về đúng started_at cũ (không reset đồng hồ đếm ngược).
router.post('/homework/:id/start', requireRole('student'), (req, res) => {
  const db = getDb();
  const hw = db.prepare('SELECT * FROM homework WHERE id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

  const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
  if (!enrolled) return res.status(403).json({ message: 'Bạn không thuộc lớp này' });

  const now = new Date().toISOString();
  if (hw.due_date && now > hw.due_date) return res.status(400).json({ message: 'Đã quá hạn nộp bài' });

  const existing = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
  const attemptsUsed = existing?.submit_count || 0;
  if (hw.max_attempts && attemptsUsed >= hw.max_attempts) {
    return res.status(400).json({ message: `Đã hết số lần nộp bài cho phép (tối đa ${hw.max_attempts} lần)` });
  }

  const attempt = db.prepare('SELECT * FROM homework_attempts WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
  // Lượt làm đang dở (chưa nộp kể từ lúc bắt đầu) → giữ nguyên started_at cũ, không reset đồng hồ
  const inProgress = attempt && (!existing || attempt.started_at > existing.submitted_at);
  let startedAt;
  if (inProgress) {
    startedAt = attempt.started_at;
  } else {
    startedAt = now;
    if (attempt) db.prepare('UPDATE homework_attempts SET started_at=? WHERE homework_id=? AND student_id=?').run(startedAt, req.params.id, req.user.id);
    else db.prepare('INSERT INTO homework_attempts (homework_id,student_id,started_at) VALUES (?,?,?)').run(req.params.id, req.user.id, startedAt);
  }
  res.json({ started_at: startedAt, time_limit_minutes: hw.time_limit_minutes || null });
});

// ── Nhận một bài nộp (dùng chung: học sinh tự nộp / giáo viên nộp hộ) ──────
// enforceLimits=false (giáo viên nộp hộ): bỏ qua hạn nộp và giới hạn số lần nộp.
// submittedBy: id giáo viên/admin nộp hộ (NULL = học sinh tự nộp).
// Trả về { status, body } để route gửi về; tự xóa file đã tải lên nếu từ chối.
function acceptSubmission(db, { hw, studentId, uploaded, structuredJson, enforceLimits, submittedBy = null }) {
  const cleanup = () => uploaded.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
  const reject = (status, message) => { cleanup(); return { status, body: { message } }; };

  if (uploaded.length > 20) return reject(400, 'Tối đa 20 file mỗi lần nộp');
  if (uploaded.length === 0 && !structuredJson) return reject(400, 'Cần điền bài làm hoặc nộp ít nhất một file');

  const now = new Date().toISOString();
  if (enforceLimits && hw.due_date && now > hw.due_date) return reject(400, 'Đã quá hạn nộp bài');

  const existing = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(hw.id, studentId);

  // Giới hạn số lần nộp bài (nếu giáo viên có đặt max_attempts) — mỗi lần nộp/nộp lại đều tính 1 lượt
  const attemptsUsed = existing?.submit_count || 0;
  if (enforceLimits && hw.max_attempts && attemptsUsed >= hw.max_attempts) {
    return reject(400, `Đã hết số lần nộp bài cho phép (tối đa ${hw.max_attempts} lần)`);
  }

  const filenames = uploaded.map(f => f.filename);
  const filesJson = filenames.length ? JSON.stringify(filenames) : null;

  // Nộp lại: cất lần nộp có điểm cao nhất (kèm file) để so với lần mới sau khi chấm; file của lần
  // không cần giữ thì xóa luôn.
  const best = existing ? archiveBeforeResubmit(existing) : { bestJson: null, bestScore: null };

  // Có đáp án (file tự luận hoặc key objective) → đưa vào hàng đợi chấm AI ('pending'); không có → giáo viên chấm tay (NULL)
  const aiGrade = needsAiGrading(hw);
  const initialStatus = aiGrade ? 'pending' : null;
  const newSubmitCount = attemptsUsed + 1;

  let submissionId;
  if (existing) {
    db.prepare('UPDATE submissions SET file_path=?,files=?,structured_answers=?,submitted_at=?,score=NULL,feedback=NULL,grading_details=NULL,graded_at=NULL,graded_by_ai=0,grading_status=?,grading_attempts=0,submit_count=?,best_attempt=?,best_score=?,submitted_by=? WHERE id=?')
      .run(filenames[0] || null, filesJson, structuredJson, now, initialStatus, newSubmitCount, best.bestJson, best.bestScore, submittedBy, existing.id);
    submissionId = existing.id;
  } else {
    const r = db.prepare('INSERT INTO submissions (homework_id,student_id,file_path,files,structured_answers,submitted_at,grading_status,grading_attempts,submit_count,submitted_by) VALUES (?,?,?,?,?,?,?,0,?,?)')
      .run(hw.id, studentId, filenames[0] || null, filesJson, structuredJson, now, initialStatus, newSubmitCount, submittedBy);
    submissionId = r.lastInsertRowid;
  }

  // Nhận bài NGAY, không chờ chấm. Việc chấm AI chạy nền (có thử lại nếu lỗi).
  if (aiGrade) enqueue(submissionId);

  const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(submissionId);
  let message = aiGrade
    ? 'Nộp bài thành công. Hệ thống đang tự động chấm, kết quả sẽ hiển thị sau ít phút.'
    : 'Nộp bài thành công.';
  if (enforceLimits && hw.max_attempts) message += ` (đã dùng ${newSubmitCount}/${hw.max_attempts} lần nộp)`;
  return { status: 200, body: { message, submission: sub } };
}

// Đáp án có cấu trúc điền ở giao diện làm bài (trắc nghiệm / đúng-sai / trả lời ngắn) → chuỗi JSON hoặc null
function parseStructured(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : null;
  } catch { return null; } // bỏ qua nếu không hợp lệ
}

// ── Submit homework (student) ──────────────────────────────────────────
router.post(
  '/homework/:id/submit',
  requireRole('student'),
  // .any() nhận nhiều file (field 'files'), vẫn tương thích field 'file' đơn lẻ cũ
  uploadSubmission.any(),
  async (req, res) => {
    const uploaded = req.files || [];
    const cleanup = () => uploaded.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    const db = getDb();
    const hw = db.prepare('SELECT * FROM homework WHERE id=?').get(req.params.id);
    if (!hw) { cleanup(); return res.status(404).json({ message: 'Không tìm thấy bài tập' }); }

    const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
    if (!enrolled) { cleanup(); return res.status(403).json({ message: 'Bạn không thuộc lớp này' }); }

    const r = acceptSubmission(db, {
      hw, studentId: req.user.id, uploaded, structuredJson: parseStructured(req.body.structured_answers), enforceLimits: true,
    });
    res.status(r.status).json(r.body);
  }
);

// ── Nộp hộ học sinh (teacher/admin) ────────────────────────────────────
// Giáo viên chụp ảnh / chọn file bài làm của học sinh và nộp thay: không tính hạn nộp, không trừ lượt
// theo giới hạn; được chấm AI như bài học sinh tự nộp. Ghi lại người nộp hộ (submitted_by).
router.post(
  '/homework/:id/submit-for/:studentId',
  requireRole('teacher', 'admin'),
  uploadSubmission.any(),
  (req, res) => {
    const uploaded = req.files || [];
    const cleanup = () => uploaded.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    const db = getDb();
    const hw = db.prepare('SELECT h.*, c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
    if (!hw) { cleanup(); return res.status(404).json({ message: 'Không tìm thấy bài tập' }); }
    if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) { cleanup(); return res.status(403).json({ message: 'Forbidden' }); }

    const studentId = Number(req.params.studentId);
    const enrolled = db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, studentId);
    if (!enrolled) { cleanup(); return res.status(400).json({ message: 'Học sinh không thuộc lớp này' }); }

    const r = acceptSubmission(db, {
      hw, studentId, uploaded, structuredJson: parseStructured(req.body.structured_answers), enforceLimits: false, submittedBy: req.user.id,
    });
    if (r.status === 200) r.body.message = r.body.message.replace('Nộp bài thành công', 'Đã nộp hộ học sinh');
    res.status(r.status).json(r.body);
  }
);

// ── Điểm 10 phút + điểm danh (teacher/admin) ──────────────────────────
// Body: { marks: [{ student_id, quiz_score?, attendance? }] } — chỉ ghi các trường có gửi lên
// (quiz_score: số 0–10 hoặc null để xóa; attendance: present/absent/online/other_shift hoặc null).
const ATTENDANCE = ['present', 'absent', 'online', 'other_shift'];
router.put('/homework/:id/marks', requireRole('teacher', 'admin'), (req, res) => {
  const db = getDb();
  const hw = db.prepare('SELECT h.id,h.class_id,c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
  if (marks.length === 0) return res.status(400).json({ message: 'Không có dữ liệu' });

  const inClass = db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?');
  const rows = [];
  for (const m of marks) {
    const sid = Number(m?.student_id);
    if (!inClass.get(hw.class_id, sid)) return res.status(400).json({ message: 'Học sinh không thuộc lớp' });
    const row = { sid };
    if ('quiz_score' in m) {
      const v = m.quiz_score === null || m.quiz_score === '' ? null : Number(String(m.quiz_score).replace(',', '.'));
      if (v !== null && !(Number.isFinite(v) && v >= 0 && v <= 10)) return res.status(400).json({ message: 'Điểm 10 phút phải từ 0 đến 10' });
      row.quiz = v;
    }
    if ('attendance' in m) {
      const a = m.attendance || null;
      if (a !== null && !ATTENDANCE.includes(a)) return res.status(400).json({ message: 'Trạng thái điểm danh không hợp lệ' });
      row.att = a;
    }
    rows.push(row);
  }

  const now = new Date().toISOString();
  const ensure = db.prepare('INSERT OR IGNORE INTO homework_marks (homework_id,student_id) VALUES (?,?)');
  const setQuiz = db.prepare('UPDATE homework_marks SET quiz_score=?,updated_at=?,updated_by=? WHERE homework_id=? AND student_id=?');
  const setAtt = db.prepare('UPDATE homework_marks SET attendance=?,updated_at=?,updated_by=? WHERE homework_id=? AND student_id=?');
  db.transaction(() => {
    for (const r of rows) {
      ensure.run(hw.id, r.sid);
      if ('quiz' in r) setQuiz.run(r.quiz, now, req.user.id, hw.id, r.sid);
      if ('att' in r) setAtt.run(r.att, now, req.user.id, hw.id, r.sid);
    }
  })();
  const saved = db.prepare(`SELECT student_id,quiz_score,attendance FROM homework_marks WHERE homework_id=? AND student_id IN (${rows.map(() => '?').join(',')})`)
    .all(hw.id, ...rows.map((r) => r.sid));
  res.json({ marks: saved });
});

// ── Thông tin buổi học ở mục "Nhận xét" (teacher/admin) ───────────────
// Body: { report_lesson?, report_date? } — chỉ ghi các trường có gửi lên; chuỗi rỗng / null = xóa.
router.put('/homework/:id/report-info', requireRole('teacher', 'admin'), (req, res) => {
  const db = getDb();
  const hw = db.prepare('SELECT h.id,c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const body = req.body || {};
  if ('report_lesson' in body) {
    const v = String(body.report_lesson ?? '').trim();
    if (v.length > 500) return res.status(400).json({ message: 'Nội dung bài học tối đa 500 ký tự' });
    db.prepare('UPDATE homework SET report_lesson=? WHERE id=?').run(v || null, hw.id);
  }
  if ('report_date' in body) {
    const v = String(body.report_date ?? '').trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ message: 'Ngày không hợp lệ' });
    db.prepare('UPDATE homework SET report_date=? WHERE id=?').run(v || null, hw.id);
  }
  res.json(db.prepare('SELECT report_lesson,report_date FROM homework WHERE id=?').get(hw.id));
});

// ── Grade submission (teacher/admin) ──────────────────────────────────
router.put('/submissions/:id/grade', requireRole('teacher', 'admin'), (req, res) => {
  const { score, feedback } = req.body;
  const db = getDb();
  db.prepare('UPDATE submissions SET score=?,feedback=?,graded_at=?,graded_by_ai=0 WHERE id=?')
    .run(score, feedback, new Date().toISOString(), req.params.id);
  // Học sinh nộp nhiều lần → giữ lần có điểm cao nhất
  const kept = settleBest(db, req.params.id);
  res.json({ message: kept === 'best' ? 'Đã chấm điểm — lần nộp trước có điểm cao hơn nên được giữ làm điểm chính thức' : 'Đã chấm điểm' });
});

// ── Re-grade with AI (giáo viên bấm chấm lại — chờ kết quả ngay) ─────────
router.post('/submissions/:id/regrade', requireRole('teacher', 'admin'), async (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT s.*,h.answer_file,h.parts_config,h.exam_type,h.hsa_config FROM submissions s JOIN homework h ON s.homework_id=h.id WHERE s.id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Không tìm thấy' });
  if (!needsAiGrading(sub)) return res.status(400).json({ message: 'Bài này không có đáp án để AI chấm' });
  if (submissionFilenames(sub).length === 0 && !sub.structured_answers) return res.status(400).json({ message: 'Học sinh chưa nộp bài' });

  // Chấm lại từ đầu → reset số lần thử rồi chấm ngay (force), trả kết quả cho giáo viên
  db.prepare('UPDATE submissions SET grading_attempts=0 WHERE id=?').run(req.params.id);
  try {
    const result = await gradeOne(Number(req.params.id), { force: true });
    if (!result) return res.status(400).json({ message: 'Không thể chấm bài này' });
    // gradeOne có thể đã khôi phục lần nộp trước (điểm cao hơn) → đọc lại kết quả chính thức
    const fin = db.prepare('SELECT score,feedback,grading_details FROM submissions WHERE id=?').get(req.params.id);
    res.json({ message: 'Đã chấm lại', score: fin.score, feedback: fin.feedback, details: fin.grading_details ? JSON.parse(fin.grading_details) : [] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi chấm bài: ' + redactSecrets(err.message) });
  }
});

module.exports = router;
