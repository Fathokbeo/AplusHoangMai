const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadHomework, uploadSubmission } = require('../middleware/upload');
const { enqueue, gradeOne } = require('../services/gradingQueue');
const { needsAiGrading, stripAnswers } = require('../services/homeworkParts');
const { computeMaxScore, DEFAULT_POINTS } = require('../services/homeworkScoring');

router.use(authMiddleware);

// Chuẩn hóa parts_config nhận từ form (chuỗi JSON) → chuỗi JSON để lưu, hoặc null.
function sanitizePartsConfig(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  ['multiple_choice', 'true_false', 'short_answer'].forEach((k) => {
    const p = obj[k];
    if (p && p.enabled) {
      const count = Math.max(0, parseInt(p.count) || 0);
      const answers = Array.isArray(p.answers) ? p.answers.slice(0, count) : [];
      const def = DEFAULT_POINTS[k] ?? 0;
      const points = [];
      const rawPts = Array.isArray(p.points) ? p.points : [];
      for (let i = 0; i < count; i++) points.push(typeof rawPts[i] === 'number' && rawPts[i] >= 0 ? rawPts[i] : def);
      out[k] = { enabled: true, count, answers, points };
    }
  });
  if (obj.essay && obj.essay.enabled) {
    const ep = Number(obj.essay.points);
    out.essay = { enabled: true, points: isFinite(ep) && ep >= 0 ? ep : 4 };
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// Lấy danh sách tên file của một bài nộp (hỗ trợ cũ: file_path đơn, mới: files JSON)
function submissionFilenames(sub) {
  if (sub && sub.files) {
    try { const a = JSON.parse(sub.files); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ }
  }
  return sub && sub.file_path ? [sub.file_path] : [];
}

// ── Create homework (teacher/admin) ────────────────────────────────────
router.post(
  '/classes/:classId/homework',
  requireRole('teacher', 'admin'),
  uploadHomework.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]),
  (req, res) => {
    const { title, description, due_date, answer_visible_date, max_score, grading_note, chapter_id, solution_video_url, parts_config } = req.body;
    if (!title) return res.status(400).json({ message: 'Cần tiêu đề bài tập' });
    const db = getDb();
    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
    if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const partsJson = sanitizePartsConfig(parts_config);
    // Có cấu hình phần → thang điểm = tổng điểm các phần (tự tính), bỏ qua max_score gửi lên.
    const computedMax = computeMaxScore(partsJson);
    const finalMax = computedMax != null ? computedMax : (parseInt(max_score) || 10);

    const result = db.prepare(`
      INSERT INTO homework (class_id,title,description,pdf_file,answer_file,due_date,answer_visible_date,max_score,grading_note,chapter_id,solution_video_url,parts_config)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.params.classId, title, description || null,
      req.files?.pdf_file?.[0]?.filename || null,
      req.files?.answer_file?.[0]?.filename || null,
      due_date || null, answer_visible_date || null, finalMax,
      grading_note || null, chapter_id || null, solution_video_url || null,
      partsJson
    );
    res.status(201).json({ id: result.lastInsertRowid, title });
  }
);

// ── Update homework ────────────────────────────────────────────────────
router.put(
  '/homework/:id',
  requireRole('teacher', 'admin'),
  uploadHomework.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]),
  (req, res) => {
    const { title, description, due_date, answer_visible_date, max_score, grading_note, chapter_id, solution_video_url, parts_config } = req.body;
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

    // parts_config + max_score: nếu có cấu hình phần thì thang điểm = tổng điểm các phần (tự tính).
    let computedMax = null;
    if (parts_config !== undefined) {
      const partsJson = sanitizePartsConfig(parts_config);
      sets.push('parts_config=?'); vals.push(partsJson);
      computedMax = computeMaxScore(partsJson);
    }
    if (computedMax != null) { sets.push('max_score=?'); vals.push(computedMax); }
    else if (max_score) { sets.push('max_score=?'); vals.push(parseFloat(max_score) || 10); }

    if (req.files?.pdf_file?.[0]) { sets.push('pdf_file=?'); vals.push(req.files.pdf_file[0].filename); }
    if (req.files?.answer_file?.[0]) { sets.push('answer_file=?'); vals.push(req.files.answer_file[0].filename); }

    if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE homework SET ${sets.join(',')} WHERE id=?`).run(...vals); }
    res.json({ message: 'Đã cập nhật' });
  }
);

router.delete('/homework/:id', requireRole('teacher', 'admin'), (req, res) => {
  const db = getDb();
  // Xóa các bài nộp tham chiếu trước (tránh lỗi FOREIGN KEY)
  const subs = db.prepare('SELECT file_path,files FROM submissions WHERE homework_id=?').all(req.params.id);
  subs.forEach(s => {
    submissionFilenames(s).forEach(name => {
      const f = path.join(__dirname, '../../uploads/submissions', name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  });
  db.prepare('DELETE FROM submissions WHERE homework_id=?').run(req.params.id);
  db.prepare('DELETE FROM homework WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa' });
});

// ── Get homework detail ────────────────────────────────────────────────
router.get('/homework/:id', (req, res) => {
  const db = getDb();
  const hw = db.prepare('SELECT h.*,c.teacher_id,c.title class_title FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
  if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });

  if (req.user.role === 'student') {
    const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
    if (!enrolled) return res.status(403).json({ message: 'Bạn không thuộc lớp này' });
  }

  const now = new Date().toISOString();
  const canSeeAnswer = hw.answer_visible_date ? now >= hw.answer_visible_date : false;

  if (req.user.role === 'student') {
    const submission = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
    const { grading_note, ...hwPublic } = hw; // ẩn ghi chú chấm của giáo viên
    return res.json({
      ...hwPublic,
      parts_config: stripAnswers(hw.parts_config), // ẩn đáp án (key) khỏi học sinh
      answer_file: canSeeAnswer ? hw.answer_file : null,
      solution_video_url: canSeeAnswer ? hw.solution_video_url : null,
      submission: submission || null,
      can_submit: !hw.due_date || now <= hw.due_date,
      can_see_answer: canSeeAnswer,
    });
  }

  // Teacher/admin: all submissions
  const submissions = db.prepare(`
    SELECT s.*,u.full_name,u.username FROM submissions s
    JOIN users u ON s.student_id=u.id WHERE s.homework_id=? ORDER BY s.submitted_at DESC
  `).all(req.params.id);
  res.json({ ...hw, submissions });
});

// ── Submit homework (student) ──────────────────────────────────────────
router.post(
  '/homework/:id/submit',
  requireRole('student'),
  // .any() nhận nhiều file (field 'files'), vẫn tương thích field 'file' đơn lẻ cũ
  uploadSubmission.any(),
  async (req, res) => {
    const uploaded = req.files || [];
    const cleanup = () => uploaded.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

    if (uploaded.length > 20) { cleanup(); return res.status(400).json({ message: 'Tối đa 20 file mỗi lần nộp' }); }

    // Đáp án có cấu trúc học sinh điền ở giao diện làm bài (trắc nghiệm / đúng-sai / trả lời ngắn)
    let structuredJson = null;
    if (req.body.structured_answers) {
      try {
        const parsed = JSON.parse(req.body.structured_answers);
        if (parsed && typeof parsed === 'object') structuredJson = JSON.stringify(parsed);
      } catch { /* bỏ qua nếu không hợp lệ */ }
    }

    if (uploaded.length === 0 && !structuredJson) {
      return res.status(400).json({ message: 'Cần điền bài làm hoặc nộp ít nhất một file' });
    }

    const db = getDb();
    const hw = db.prepare('SELECT * FROM homework WHERE id=?').get(req.params.id);
    if (!hw) { cleanup(); return res.status(404).json({ message: 'Không tìm thấy bài tập' }); }

    const now = new Date().toISOString();
    if (hw.due_date && now > hw.due_date) {
      cleanup();
      return res.status(400).json({ message: 'Đã quá hạn nộp bài' });
    }

    const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
    if (!enrolled) { cleanup(); return res.status(403).json({ message: 'Bạn không thuộc lớp này' }); }

    const filenames = uploaded.map(f => f.filename);
    const filesJson = filenames.length ? JSON.stringify(filenames) : null;

    const existing = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
    if (existing) {
      // Xóa các file của lần nộp trước
      submissionFilenames(existing).forEach(name => {
        const old = path.join(__dirname, '../../uploads/submissions', name);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      });
    }

    // Có đáp án (file tự luận hoặc key objective) → đưa vào hàng đợi chấm AI ('pending'); không có → giáo viên chấm tay (NULL)
    const aiGrade = needsAiGrading(hw);
    const initialStatus = aiGrade ? 'pending' : null;

    let submissionId;
    if (existing) {
      db.prepare('UPDATE submissions SET file_path=?,files=?,structured_answers=?,submitted_at=?,score=NULL,feedback=NULL,grading_details=NULL,graded_at=NULL,graded_by_ai=0,grading_status=?,grading_attempts=0 WHERE id=?')
        .run(filenames[0] || null, filesJson, structuredJson, now, initialStatus, existing.id);
      submissionId = existing.id;
    } else {
      const r = db.prepare('INSERT INTO submissions (homework_id,student_id,file_path,files,structured_answers,submitted_at,grading_status,grading_attempts) VALUES (?,?,?,?,?,?,?,0)')
        .run(req.params.id, req.user.id, filenames[0] || null, filesJson, structuredJson, now, initialStatus);
      submissionId = r.lastInsertRowid;
    }

    // Nhận bài NGAY, không chờ chấm. Việc chấm AI chạy nền (có thử lại nếu lỗi).
    if (aiGrade) enqueue(submissionId);

    const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(submissionId);
    const message = aiGrade
      ? 'Nộp bài thành công. Hệ thống đang tự động chấm, kết quả sẽ hiển thị sau ít phút.'
      : 'Nộp bài thành công.';
    res.json({ message, submission: sub });
  }
);

// ── Grade submission (teacher/admin) ──────────────────────────────────
router.put('/submissions/:id/grade', requireRole('teacher', 'admin'), (req, res) => {
  const { score, feedback } = req.body;
  const db = getDb();
  db.prepare('UPDATE submissions SET score=?,feedback=?,graded_at=?,graded_by_ai=0 WHERE id=?')
    .run(score, feedback, new Date().toISOString(), req.params.id);
  res.json({ message: 'Đã chấm điểm' });
});

// ── Re-grade with AI (giáo viên bấm chấm lại — chờ kết quả ngay) ─────────
router.post('/submissions/:id/regrade', requireRole('teacher', 'admin'), async (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT s.*,h.answer_file,h.parts_config FROM submissions s JOIN homework h ON s.homework_id=h.id WHERE s.id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Không tìm thấy' });
  if (!needsAiGrading(sub)) return res.status(400).json({ message: 'Bài này không có đáp án để AI chấm' });
  if (submissionFilenames(sub).length === 0 && !sub.structured_answers) return res.status(400).json({ message: 'Học sinh chưa nộp bài' });

  // Chấm lại từ đầu → reset số lần thử rồi chấm ngay (force), trả kết quả cho giáo viên
  db.prepare('UPDATE submissions SET grading_attempts=0 WHERE id=?').run(req.params.id);
  try {
    const result = await gradeOne(Number(req.params.id), { force: true });
    if (!result) return res.status(400).json({ message: 'Không thể chấm bài này' });
    res.json({ message: 'Đã chấm lại', score: result.score, feedback: result.feedback, details: result.details });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi chấm bài: ' + err.message });
  }
});

module.exports = router;
