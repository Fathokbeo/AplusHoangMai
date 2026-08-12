const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadVideo, uploadCourseThumbnail, uploadLessonFile, uploadAssistantPhoto } = require('../middleware/upload');
const { hardDeleteCourse, hardDeleteClass, hardDeleteStudent } = require('../services/cascade');
const { classRanking, classMonths, ymOf } = require('../services/classRanking');
const { compareVietnameseName } = require('../services/vietnameseName');

router.use(authMiddleware, requireRole('teacher', 'admin'));

// Thêm 1 học sinh vào class_students, giữ đúng vị trí trong danh sách của lớp:
// - Lớp CHƯA từng kéo thả (custom_student_order=0): thứ tự hiển thị luôn tính lại theo bảng chữ cái
//   ở GET /classes/:id nên sort_order không quan trọng, chỉ cần thêm cuối cho đơn giản.
// - Lớp ĐÃ từng kéo thả (custom_student_order=1): thứ tự hiển thị = sort_order đã lưu, nên học sinh mới
//   phải được CHÈN đúng vị trí bảng chữ cái (so khớp compareVietnameseName), không phải luôn đẩy xuống cuối.
function insertStudentSorted(db, classId, studentId, fullName, customOrder) {
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM class_students WHERE class_id=?').get(classId).m;
  if (!customOrder) {
    db.prepare('INSERT INTO class_students (class_id,student_id,sort_order) VALUES (?,?,?)').run(classId, studentId, maxOrder + 1);
    return;
  }
  const existing = db.prepare(`
    SELECT cs.sort_order, u.full_name FROM class_students cs JOIN users u ON cs.student_id=u.id
    WHERE cs.class_id=? ORDER BY cs.sort_order
  `).all(classId);
  if (existing.length === 0) {
    db.prepare('INSERT INTO class_students (class_id,student_id,sort_order) VALUES (?,?,?)').run(classId, studentId, maxOrder + 1);
    return;
  }
  // Thứ tự đã kéo thả có thể KHÔNG theo bảng chữ cái (giáo viên chỉnh tay), nên không thể dò tuần tự
  // theo vị trí hiện tại. Thay vào đó tìm "hàng xóm gần nhất về tên" (so toàn bộ danh sách) rồi chèn
  // ngay sau vị trí hiện tại của hàng xóm đó — luôn cho vị trí hợp lý dù thứ tự gốc có xáo trộn thế nào.
  let predecessor = null; // học sinh có tên gần nhất, đứng trước fullName theo bảng chữ cái
  existing.forEach((s) => {
    if (compareVietnameseName(s.full_name, fullName) < 0) {
      if (!predecessor || compareVietnameseName(s.full_name, predecessor.full_name) > 0) predecessor = s;
    }
  });
  const insertOrder = predecessor ? predecessor.sort_order + 1 : existing[0].sort_order;
  db.prepare('UPDATE class_students SET sort_order = sort_order + 1 WHERE class_id=? AND sort_order >= ?').run(classId, insertOrder);
  db.prepare('INSERT INTO class_students (class_id,student_id,sort_order) VALUES (?,?,?)').run(classId, studentId, insertOrder);
}

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
  // Lớp luôn do giáo viên phụ trách khóa học đảm nhận, kể cả khi admin là người tạo lớp.
  const tid = course.created_by || req.user.id;
  const result = db.prepare(
    'INSERT INTO classes (course_id,title,description,teacher_id) VALUES (?,?,?,?)'
  ).run(req.params.courseId, title, description || null, tid);
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
  // Chưa từng kéo thả sắp xếp → LUÔN hiển thị theo bảng chữ cái (tên riêng) tự động, kể cả khi vừa
  // thêm/xóa học sinh. Đã từng kéo thả → giữ đúng thứ tự đã lưu (sort_order), học sinh mới xếp cuối.
  const students = db.prepare(`
    SELECT u.id,u.username,u.full_name,u.parent_phone,cs.sort_order FROM class_students cs
    JOIN users u ON cs.student_id=u.id WHERE cs.class_id=? AND u.active=1
  `).all(req.params.id);
  students.sort((a, b) => (cls.custom_student_order ? (a.sort_order - b.sort_order) : 0) || compareVietnameseName(a.full_name, b.full_name));
  students.forEach((s) => { delete s.sort_order; });
  const chapters = db.prepare('SELECT * FROM chapters WHERE class_id=? ORDER BY chapter_order,created_at').all(req.params.id);
  const lessons = db.prepare('SELECT * FROM lessons WHERE class_id=? ORDER BY lesson_order,created_at').all(req.params.id);
  const homework = db.prepare('SELECT * FROM homework WHERE class_id=? ORDER BY hw_order,created_at').all(req.params.id);
  homework.forEach((h) => { delete h.feedback_rubric; }); // nội bộ, không hiển thị trên web
  const assistants = db.prepare('SELECT * FROM class_assistants WHERE class_id=? ORDER BY created_at').all(req.params.id);
  res.json({ ...cls, students, chapters, lessons, homework, assistants });
});

// ── Xếp hạng lớp theo THÁNG (giáo viên theo dõi thứ bậc, xem lại các tháng trước) ──
// ?month=YYYY-MM (tùy chọn, mặc định tháng hiện tại). Top 3 gắn huy chương vàng/bạc/đồng ở giao diện.
router.get('/classes/:id/ranking', (req, res) => {
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=? AND active=1').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  const currentYm = ymOf(new Date().toISOString());
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : currentYm;

  const students = db.prepare(`
    SELECT u.id, u.username, u.full_name FROM class_students cs
    JOIN users u ON cs.student_id=u.id WHERE cs.class_id=? AND u.active=1
  `).all(req.params.id);

  const rankMap = classRanking(db, req.params.id, null, month);
  const rows = students.map((s) => {
    const r = rankMap.get(s.id) || {};
    return { ...s, avg: r.avg ?? null, counted: r.counted ?? 0, graded: r.graded ?? 0, rank: r.rank ?? null };
  });
  // Có hạng đứng trước (theo hạng tăng dần), chưa có hạng xếp sau
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.avg ?? -1) - (a.avg ?? -1));

  // Các tháng có bài tập để giáo viên chọn xem lại; luôn kèm tháng hiện tại
  const months = classMonths(db, req.params.id);
  if (!months.includes(currentYm)) { months.push(currentYm); months.sort(); months.reverse(); }

  res.json({ month, months, current_month: currentYm, students: rows });
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
    const name = full_name || db.prepare('SELECT full_name FROM users WHERE id=?').get(sid).full_name;
    insertStudentSorted(db, req.params.id, sid, name, cls.custom_student_order);
    res.status(201).json({ message: 'Đã thêm học sinh vào lớp', student_id: sid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ message: 'Học sinh đã trong lớp' });
    throw e;
  }
});

// Tạo tài khoản học sinh HÀNG LOẠT cho một lớp (nhập từ file Excel ở giao diện).
// Body: { students: [{ full_name, username, password, parent_phone }] }
// Trả về: số tạo thành công + danh sách dòng lỗi (trùng tên đăng nhập, thiếu thông tin...).
router.post('/classes/:id/students/bulk', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ message: 'Danh sách học sinh trống' });
  }
  if (students.length > 500) {
    return res.status(400).json({ message: 'Tối đa 500 học sinh mỗi lần nhập' });
  }
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  let created = 0;
  const errors = [];
  const insertUser = db.prepare(
    'INSERT INTO users (username,password,plain_password,full_name,parent_phone,role,created_by) VALUES (?,?,?,?,?,?,?)'
  );

  db.transaction(() => {
    students.forEach((row, i) => {
      const line = Number(row.row) || i + 1; // số dòng trong file Excel để báo lỗi dễ tìm
      const full_name = String(row.full_name || '').trim();
      const username = String(row.username || '').trim();
      const password = String(row.password || '').trim();
      const parent_phone = String(row.parent_phone || '').trim() || null;

      if (!full_name || !username || !password) {
        errors.push({ row: line, username, reason: 'Thiếu họ tên, tên đăng nhập hoặc mật khẩu' });
        return;
      }
      if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
        errors.push({ row: line, username, reason: 'Tên đăng nhập đã tồn tại' });
        return;
      }
      const r = insertUser.run(username, bcrypt.hashSync(password, 10), password, full_name, parent_phone, 'student', req.user.id);
      insertStudentSorted(db, req.params.id, r.lastInsertRowid, full_name, cls.custom_student_order);
      created++;
    });
  })();

  res.status(201).json({
    message: `Đã tạo ${created}/${students.length} tài khoản và thêm vào lớp`,
    created, failed: errors.length, errors,
  });
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
    const name = db.prepare('SELECT full_name FROM users WHERE id=?').get(req.params.studentId).full_name;
    insertStudentSorted(db, to_class_id, req.params.studentId, name, target.custom_student_order);
  })();
  res.json({ message: from_class_id ? 'Đã chuyển lớp' : 'Đã chỉ định lớp' });
});

router.delete('/classes/:id/students/:studentId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM class_students WHERE class_id=? AND student_id=?').run(req.params.id, req.params.studentId);
  res.json({ message: 'Đã xóa' });
});

// Xóa hàng loạt học sinh khỏi lớp + xóa hẳn dữ liệu (tiết kiệm dữ liệu).
// HS còn học lớp khác → chỉ gỡ khỏi lớp này; HS chỉ thuộc lớp này → xóa hẳn tài khoản & dữ liệu.
router.post('/classes/:id/students/bulk-delete', (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ message: 'Chưa chọn học sinh nào' });
  }
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  const ids = student_ids.map(Number).filter(Boolean);
  let purged = 0, kept = 0;
  db.transaction(() => {
    for (const sid of ids) {
      db.prepare('DELETE FROM class_students WHERE class_id=? AND student_id=?').run(req.params.id, sid);
      const stillEnrolled = db.prepare('SELECT 1 FROM class_students WHERE student_id=? LIMIT 1').get(sid);
      if (!stillEnrolled) { hardDeleteStudent(db, sid); purged++; } else { kept++; }
    }
  })();
  res.json({ message: `Đã xử lý ${ids.length} học sinh`, purged, kept });
});

// Đổi thứ tự học sinh trong lớp (kéo thả sắp xếp ở giao diện). Body: { student_ids: [...] } theo thứ tự mới.
router.put('/classes/:id/students/reorder', (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ message: 'Danh sách trống' });
  }
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  const update = db.prepare('UPDATE class_students SET sort_order=? WHERE class_id=? AND student_id=?');
  db.transaction(() => {
    student_ids.forEach((sid, i) => update.run(i + 1, req.params.id, Number(sid)));
    db.prepare('UPDATE classes SET custom_student_order=1 WHERE id=?').run(req.params.id);
  })();
  res.json({ message: 'Đã cập nhật thứ tự' });
});

// ── Chapters (chương: nhóm bài giảng & bài tập) ───────────────────────
router.post('/classes/:id/chapters', (req, res) => {
  const { title, chapter_order, subject } = req.body;
  if (!title) return res.status(400).json({ message: 'Cần tên chương' });
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const result = db.prepare(
    'INSERT INTO chapters (class_id,title,chapter_order,subject) VALUES (?,?,?,?)'
  ).run(req.params.id, title, parseInt(chapter_order) || 0, subject === 'geometry' ? 'geometry' : 'algebra');
  res.status(201).json({ id: result.lastInsertRowid, title });
});

router.put('/chapters/:id', (req, res) => {
  const { title, chapter_order, subject } = req.body;
  const db = getDb();
  const ch = db.prepare('SELECT ch.*,c.teacher_id FROM chapters ch JOIN classes c ON ch.class_id=c.id WHERE ch.id=?').get(req.params.id);
  if (!ch) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && ch.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (title) { sets.push('title=?'); vals.push(title); }
  if (chapter_order !== undefined) { sets.push('chapter_order=?'); vals.push(parseInt(chapter_order) || 0); }
  if (subject !== undefined) { sets.push('subject=?'); vals.push(subject === 'geometry' ? 'geometry' : 'algebra'); }
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

// ── Trợ giảng của lớp (thông tin liên hệ + lịch làm việc trong tuần) ───
router.post('/classes/:id/assistants', (req, res) => {
  const { full_name, phone, facebook_url } = req.body;
  if (!full_name) return res.status(400).json({ message: 'Cần họ tên trợ giảng' });
  const db = getDb();
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
  if (req.user.role === 'teacher' && cls.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const result = db.prepare(
    'INSERT INTO class_assistants (class_id,full_name,phone,facebook_url) VALUES (?,?,?,?)'
  ).run(req.params.id, full_name, phone || null, facebook_url || null);
  res.status(201).json({ id: result.lastInsertRowid, full_name });
});

router.put('/assistants/:id', (req, res) => {
  const { full_name, phone, facebook_url } = req.body;
  const db = getDb();
  const a = db.prepare('SELECT ca.*,c.teacher_id FROM class_assistants ca JOIN classes c ON ca.class_id=c.id WHERE ca.id=?').get(req.params.id);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && a.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const sets = []; const vals = [];
  if (full_name) { sets.push('full_name=?'); vals.push(full_name); }
  if (phone !== undefined) { sets.push('phone=?'); vals.push(phone || null); }
  if (facebook_url !== undefined) { sets.push('facebook_url=?'); vals.push(facebook_url || null); }
  if (sets.length > 0) { vals.push(req.params.id); db.prepare(`UPDATE class_assistants SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ message: 'Đã cập nhật' });
});

router.post('/assistants/:id/photo', uploadAssistantPhoto.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file ảnh' });
  const db = getDb();
  const a = db.prepare('SELECT ca.*,c.teacher_id FROM class_assistants ca JOIN classes c ON ca.class_id=c.id WHERE ca.id=?').get(req.params.id);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && a.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  if (a.photo) {
    const old = path.join(__dirname, '../../uploads/assistants', a.photo);
    if (fs.existsSync(old)) { try { fs.unlinkSync(old); } catch {} }
  }
  db.prepare('UPDATE class_assistants SET photo=? WHERE id=?').run(req.file.filename, req.params.id);
  res.json({ photo: req.file.filename });
});

// Lưu lịch làm việc: JSON { mon:{s1:'',s2:'',...}, tue:{...}, ... sun:{...} } — 7 ngày × 7 ca cố định
router.put('/assistants/:id/schedule', (req, res) => {
  const { schedule } = req.body;
  if (!schedule || typeof schedule !== 'object') return res.status(400).json({ message: 'Dữ liệu lịch không hợp lệ' });
  const db = getDb();
  const a = db.prepare('SELECT ca.*,c.teacher_id FROM class_assistants ca JOIN classes c ON ca.class_id=c.id WHERE ca.id=?').get(req.params.id);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && a.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  db.prepare('UPDATE class_assistants SET schedule=? WHERE id=?').run(JSON.stringify(schedule), req.params.id);
  res.json({ message: 'Đã lưu lịch làm việc' });
});

router.delete('/assistants/:id', (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT ca.*,c.teacher_id FROM class_assistants ca JOIN classes c ON ca.class_id=c.id WHERE ca.id=?').get(req.params.id);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy' });
  if (req.user.role === 'teacher' && a.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  if (a.photo) {
    const f = path.join(__dirname, '../../uploads/assistants', a.photo);
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
  }
  db.prepare('DELETE FROM class_assistants WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa trợ giảng' });
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

// Danh sách file đính kèm của bài giảng (JSON) → mảng; hỏng/không có → []
function parseAttachments(raw) {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function rmLessonFile(name) {
  const f = path.join(__dirname, '../../uploads/lessons', name);
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
}

router.delete('/lessons/:id', (req, res) => {
  const db = getDb();
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (lesson) {
    parseAttachments(lesson.attachments).forEach((a) => rmLessonFile(a.file));
    if (lesson.video_type === 'local' && lesson.video_url) {
      const v = path.join(__dirname, '../../uploads/videos', lesson.video_url);
      if (fs.existsSync(v)) { try { fs.unlinkSync(v); } catch { /* ignore */ } }
    }
  }
  db.prepare('DELETE FROM lessons WHERE id=?').run(req.params.id);
  res.json({ message: 'Đã xóa' });
});

router.post('/lessons/:id/video', uploadVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Cần file video' });
  const db = getDb();
  db.prepare("UPDATE lessons SET video_url=?,video_type='local' WHERE id=?").run(req.file.filename, req.params.id);
  res.json({ filename: req.file.filename });
});

// ── File đính kèm bài giảng: tài liệu bài giảng / đáp án bài tập trên lớp ──
// kind: 'doc' (tài liệu) | 'answer' (đáp án BT trên lớp). Nhiều file mỗi lần.
router.post('/lessons/:id/attachments', uploadLessonFile.array('files', 10), (req, res) => {
  const db = getDb();
  const lesson = db.prepare('SELECT l.*,c.teacher_id FROM lessons l JOIN classes c ON l.class_id=c.id WHERE l.id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài giảng' });
  if (req.user.role === 'teacher' && lesson.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ message: 'Cần ít nhất một file' });

  const kind = req.body.kind === 'answer' ? 'answer' : 'doc';
  const list = parseAttachments(lesson.attachments);
  files.forEach((f) => {
    // Trình duyệt gửi tên file UTF-8 nhưng multer đọc theo latin1 → giải mã lại cho tên tiếng Việt
    let name = f.originalname;
    try { name = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch { /* giữ nguyên */ }
    list.push({ file: f.filename, name, kind });
  });
  db.prepare('UPDATE lessons SET attachments=? WHERE id=?').run(JSON.stringify(list), req.params.id);
  res.status(201).json({ attachments: list });
});

router.delete('/lessons/:id/attachments/:file', (req, res) => {
  const db = getDb();
  const lesson = db.prepare('SELECT l.*,c.teacher_id FROM lessons l JOIN classes c ON l.class_id=c.id WHERE l.id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài giảng' });
  if (req.user.role === 'teacher' && lesson.teacher_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  const list = parseAttachments(lesson.attachments);
  const target = list.find((a) => a.file === req.params.file);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy file' });
  rmLessonFile(target.file);
  const next = list.filter((a) => a.file !== req.params.file);
  db.prepare('UPDATE lessons SET attachments=? WHERE id=?').run(next.length ? JSON.stringify(next) : null, req.params.id);
  res.json({ attachments: next });
});

module.exports = router;
