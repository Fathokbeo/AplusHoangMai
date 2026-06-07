const path = require('path');
const fs = require('fs');

const UP = path.join(__dirname, '../../uploads');

function rmFile(subDir, name) {
  if (!name) return;
  const f = path.join(UP, subDir, name);
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
}

// Xóa sạch dữ liệu của 1 lớp (bài nộp + file, bài tập + file, bài giảng + video, học sinh trong lớp)
function hardDeleteClass(db, classId) {
  const homeworks = db.prepare('SELECT id,pdf_file,answer_file FROM homework WHERE class_id=?').all(classId);
  for (const hw of homeworks) {
    const subs = db.prepare('SELECT file_path FROM submissions WHERE homework_id=?').all(hw.id);
    subs.forEach(s => rmFile('submissions', s.file_path));
    db.prepare('DELETE FROM submissions WHERE homework_id=?').run(hw.id);
    rmFile('homework', hw.pdf_file);
    rmFile('homework', hw.answer_file);
  }
  db.prepare('DELETE FROM homework WHERE class_id=?').run(classId);

  const lessons = db.prepare("SELECT video_url,video_type FROM lessons WHERE class_id=?").all(classId);
  lessons.forEach(l => { if (l.video_type === 'local') rmFile('videos', l.video_url); });
  db.prepare('DELETE FROM lessons WHERE class_id=?').run(classId);

  db.prepare('DELETE FROM class_students WHERE class_id=?').run(classId);
  db.prepare('DELETE FROM classes WHERE id=?').run(classId);
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

module.exports = { hardDeleteClass, hardDeleteCourse };
