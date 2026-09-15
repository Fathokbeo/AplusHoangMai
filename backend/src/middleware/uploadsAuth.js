const { getDb } = require('../db/database');
const { userFromRequest } = require('../services/security');

// Ảnh của trang giới thiệu công khai (trang chủ, khóa tiêu biểu, giáo viên...) — khách vãng lai xem được.
const PUBLIC_DIRS = new Set(['ads', 'courses', 'featured_students', 'staff', 'featured_courses', 'achievements']);

// Thư mục cần đăng nhập + đúng quyền: đề bài, đáp án, bài nộp, video và tài liệu bài giảng, ảnh trợ giảng.
const PROTECTED_DIRS = new Set(['homework', 'submissions', 'videos', 'lessons', 'assistants']);

// Chặn ký tự đại diện của LIKE để tên file do người dùng gửi lên không khớp nhầm sang bản ghi khác.
const likeSafe = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

function canAccessClass(db, user, classId) {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return !!db.prepare('SELECT 1 FROM classes WHERE id=? AND teacher_id=?').get(classId, user.id);
  return !!db.prepare('SELECT 1 FROM class_students WHERE class_id=? AND student_id=?').get(classId, user.id);
}

// Trả về 'ok' | 'forbidden' (file có thật nhưng không đúng quyền) | 'notfound' (không file nào như vậy).
function checkFileAccess(db, user, dir, file) {
  const verdict = (allowed) => (allowed ? 'ok' : 'forbidden');

  if (dir === 'assistants') return 'ok'; // ảnh trợ giảng: mọi tài khoản đã đăng nhập đều xem được

  if (dir === 'homework') {
    const hw = db.prepare('SELECT class_id,answer_file,answer_visible_date FROM homework WHERE pdf_file=? OR answer_file=?').get(file, file);
    if (!hw) return 'notfound';
    if (!canAccessClass(db, user, hw.class_id)) return 'forbidden';
    // File ĐÁP ÁN: học sinh chỉ tải được từ "Thời gian xem đáp án" trở đi — giống hệt ràng buộc mà API
    // đang áp dụng, để không thể lấy đáp án sớm bằng cách gọi thẳng link file.
    if (user.role === 'student' && hw.answer_file === file) {
      return verdict(!!hw.answer_visible_date && new Date().toISOString() >= hw.answer_visible_date);
    }
    return 'ok';
  }

  if (dir === 'submissions') {
    const sub = db.prepare(`
      SELECT s.student_id, h.class_id FROM submissions s JOIN homework h ON s.homework_id=h.id
      WHERE s.file_path=? OR s.files LIKE ? ESCAPE '\\'
    `).get(file, `%"${likeSafe(file)}"%`);
    if (!sub) return 'notfound';
    if (user.role === 'student') return verdict(sub.student_id === user.id); // chỉ xem bài của chính mình
    return verdict(canAccessClass(db, user, sub.class_id));
  }

  if (dir === 'videos') {
    const lesson = db.prepare("SELECT class_id FROM lessons WHERE video_url=? AND video_type='local'").get(file);
    if (!lesson) return 'notfound';
    return verdict(canAccessClass(db, user, lesson.class_id));
  }

  if (dir === 'lessons') {
    const lesson = db.prepare(`SELECT class_id FROM lessons WHERE attachments LIKE ? ESCAPE '\\'`).get(`%"${likeSafe(file)}"%`);
    if (!lesson) return 'notfound';
    return verdict(canAccessClass(db, user, lesson.class_id));
  }

  return 'notfound';
}

// Kiểm tra quyền trước khi phục vụ file tĩnh trong /uploads.
function uploadsAuth(req, res, next) {
  let decoded;
  try { decoded = decodeURIComponent(req.path); } catch { return res.status(400).json({ message: 'Đường dẫn không hợp lệ' }); }

  // File luôn nằm đúng 1 cấp thư mục: /<thư mục>/<tên file>. Dạng khác (kể cả ".." leo thư mục) đều chặn.
  const parts = decoded.split('/');
  if (parts.length !== 3 || parts[0] !== '' || !parts[1] || !parts[2] || parts.includes('..')) {
    return res.status(404).json({ message: 'Không tìm thấy file' });
  }
  const [, dir, file] = parts;

  if (PUBLIC_DIRS.has(dir)) return next();
  if (!PROTECTED_DIRS.has(dir)) return res.status(404).json({ message: 'Không tìm thấy file' });

  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ message: 'Cần đăng nhập để xem file này' });

  const verdict = checkFileAccess(getDb(), user, dir, file);
  if (verdict === 'notfound') return res.status(404).json({ message: 'Không tìm thấy file' });
  if (verdict !== 'ok') return res.status(403).json({ message: 'Không có quyền xem file này' });
  next();
}

module.exports = { uploadsAuth, PUBLIC_DIRS };
