const path = require('path');
const fs = require('fs');

const UP = path.join(__dirname, '../../uploads');

function rmFile(subDir, name) {
  if (!name) return;
  const f = path.join(UP, subDir, name);
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
}

// Xóa các file của một bài nộp: file chính (file_path) + nhiều file (files: JSON array)
function rmSubmissionFiles(sub) {
  rmFile('submissions', sub.file_path);
  if (sub.files) {
    try { JSON.parse(sub.files).forEach((name) => rmFile('submissions', name)); } catch {}
  }
}

// Xóa VĨNH VIỄN một học sinh: toàn bộ bài nộp (+ file), liên kết lớp, rồi tài khoản.
// Dùng khi xóa lớp/khóa hoặc khi giáo viên xóa hàng loạt → tiết kiệm dữ liệu.
function hardDeleteStudent(db, studentId) {
  const subs = db.prepare('SELECT file_path,files FROM submissions WHERE student_id=?').all(studentId);
  subs.forEach(rmSubmissionFiles);
  db.prepare('DELETE FROM submissions WHERE student_id=?').run(studentId);
  db.prepare('DELETE FROM class_students WHERE student_id=?').run(studentId);
  // Gỡ liên kết "người tạo" để không vướng ràng buộc, rồi xóa tài khoản
  db.prepare('UPDATE courses SET created_by=NULL WHERE created_by=?').run(studentId);
  db.prepare('UPDATE users SET created_by=NULL WHERE created_by=?').run(studentId);
  db.prepare("DELETE FROM users WHERE id=? AND role='student'").run(studentId);
}

// Xóa sạch dữ liệu của 1 lớp (bài nộp + file, bài tập + file, bài giảng + video, học sinh trong lớp).
// purgeStudents=true: học sinh CHỈ thuộc lớp này sẽ bị xóa hẳn (tài khoản + dữ liệu) để tiết kiệm dữ liệu;
// học sinh còn học lớp khác thì chỉ gỡ khỏi lớp này.
function hardDeleteClass(db, classId, { purgeStudents = true } = {}) {
  const studentIds = db.prepare('SELECT student_id FROM class_students WHERE class_id=?').all(classId).map(r => r.student_id);

  const homeworks = db.prepare('SELECT id,pdf_file,answer_file FROM homework WHERE class_id=?').all(classId);
  for (const hw of homeworks) {
    const subs = db.prepare('SELECT file_path,files FROM submissions WHERE homework_id=?').all(hw.id);
    subs.forEach(rmSubmissionFiles);
    db.prepare('DELETE FROM submissions WHERE homework_id=?').run(hw.id);
    rmFile('homework', hw.pdf_file);
    rmFile('homework', hw.answer_file);
  }
  db.prepare('DELETE FROM homework WHERE class_id=?').run(classId);

  const lessons = db.prepare("SELECT video_url,video_type,attachments FROM lessons WHERE class_id=?").all(classId);
  lessons.forEach(l => {
    if (l.video_type === 'local') rmFile('videos', l.video_url);
    // File đính kèm bài giảng (tài liệu / đáp án BT trên lớp)
    if (l.attachments) {
      try { JSON.parse(l.attachments).forEach((a) => rmFile('lessons', a.file)); } catch {}
    }
  });
  db.prepare('DELETE FROM lessons WHERE class_id=?').run(classId);

  db.prepare('DELETE FROM chapters WHERE class_id=?').run(classId);

  const assistants = db.prepare('SELECT photo FROM class_assistants WHERE class_id=?').all(classId);
  assistants.forEach(a => rmFile('assistants', a.photo));
  db.prepare('DELETE FROM class_assistants WHERE class_id=?').run(classId);

  db.prepare('DELETE FROM class_students WHERE class_id=?').run(classId);
  db.prepare('DELETE FROM classes WHERE id=?').run(classId);

  if (purgeStudents) {
    for (const sid of studentIds) {
      // Còn học lớp khác → giữ lại; chỉ thuộc lớp vừa xóa → xóa hẳn
      const stillEnrolled = db.prepare('SELECT 1 FROM class_students WHERE student_id=? LIMIT 1').get(sid);
      if (!stillEnrolled) hardDeleteStudent(db, sid);
    }
  }
}

// Xóa thật 1 khóa học + toàn bộ lớp & dữ liệu con
function hardDeleteCourse(db, courseId) {
  const course = db.prepare('SELECT thumbnail FROM courses WHERE id=?').get(courseId);
  if (!course) return;
  const classes = db.prepare('SELECT id FROM classes WHERE course_id=?').all(courseId);
  for (const c of classes) hardDeleteClass(db, c.id);
  db.prepare('DELETE FROM course_teachers WHERE course_id=?').run(courseId);
  rmFile('courses', course.thumbnail);
  db.prepare('DELETE FROM courses WHERE id=?').run(courseId);
}

module.exports = { hardDeleteClass, hardDeleteCourse, hardDeleteStudent };
