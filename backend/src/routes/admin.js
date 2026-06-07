const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadAd, uploadCourseThumbnail } = require('../middleware/upload');
const { hardDeleteCourse } = require('../services/cascade');

router.use(authMiddleware, requireRole('admin'));

// ── Stats ──────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();
  res.json({
    totalStudents: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student' AND active=1").get().c,
    totalTeachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher' AND active=1").get().c,
    totalCourses: db.prepare("SELECT COUNT(*) c FROM courses WHERE active=1").get().c,
    totalClasses: db.prepare("SELECT COUNT(*) c FROM classes WHERE active=1").get().c,
    totalHomework: db.prepare("SELECT COUNT(*) c FROM homework").get().c,
    totalSubmissions: db.prepare("SELECT COUNT(*) c FROM submissions").get().c,
  });
});

// ── Users ──────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const db = getDb();
  const { role } = req.query;
  let query = 'SELECT id,username,full_name,parent_phone,role,created_at,active,plain_password FROM users';
  const params = [];
  if (role) { query += ' WHERE role=?'; params.push(role); }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/users', (req, res) => {
  const { username, password, full_name, parent_phone, role } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ message: 'Role không hợp lệ' });
  }
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
    return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
  }
  const result = db.prepare(
    'INSERT INTO users (username,password,plain_password,full_name,parent_phone,role,created_by) VALUES (?,?,?,?,?,?,?)'
  ).run(username, bcrypt.hashSync(password, 10), password, full_name, parent_phone || null, role, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, username, full_name, role });
});

router.put('/users/:id', (req, res) => {
  const { full_name, parent_phone, password, active } = req.body;
  const db = getDb();
  const sets = []; const vals = [];
  if (full_name) { sets.push('full_name=?'); vals.push(full_name); }
  if (parent_phone !== undefined) { sets.push('parent_phone=?'); vals.push(parent_phone); }
  if (password) { sets.push('password=?'); vals.push(bcrypt.hashSync(password, 10)); sets.push('plain_password=?'); vals.push(password); }
  if (active !== undefined) { sets.push('active=?'); vals.push(active ? 1 : 0); }
  if (sets.length === 0) return res.status(400).json({ message: 'Không có gì để cập nhật' });
  vals.push(req.params.id);
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ message: 'Cập nhật thành công' });
});

// Xóa thật (hard delete) — dọn sạch toàn bộ dữ liệu liên quan
function hardDeleteUser(db, userId) {
  // Bài nộp của học sinh này (+ xóa file)
  const subs = db.prepare('SELECT file_path FROM submissions WHERE student_id=?').all(userId);
  subs.forEach(s => {
    if (s.file_path) {
      const f = path.join(__dirname, '../../uploads/submissions', s.file_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });
  db.prepare('DELETE FROM submissions WHERE student_id=?').run(userId);
  db.prepare('DELETE FROM class_students WHERE student_id=?').run(userId);

  // Nếu là giáo viên: xóa các lớp do họ phụ trách + dữ liệu con
  const taughtClasses = db.prepare('SELECT id FROM classes WHERE teacher_id=?').all(userId);
  for (const c of taughtClasses) {
    db.prepare('DELETE FROM submissions WHERE homework_id IN (SELECT id FROM homework WHERE class_id=?)').run(c.id);
    db.prepare('DELETE FROM homework WHERE class_id=?').run(c.id);
    db.prepare('DELETE FROM lessons WHERE class_id=?').run(c.id);
    db.prepare('DELETE FROM class_students WHERE class_id=?').run(c.id);
  }
  db.prepare('DELETE FROM classes WHERE teacher_id=?').run(userId);
  db.prepare('DELETE FROM course_teachers WHERE teacher_id=?').run(userId);

  // Khóa học do họ tạo: giữ lại nhưng gỡ liên kết người tạo
  db.prepare('UPDATE courses SET created_by=NULL WHERE created_by=?').run(userId);
  // Gỡ liên kết người tạo ở các tài khoản khác
  db.prepare('UPDATE users SET created_by=NULL WHERE created_by=?').run(userId);

  db.prepare('DELETE FROM users WHERE id=?').run(userId);
}

router.delete('/users/:id', (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'Không thể xóa chính mình' });
  }
  db.transaction(() => hardDeleteUser(db, parseInt(req.params.id)))();
  res.json({ message: 'Đã xóa vĩnh viễn' });
});

// Xóa nhiều tài khoản cùng lúc
router.post('/users/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Chưa chọn tài khoản nào' });
  }
  const db = getDb();
  const targets = ids.map(Number).filter(id => id !== req.user.id);
  db.transaction(() => targets.forEach(id => hardDeleteUser(db, id)))();
  res.json({ message: `Đã xóa ${targets.length} tài khoản`, deleted: targets.length });
});

// ── Advertisements ─────────────────────────────────────────────────────
router.get('/ads', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM advertisements ORDER BY ad_order,created_at DESC').all());
});

router.post('/ads', uploadAd.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file ảnh' });
  const { title, link, order } = req.body;
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO advertisements (image_path,title,link,ad_order) VALUES (?,?,?,?)'
  ).run(req.file.filename, title || null, link || null, parseInt(order) || 0);
  res.status(201).json({ id: result.lastInsertRowid, image_path: req.file.filename, title });
});

router.put('/ads/:id', (req, res) => {
  const { title, link, order, active } = req.body;
  const db = getDb();
  const sets = []; const vals = [];
  if (title !== undefined) { sets.push('title=?'); vals.push(title); }
  if (link !== undefined) { sets.push('link=?'); vals.push(link); }
  if (order !== undefined) { sets.push('ad_order=?'); vals.push(parseInt(order)); }
  if (active !== undefined) { sets.push('active=?'); vals.push(active ? 1 : 0); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE advertisements SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.delete('/ads/:id', (req, res) => {
  const db = getDb();
  const ad = db.prepare('SELECT * FROM advertisements WHERE id=?').get(req.params.id);
  if (ad) {
    const imgPath = path.join(__dirname, '../../uploads/ads', ad.image_path);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    db.prepare('DELETE FROM advertisements WHERE id=?').run(req.params.id);
  }
  res.json({ message: 'Đã xóa' });
});

// ── Courses ────────────────────────────────────────────────────────────
router.get('/courses', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT c.*, u.full_name creator_name,
    (SELECT COUNT(*) FROM classes cl WHERE cl.course_id=c.id AND cl.active=1) class_count
    FROM courses c LEFT JOIN users u ON c.created_by=u.id
    WHERE c.active=1 ORDER BY c.created_at DESC
  `).all());
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

router.post('/courses/:id/thumbnail', uploadCourseThumbnail.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file ảnh' });
  const db = getDb();
  db.prepare('UPDATE courses SET thumbnail=? WHERE id=?').run(req.file.filename, req.params.id);
  res.json({ thumbnail: req.file.filename });
});

router.put('/courses/:id', (req, res) => {
  const { title, description, active } = req.body;
  const db = getDb();
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (active !== undefined) { sets.push('active=?'); vals.push(active ? 1 : 0); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE courses SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.delete('/courses/:id', (req, res) => {
  const db = getDb();
  db.transaction(() => hardDeleteCourse(db, parseInt(req.params.id)))();
  res.json({ message: 'Đã xóa vĩnh viễn' });
});

// Assign/remove teacher from course
router.get('/courses/:id/teachers', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT u.id,u.full_name,u.username,ct.can_edit
    FROM course_teachers ct JOIN users u ON ct.teacher_id=u.id WHERE ct.course_id=?
  `).all(req.params.id));
});

router.post('/courses/:id/teachers', (req, res) => {
  const { teacher_id, can_edit } = req.body;
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO course_teachers (course_id,teacher_id,can_edit) VALUES (?,?,?)').run(req.params.id, teacher_id, can_edit ? 1 : 0);
  res.json({ message: 'Đã gán giáo viên' });
});

router.delete('/courses/:id/teachers/:teacherId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM course_teachers WHERE course_id=? AND teacher_id=?').run(req.params.id, req.params.teacherId);
  res.json({ message: 'Đã xóa' });
});

// Course detail with classes
router.get('/courses/:id/detail', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT co.*,u.full_name creator_name FROM courses co LEFT JOIN users u ON co.created_by=u.id WHERE co.id=?').get(req.params.id);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy' });
  const classes = db.prepare(`
    SELECT cl.*,u.full_name teacher_name,
    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=cl.id) student_count,
    (SELECT COUNT(*) FROM lessons l WHERE l.class_id=cl.id) lesson_count,
    (SELECT COUNT(*) FROM homework h WHERE h.class_id=cl.id) homework_count
    FROM classes cl LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.course_id=? AND cl.active=1 ORDER BY cl.created_at
  `).all(req.params.id);
  res.json({ ...course, classes });
});

// Admin: add class to course
router.post('/courses/:id/classes', (req, res) => {
  const { title, description, teacher_id } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tiêu đề lớp học' });
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id=? AND active=1').get(req.params.id);
  if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });
  const tid = teacher_id || req.user.id;
  const result = db.prepare(
    'INSERT INTO classes (course_id,title,description,teacher_id) VALUES (?,?,?,?)'
  ).run(req.params.id, title, description || null, tid);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

// Get all classes (admin view)
router.get('/classes', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT cl.*,co.title course_title,u.full_name teacher_name,
    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=cl.id) student_count
    FROM classes cl LEFT JOIN courses co ON cl.course_id=co.id LEFT JOIN users u ON cl.teacher_id=u.id
    WHERE cl.active=1 ORDER BY cl.created_at DESC
  `).all());
});

module.exports = router;
