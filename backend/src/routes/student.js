const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { stripAnswers } = require('../services/homeworkParts');
const { classRanking, studentOverallAverage } = require('../services/classRanking');

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
  // Điểm TB + xếp hạng của học sinh trong mỗi lớp (quá hạn chưa nộp = 0 điểm)
  const withRank = classes.map((c) => {
    const mine = classRanking(db, c.id).get(req.user.id) || {};
    return { ...c, my_avg: mine.avg ?? null, my_rank: mine.rank ?? null, rank_total: mine.total ?? 0 };
  });
  res.json(withRank);
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

  const chapters = db.prepare('SELECT * FROM chapters WHERE class_id=? ORDER BY chapter_order,created_at').all(req.params.id);
  const lessons = db.prepare('SELECT * FROM lessons WHERE class_id=? ORDER BY lesson_order,created_at').all(req.params.id);

  const now = new Date().toISOString();
  const homework = db.prepare(`
    SELECT h.id,h.class_id,h.chapter_id,h.title,h.description,h.pdf_file,h.answer_file,h.solution_video_url,h.due_date,h.answer_visible_date,h.max_score,h.created_at,h.parts_config,
           s.id submission_id,s.score,s.feedback,s.grading_details,s.submitted_at,s.graded_at,s.file_path submitted_file,s.files submitted_files,s.structured_answers,s.graded_by_ai,s.grading_status
    FROM homework h LEFT JOIN submissions s ON h.id=s.homework_id AND s.student_id=?
    WHERE h.class_id=? ORDER BY h.hw_order,h.created_at
  `).all(req.user.id, req.params.id).map(hw => {
    const canSeeAnswer = hw.answer_visible_date ? now >= hw.answer_visible_date : false;
    return {
      ...hw,
      parts_config: stripAnswers(hw.parts_config), // ẩn đáp án (key) khỏi học sinh
      can_submit: !hw.due_date || now <= hw.due_date,
      can_see_answer: canSeeAnswer,
      answer_file: canSeeAnswer ? hw.answer_file : null,
      solution_video_url: canSeeAnswer ? hw.solution_video_url : null,
      // Nhận xét + chi tiết từng câu (sai câu nào) chỉ hiện cùng lúc với đáp án (theo "Thời gian xem đáp án").
      feedback: canSeeAnswer ? hw.feedback : null,
      grading_details: canSeeAnswer ? hw.grading_details : null,
    };
  });

  // Điểm TB + xếp hạng của học sinh trong lớp này (quá hạn chưa nộp = 0 điểm)
  const mine = classRanking(db, req.params.id).get(req.user.id) || {};
  res.json({ ...cls, chapters, lessons, homework, my_avg: mine.avg ?? null, my_rank: mine.rank ?? null, rank_total: mine.total ?? 0 });
});

// Student's profile/stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const classCount = db.prepare('SELECT COUNT(*) c FROM class_students WHERE student_id=?').get(req.user.id).c;
  const submittedCount = db.prepare('SELECT COUNT(*) c FROM submissions WHERE student_id=?').get(req.user.id).c;
  const gradedCount = db.prepare('SELECT COUNT(*) c FROM submissions WHERE student_id=? AND score IS NOT NULL').get(req.user.id).c;
  // Điểm TB (thang 10): bài đã quá hạn mà chưa nộp được tính 0 điểm.
  const avgScore = studentOverallAverage(db, req.user.id);
  res.json({ classCount, submittedCount, gradedCount, avgScore });
});

module.exports = router;
