const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadVideo, uploadCourseThumbnail } = require('../middleware/upload');
const { hardDeleteCourse, hardDeleteClass } = require('../services/cascade');

router.use(authMiddleware, requireRole('teacher', 'admin'));

// ── Students ───────────────────────────────────────────────────────────
router.get('/students', (req, res) => {
  const db = getDb();
  let q = "SELECT id,username,full_name,parent_phone,created_at FROM users WHERE role='student' AND active=1";
  const p = [];
  if (req.user.role === 'teacher') { q += ' AND created_by=?'; p.push(req.user.id); }
  const students = db.prepare(q + ' ORDER BY full_name').all(...p);

  // Gắn danh sách lớp mỗi học sinh đang học
  const classStmt = db.prepare(`
    SELECT cl.id, cl.title, co.title course_title
    FROM class_students cs JOIN classes cl ON cs.class_id=cl.id
    LEFT JOIN courses co ON cl.course_id=co.id
    WHERE cs.student_id=? AND cl.active=1 ORDER BY cl.title
  `);
  students.forEach(s => { s.classes = classStmt.all(s.id); });
  res.json(students);
});

router.post('/students', (req, res) => {
  const { username, password, full_name, parent_phone } = req.body;
  if (!username || !password || !full_name) return res.status(400).json({ message: 'Thiếu thông tin' });
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
    return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
  }
  const result = db.prepare(
    'INSERT INTO users (username,password,plain_password,full_name,parent_phone,role,created_by) VALUES (?,?,?,?,?,?,?)'
  ).run(username, bcrypt.hashSync(password, 10), password, full_name, parent_phone || null, 'student', req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, username, full_name });
});

router.get('/all-students', (req, res) => {
  const db = getDb();
  res.json(db.prepare("SELECT id,username,full_name,parent_phone FROM users WHERE role='student' AND active=1 ORDER BY full_name").all());
});

// ── Courses (teacher can create & manage own courses) ──────────────────
router.get('/my-courses', (req, res) => {
  const db = getDb();
  const p = [];
  let q = `
    SELECT co.*, u.full_name creator_name,
    (SELECT COUNT(*) FROM classes cl WHERE cl.course_id=co.id AND cl.active=1) class_count,
    (SELECT COUNT(*) FROM classes cl
      JOIN class_students cs ON cl.id=cs.class_id
      WHERE cl.course_id=co.id AND cl.active=1) student_count
    FROM courses co LEFT JOIN users u ON co.created_by=u.id
    WHERE co.active=1`;
  if (req.user.role === 'teacher') { q += ' AND co.created_by=?'; p.push(req.user.id); }
  res.json(db.prepare(q + ' ORDER BY co.created_at DESC').all(...p));
});

router.post('/courses', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tiêu đề khóa học' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO courses (title,description,created_by) VALUES (?,?,?)'
  ).run(title, description || null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

// Upload/change thumbnail separately
router.post('/courses/:courseId/thumbnail', uploadCourseThumbnail.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file ảnh' });
  const db = getDb();
  db.prepare('UPDATE courses SET thumbnail=? WHERE id=?').run(req.file.filename, req.params.courseId);
  res.json({ thumbnail: req.file.filename });
});

router.get('/courses/:courseId', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT co.*,u.full_name creator_name FROM courses co LEFT JOIN users u ON co.created_by=u.id WHERE co.id=? AND co.active=1').get(req.params.courseId);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });
  if (req.user.role === 'teacher' && course.created_by !== req.user.id) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  const classes = db.prepare(`
    SELECT cl.*,u.full_name teacher_name,
    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=cl.id) student_count,
    (SELECT COUNT(*) FROM lessons l WHERE l.class_id=cl.id) lesson_count,
    (SELECT COUNT(*) FROM homework h WHERE h.class_id=cl.id) homework_count
    FROM classes cl LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.course_id=? AND cl.active=1 ORDER BY cl.created_at
  `).all(req.params.courseId);
  res.json({ ...course, classes });
});

router.put('/courses/:courseId', (req, res) => {
  const { title, description } = req.body;
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.courseId);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && course.created_by !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (sets.length > 0) { vals.push(req.params.courseId); db.prepare(`UPDATE courses SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.delete('/courses/:courseId', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.courseId);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && course.created_by !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  db.transaction(() => hardDeleteCourse(db, parseInt(req.params.courseId)))();
  res.json({ message: 'Đã xóa vĩnh viễn' });
});

// ── Classes (always inside a course) ──────────────────────────────────
router.post('/courses/:courseId/classes', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tiêu đề lớp học' });
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id=? AND active=1').get(req.params.courseId);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });
  if (req.user.role === 'teacher' && course.created_by !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const result = db.prepare(
    'INSERT INTO classes (course_id,title,description,teacher_id) VALUES (?,?,?,?)'
  ).run(req.params.courseId, title, description || null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

router.get('/classes/:id', (req, res) => {
  const db = getDb();
  const cls = db.prepare(`
    SELECT cl.*,co.title course_title,co.id course_id_ref,u.full_name teacher_name
    FROM classes cl LEFT JOIN courses co ON cl.course_id=co.id LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.id=? AND cl.active=1
  `).get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  const students = db.prepare(`
    SELECT u.id,u.username,u.full_name,u.parent_phone FROM class_students cs
    JOIN users u ON cs.student_id=u.id WHERE cs.class_id=? AND u.active=1 ORDER BY u.full_name
  `).all(req.params.id);
  const chapters = db.prepare('SELECT * FROM chapters WHERE class_id=? ORDER BY chapter_order,created_at').all(req.params.id);
  const lessons = db.prepare('SELECT * FROM lessons WHERE class_id=? ORDER BY lesson_order,created_at').all(req.params.id);
  const homework = db.prepare('SELECT * FROM homework WHERE class_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...cls, students, chapters, lessons, homework });
});

router.put('/classes/:id', (req, res) => {
  const { title, description } = req.body;
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE classes SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.delete('/classes/:id', (req, res) => {
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  db.transaction(() => hardDeleteClass(db, parseInt(req.params.id)))();
  res.json({ message: 'Đã xóa vĩnh viễn' });
});

// ── Class list (flat, for dropdowns) ───────────────────────────────────
router.get('/classes', (req, res) => {
  const db = getDb();
  let q = `
    SELECT cl.id, cl.title, cl.teacher_id, co.title course_title
    FROM classes cl LEFT JOIN courses co ON cl.course_id=co.id
    WHERE cl.active=1`;
  const p = [];
  if (req.user.role === 'teacher') { q += ' AND cl.teacher_id=?'; p.push(req.user.id); }
  res.json(db.prepare(q + ' ORDER BY co.title, cl.title').all(...p));
});

// ── Class Students ─────────────────────────────────────────────────────
// Thêm học sinh vào lớp: tạo tài khoản mới (username/password) HOẶC thêm HS có sẵn (student_id)
router.post('/classes/:id/students', (req, res) => {
  const { student_id, username, password, full_name, parent_phone } = req.body;
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  let sid = student_id;
  // Nếu không có student_id → tạo tài khoản học sinh mới
  if (!sid) {
    if (!username || !password || !full_name) {
      return res.status(400).json({ message: 'Cần tên đăng nhập, mật khẩu và họ tên' });
    }
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
    }
    const r = db.prepare(
      'INSERT INTO users (username,password,plain_password,full_name,parent_phone,role,created_by) VALUES (?,?,?,?,?,?,?)'
    ).run(username, bcrypt.hashSync(password, 10), password, full_name, parent_phone || null, 'student', req.user.id);
    sid = r.lastInsertRowid;
  }

  try {
    db.prepare('INSERT INTO class_students (class_id,student_id) VALUES (?,?)').run(req.params.id, sid);
    res.status(201).json({ message: 'Đã thêm học sinh vào lớp', student_id: sid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ message: 'Học sinh đã trong lớp' });
    throw e;
  }
});

// Đổi lớp: chuyển học sinh từ lớp này sang lớp khác
router.put('/students/:studentId/move', (req, res) => {
  const { from_class_id, to_class_id } = req.body;
  if (!to_class_id) return res.status(400).json({ message: 'Cần chọn lớp đích' });
  const db = getDb();
  const target = db.prepare('SELECT * FROM classes WHERE id=? AND active=1').get(to_class_id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy lớp đích' });
  if (req.user.role === 'teacher' && target.teacher_id !== req.user.id) {
    return res.status(403).json({ message: 'Bạn không phụ trách lớp đích' });
  }
  // đã ở lớp đích chưa
  const already = db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?').get(to_class_id, req.params.studentId);
  if (already) return res.status(400).json({ message: 'Học sinh đã ở lớp này' });

  db.transaction(() => {
    if (from_class_id) {
      db.prepare('DELETE FROM class_students WHERE class_id=? AND student_id=?').run(from_class_id, req.params.studentId);
    }
    db.prepare('INSERT INTO class_students (class_id,student_id) VALUES (?,?)').run(to_class_id, req.params.studentId);
  })();
  res.json({ message: from_class_id ? 'Đã chuyển lớp' : 'Đã chỉ định lớp' });
});

router.delete('/classes/:id/students/:studentId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM class_students WHERE class_id=? AND student_id=?').run(req.params.id, req.params.studentId);
  res.json({ message: 'Đã xóa' });
});

// ── Chapters (chương: nhóm bài giảng & bài tập) ───────────────────────
router.post('/classes/:id/chapters', (req, res) => {
  const { title, chapter_order } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tên chương' });
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const result = db.prepare(
    'INSERT INTO chapters (class_id,title,chapter_order) VALUES (?,?,?)'
  ).run(req.params.id, title, parseInt(chapter_order) || 0);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

router.put('/chapters/:id', (req, res) => {
  const { title, chapter_order } = req.body;
  const db = getDb();
  const ch = db.prepare('SELECT ch.*,c.teacher_id FROM chapters ch JOIN classes c ON ch.class_id=c.id WHERE ch.id=?').get(req.params.id);
  if (!ch) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && ch.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (chapter_order !== undefined) { sets.push('chapter_order=?'); vals.push(parseInt(chapter_order) || 0); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE chapters SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

// Xóa chương: gỡ liên kết bài giảng/bài tập (giữ lại nội dung) rồi xóa chương
router.delete('/chapters/:id', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT ch.*,c.teacher_id FROM chapters ch JOIN classes c ON ch.class_id=c.id WHERE ch.id=?').get(req.params.id);
  if (!ch) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && ch.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  db.transaction(() => {
    db.prepare('UPDATE lessons SET chapter_id=NULL WHERE chapter_id=?').run(req.params.id);
    db.prepare('UPDATE homework SET chapter_id=NULL WHERE chapter_id=?').run(req.params.id);
    db.prepare('DELETE FROM chapters WHERE id=?').run(req.params.id);
  })();
  res.json({ message: 'Đã xóa chương' });
});

// ── Lessons ────────────────────────────────────────────────────────────
router.post('/classes/:id/lessons', (req, res) => {
  const { title, description, video_url, video_type, lesson_order, chapter_id } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tiêu đề bài giảng' });
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const result = db.prepare(
    'INSERT INTO lessons (class_id,title,description,video_url,video_type,lesson_order,chapter_id) VALUES (?,?,?,?,?,?,?)'
  ).run(req.params.id, title, description || null, video_url || null, video_type || null, lesson_order || 0, chapter_id || null);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

router.put('/lessons/:id', (req, res) => {
  const { title, description, video_url, video_type, lesson_order, chapter_id } = req.body;
  const db = getDb();
  const lesson = db.prepare('SELECT l.*,c.teacher_id FROM lessons l JOIN classes c ON l.class_id=c.id WHERE l.id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && lesson.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (video_url !== undefined) { sets.push('video_url=?'); vals.push(video_url); }
  if (video_type) { sets.push('video_type=?'); vals.push(video_type); }
  if (lesson_order !== undefined) { sets.push('lesson_order=?'); vals.push(lesson_order); }
  if (chapter_id !== undefined) { sets.push('chapter_id=?'); vals.push(chapter_id || null); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE lessons SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.delete('/lessons/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM lessons WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa' });
});

router.post('/lessons/:id/video', uploadVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file video' });
  const db = getDb();
  db.prepare("UPDATE lessons SET video_url=?,video_type='local' WHERE id=?").run(req.file.filename, req.params.id);
  res.json({ filename: req.file.filename });
});

module.exports = router;
