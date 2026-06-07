const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('student'));

router.get('/my-classes', (req, res) => {
  const db = getDb();
  const classes = db.prepare(`
    SELECT cl.*,co.title course_title,u.full_name teacher_name,
    (SELECT COUNT(*) FROM lessons l WHERE l.class_id=cl.id) lesson_count,
    (SELECT COUNT(*) FROM homework h WHERE h.class_id=cl.id) homework_count,
    (SELECT COUNT(*) FROM submissions s JOIN homework h2 ON s.homework_id=h2.id WHERE h2.class_id=cl.id AND s.student_id=?) submitted_count
    FROM class_students cs JOIN classes cl ON cs.class_id=cl.id
    LEFT JOIN courses co ON cl.course_id=co.id LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cs.student_id=? AND cl.active=1 ORDER BY cl.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json(classes);
});

router.get('/my-classes/:id', (req, res) => {
  const db = getDb();
  const enrolled = db.prepare('SELECT * FROM class_students WHERE class_id=? AND student_id=?').get(req.params.id, req.user.id);
  if (!enrolled) return res.status(403).json({ message: 'Bạn không thuộc lớp này' });

  const cls = db.prepare(`
    SELECT cl.*,co.title course_title,u.full_name teacher_name
    FROM classes cl LEFT JOIN courses co ON cl.course_id=co.id LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.id=? AND cl.active=1
  `).get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });

  const lessons = db.prepare('SELECT * FROM lessons WHERE class_id=? ORDER BY lesson_order,created_at').all(req.params.id);

  const now = new Date().toISOString();
  const homework = db.prepare(`
    SELECT h.*,s.id submission_id,s.score,s.feedback,s.submitted_at,s.graded_at,s.file_path submitted_file,s.graded_by_ai
    FROM homework h LEFT JOIN submissions s ON h.id=s.homework_id AND s.student_id=?
    WHERE h.class_id=? ORDER BY h.created_at DESC
  `).all(req.user.id, req.params.id).map(hw => ({
    ...hw,
    can_submit: !hw.due_date || now <= hw.due_date,
    can_see_answer: hw.answer_visible_date ? now >= hw.answer_visible_date : false,
    answer_file: (hw.answer_visible_date && now >= hw.answer_visible_date) ? hw.answer_file : null,
  }));

  res.json({ ...cls, lessons, homework });
});

// Student's profile/stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const classCount = db.prepare('SELECT COUNT(*) c FROM class_students WHERE student_id=?').get(req.user.id).c;
  const submittedCount = db.prepare('SELECT COUNT(*) c FROM submissions WHERE student_id=?').get(req.user.id).c;
  const gradedCount = db.prepare('SELECT COUNT(*) c FROM submissions WHERE student_id=? AND score IS NOT NULL').get(req.user.id).c;
  const avgScore = db.prepare('SELECT AVG(score) avg FROM submissions WHERE student_id=? AND score IS NOT NULL').get(req.user.id).avg;
  res.json({ classCount, submittedCount, gradedCount, avgScore: avgScore ? parseFloat(avgScore.toFixed(1)) : null });
});

module.exports = router;
