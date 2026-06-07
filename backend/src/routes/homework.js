const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadHomework, uploadSubmission } = require('../middleware/upload');
const { gradeSubmission } = require('../services/aiGrading');

router.use(authMiddleware);

// ── Create homework (teacher/admin) ────────────────────────────────────
router.post(
  '/classes/:classId/homework',
  requireRole('teacher', 'admin'),
  uploadHomework.fields([{ name: 'pdf_file', maxCount: 1 }, { name: 'answer_file', maxCount: 1 }]),
  (req, res) => {
    const { title, description, due_date, answer_visible_date, max_score } = req.body;
    if (!title) return res.status(400).json({ message: 'Cần tiêu đề bài tập' });
    const db = getDb();
    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
    if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const result = db.prepare(`
      INSERT INTO homework (class_id,title,description,pdf_file,answer_file,due_date,answer_visible_date,max_score)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      req.params.classId, title, description || null,
      req.files?.pdf_file?.[0]?.filename || null,
      req.files?.answer_file?.[0]?.filename || null,
      due_date || null, answer_visible_date || null, parseInt(max_score) || 10
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
    const { title, description, due_date, answer_visible_date, max_score } = req.body;
    const db = getDb();
    const hw = db.prepare('SELECT h.*,c.teacher_id FROM homework h JOIN classes c ON h.class_id=c.id WHERE h.id=?').get(req.params.id);
    if (!hw) return res.status(404).json({ message: 'Không tìm thấy' });
    if (req.user.role === 'teacher' && hw.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const sets = []; const vals = [];
    if (title) { sets.push('title=?'); vals.push(title); }
    if (description !== undefined) { sets.push('description=?'); vals.push(description); }
    if (due_date !== undefined) { sets.push('due_date=?'); vals.push(due_date || null); }
    if (answer_visible_date !== undefined) { sets.push('answer_visible_date=?'); vals.push(answer_visible_date || null); }
    if (max_score) { sets.push('max_score=?'); vals.push(parseInt(max_score)); }
    if (req.files?.pdf_file?.[0]) { sets.push('pdf_file=?'); vals.push(req.files.pdf_file[0].filename); }
    if (req.files?.answer_file?.[0]) { sets.push('answer_file=?'); vals.push(req.files.answer_file[0].filename); }

    if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE homework SET ${sets.join(',')} WHERE id=?`).run(...vals); }
    res.json({ message: 'Đã cập nhật' });
  }
);

router.delete('/homework/:id', requireRole('teacher', 'admin'), (req, res) => {
  const db = getDb();
  // Xóa các bài nộp tham chiếu trước (tránh lỗi FOREIGN KEY)
  const subs = db.prepare('SELECT file_path FROM submissions WHERE homework_id=?').all(req.params.id);
  subs.forEach(s => {
    if (s.file_path) {
      const f = path.join(__dirname, '../../uploads/submissions', s.file_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
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
    return res.json({
      ...hw,
      answer_file: canSeeAnswer ? hw.answer_file : null,
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
  uploadSubmission.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Cần file bài nộp' });
    const db = getDb();
    const hw = db.prepare('SELECT * FROM homework WHERE id=?').get(req.params.id);
    if (!hw) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    const now = new Date().toISOString();
    if (hw.due_date && now > hw.due_date) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Đã quá hạn nộp bài' });
    }

    const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(hw.class_id, req.user.id);
    if (!enrolled) return res.status(403).json({ message: 'Bạn không thuộc lớp này' });

    const existing = db.prepare('SELECT * FROM submissions WHERE homework_id=? AND student_id=?').get(req.params.id, req.user.id);
    if (existing?.file_path) {
      const old = path.join(__dirname, '../../uploads/submissions', existing.file_path);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    let submissionId;
    if (existing) {
      db.prepare('UPDATE submissions SET file_path=?,submitted_at=?,score=NULL,feedback=NULL,graded_at=NULL WHERE id=?')
        .run(req.file.filename, now, existing.id);
      submissionId = existing.id;
    } else {
      const r = db.prepare('INSERT INTO submissions (homework_id,student_id,file_path,submitted_at) VALUES (?,?,?,?)').run(req.params.id, req.user.id, req.file.filename, now);
      submissionId = r.lastInsertRowid;
    }

    // Auto grade if answer file exists
    if (hw.answer_file) {
      try {
        const answerPath = path.join(__dirname, '../../uploads/homework', hw.answer_file);
        const subPath = path.join(__dirname, '../../uploads/submissions', req.file.filename);
        const result = await gradeSubmission(answerPath, subPath, hw.max_score);
        db.prepare('UPDATE submissions SET score=?,feedback=?,graded_at=?,graded_by_ai=1 WHERE id=?')
          .run(result.score, result.feedback, now, submissionId);
      } catch (err) {
        console.error('AI grading error:', err.message);
      }
    }

    const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(submissionId);
    res.json({ message: 'Nộp bài thành công', submission: sub });
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

// ── Re-grade with AI ────────────────────────────────────────────────────
router.post('/submissions/:id/regrade', requireRole('teacher', 'admin'), async (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT s.*,h.answer_file,h.max_score FROM submissions s JOIN homework h ON s.homework_id=h.id WHERE s.id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Không tìm thấy' });
  if (!sub.answer_file) return res.status(400).json({ message: 'Không có file đáp án' });
  if (!sub.file_path) return res.status(400).json({ message: 'Học sinh chưa nộp bài' });

  try {
    const answerPath = path.join(__dirname, '../../uploads/homework', sub.answer_file);
    const subPath = path.join(__dirname, '../../uploads/submissions', sub.file_path);
    const result = await gradeSubmission(answerPath, subPath, sub.max_score);
    db.prepare('UPDATE submissions SET score=?,feedback=?,graded_at=?,graded_by_ai=1 WHERE id=?')
      .run(result.score, result.feedback, new Date().toISOString(), req.params.id);
    res.json({ message: 'Đã chấm lại', score: result.score, feedback: result.feedback });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi chấm bài: ' + err.message });
  }
});

module.exports = router;
