const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

router.get('/ads', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM advertisements WHERE active=1 ORDER BY ad_order,created_at').all());
});

router.get('/courses', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id,title,description,thumbnail FROM courses WHERE active=1 ORDER BY created_at DESC').all());
});

// Chi tiết công khai 1 khóa học: thông tin giáo viên, sĩ số, tên các chương (không kèm bài giảng/bài tập bên trong)
router.get('/courses/:id', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT id,title,description,thumbnail FROM courses WHERE id=? AND active=1').get(req.params.id);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });

  const classes = db.prepare(`
    SELECT cl.id, cl.title, u.full_name teacher_name,
    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=cl.id) student_count
    FROM classes cl LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.course_id=? AND cl.active=1 ORDER BY cl.created_at DESC
  `).all(req.params.id);

  const chapterStmt = db.prepare('SELECT id,title FROM chapters WHERE class_id=? ORDER BY chapter_order, id');
  const withChapters = classes.map((c) => ({ ...c, chapters: chapterStmt.all(c.id) }));

  res.json({ ...course, classes: withChapters });
});

// ── Nội dung trang công khai (chỉ lấy mục đang bật) ────────────────────
router.get('/featured-students', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM featured_students WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/staff', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM staff WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/featured-courses', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM featured_courses WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/achievements', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM achievements WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key,value FROM site_settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

module.exports = router;
