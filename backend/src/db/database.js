const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../../data/mathweb.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      teacher_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, student_id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    -- Trợ giảng của lớp học: thông tin liên hệ + lịch làm việc trong tuần (JSON, 7 ngày × 7 ca)
    CREATE TABLE IF NOT EXISTS class_assistants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      photo TEXT,
      phone TEXT,
      facebook_url TEXT,
      schedule TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Chương: nhóm bài giảng & bài tập trong một lớp, có thứ tự
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      chapter_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      chapter_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      video_url TEXT,
      video_type TEXT CHECK(video_type IN ('youtube','local','url')),
      lesson_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      pdf_file TEXT,
      answer_file TEXT,
      due_date DATETIME,
      answer_visible_date DATETIME,
      max_score INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Thời điểm học sinh BẤM "Làm bài" cho lượt làm hiện tại (chỉ dùng khi homework.time_limit_minutes
    -- có đặt, hiện chỉ áp dụng bài HSA) — dùng để tính hạn "hết giờ" = started_at + time_limit_minutes,
    -- độc lập với "Hạn nộp bài" chung của cả lớp. Mỗi học sinh 1 dòng/bài tập, ghi đè khi bắt đầu lượt mới.
    CREATE TABLE IF NOT EXISTS homework_attempts (
      homework_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      started_at DATETIME NOT NULL,
      PRIMARY KEY (homework_id, student_id),
      FOREIGN KEY (homework_id) REFERENCES homework(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      file_path TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      score REAL,
      feedback TEXT,
      graded_at DATETIME,
      graded_by_ai INTEGER DEFAULT 0,
      UNIQUE(homework_id, student_id),
      FOREIGN KEY (homework_id) REFERENCES homework(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS advertisements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      title TEXT,
      link TEXT,
      ad_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS course_teachers (
      course_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      can_edit INTEGER DEFAULT 0,
      PRIMARY KEY (course_id, teacher_id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    -- Học sinh tiêu biểu (điểm cao các kỳ thi)
    CREATE TABLE IF NOT EXISTS featured_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      exam TEXT,            -- kỳ thi (vd: Thi vào 10, HSG Toán...)
      achievement TEXT,     -- thành tích / điểm số
      description TEXT,
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Giáo viên & trợ giảng (giới thiệu công khai)
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      role_title TEXT,                 -- vd: Giáo viên Toán, Trợ giảng
      staff_type TEXT DEFAULT 'teacher', -- 'teacher' | 'assistant'
      description TEXT,
      facebook_url TEXT,               -- link Facebook để học sinh liên hệ
      phone TEXT,                      -- số điện thoại liên hệ
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Khóa học tiêu biểu (marketing, không phải khóa học hệ thống)
    CREATE TABLE IF NOT EXISTS featured_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image TEXT,
      student_count TEXT,   -- vd: "120 học sinh"
      description TEXT,
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Thành tích / kinh nghiệm các năm
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT,
      title TEXT NOT NULL,
      image TEXT,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Cấu hình trang (liên hệ, hero, số liệu) dạng key-value
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed cấu hình trang mặc định
  const defaults = {
    hero_title: 'Trung Tâm Giáo Dục APLUS Hoàng Mai',
    hero_subtitle: 'Không để ai bỏ lại — Thay đổi việc học các con là thay đổi tương lai số phận',
    stats_students: '500+',
    stats_teachers: '20+',
    stats_courses: '15+',
    stats_years: '10+',
    contact_address: 'Hoàng Mai, Hà Nội',
    contact_phone: '0123 456 789',
    contact_email: 'lienhe@aplushoangmai.edu.vn',
    contact_hours: 'Thứ 2 - Chủ nhật, 7:00 - 22:00',
    contact_facebook: '',
  };
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  // Migration: thêm cột plain_password để admin xem được mật khẩu
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some(c => c.name === 'plain_password')) {
    db.exec('ALTER TABLE users ADD COLUMN plain_password TEXT');
  }
  // Migration: thêm cột parent_phone (SĐT phụ huynh)
  if (!cols.some(c => c.name === 'parent_phone')) {
    db.exec('ALTER TABLE users ADD COLUMN parent_phone TEXT');
  }
  // Migration: ghi chú của giáo viên cho AI chấm bài
  const hwCols = db.prepare("PRAGMA table_info(homework)").all();
  if (!hwCols.some(c => c.name === 'grading_note')) {
    db.exec('ALTER TABLE homework ADD COLUMN grading_note TEXT');
  }
  // Migration: chi tiết chấm từng câu (JSON) trong bài nộp
  const subCols = db.prepare("PRAGMA table_info(submissions)").all();
  if (!subCols.some(c => c.name === 'grading_details')) {
    db.exec('ALTER TABLE submissions ADD COLUMN grading_details TEXT');
  }
  // Migration: nhiều file bài nộp (JSON array tên file). file_path giữ file đầu cho tương thích cũ
  if (!subCols.some(c => c.name === 'files')) {
    db.exec('ALTER TABLE submissions ADD COLUMN files TEXT');
  }
  // Migration: trạng thái chấm tự động (hàng đợi nền) + số lần đã thử chấm
  // grading_status: 'pending' | 'grading' | 'done' | 'failed' | NULL (không cần chấm AI)
  if (!subCols.some(c => c.name === 'grading_status')) {
    db.exec('ALTER TABLE submissions ADD COLUMN grading_status TEXT');
  }
  if (!subCols.some(c => c.name === 'grading_attempts')) {
    db.exec('ALTER TABLE submissions ADD COLUMN grading_attempts INTEGER DEFAULT 0');
  }
  // Migration: chương cho bài giảng & bài tập
  const lessonCols = db.prepare("PRAGMA table_info(lessons)").all();
  if (!lessonCols.some(c => c.name === 'chapter_id')) {
    db.exec('ALTER TABLE lessons ADD COLUMN chapter_id INTEGER');
  }
  if (!hwCols.some(c => c.name === 'chapter_id')) {
    db.exec('ALTER TABLE homework ADD COLUMN chapter_id INTEGER');
  }
  // Migration: link video chữa bài (YouTube) cho bài tập
  if (!hwCols.some(c => c.name === 'solution_video_url')) {
    db.exec('ALTER TABLE homework ADD COLUMN solution_video_url TEXT');
  }
  // Migration: cấu hình các kiểu nộp bài (JSON) — trắc nghiệm, đúng/sai, trả lời ngắn, tự luận + đáp án
  if (!hwCols.some(c => c.name === 'parts_config')) {
    db.exec('ALTER TABLE homework ADD COLUMN parts_config TEXT');
  }
  // Migration: đáp án có cấu trúc học sinh điền ở giao diện làm bài (JSON)
  if (!subCols.some(c => c.name === 'structured_answers')) {
    db.exec('ALTER TABLE submissions ADD COLUMN structured_answers TEXT');
  }
  // Migration: file đính kèm bài giảng (JSON array [{file,name,kind}], kind: 'doc' tài liệu | 'answer' đáp án BT trên lớp)
  if (!lessonCols.some(c => c.name === 'attachments')) {
    db.exec('ALTER TABLE lessons ADD COLUMN attachments TEXT');
  }
  // Migration: thứ tự bài tập TRONG TỪNG CHƯƠNG (độc lập với bài giảng) — trước đây bài tập không có
  // cột thứ tự, hiển thị theo created_at DESC nên số thứ tự lúc tạo/sửa không khớp giao diện.
  if (!hwCols.some(c => c.name === 'hw_order')) {
    db.exec('ALTER TABLE homework ADD COLUMN hw_order INTEGER DEFAULT 0');
  }
  // Migration: giới hạn số lần nộp bài của học sinh (NULL = không giới hạn)
  if (!hwCols.some(c => c.name === 'max_attempts')) {
    db.exec('ALTER TABLE homework ADD COLUMN max_attempts INTEGER');
  }
  // Migration: đếm số lần học sinh đã nộp bài (đối chiếu với homework.max_attempts)
  if (!subCols.some(c => c.name === 'submit_count')) {
    db.exec('ALTER TABLE submissions ADD COLUMN submit_count INTEGER DEFAULT 0');
  }
  // Migration: link Facebook + SĐT của giáo viên/trợ giảng để học sinh liên hệ
  const staffCols = db.prepare("PRAGMA table_info(staff)").all();
  if (!staffCols.some(c => c.name === 'facebook_url')) {
    db.exec('ALTER TABLE staff ADD COLUMN facebook_url TEXT');
  }
  if (!staffCols.some(c => c.name === 'phone')) {
    db.exec('ALTER TABLE staff ADD COLUMN phone TEXT');
  }
  // Migration: thứ tự học sinh trong lớp (kéo thả sắp xếp ở giao diện)
  const csCols = db.prepare("PRAGMA table_info(class_students)").all();
  if (!csCols.some(c => c.name === 'sort_order')) {
    db.exec('ALTER TABLE class_students ADD COLUMN sort_order INTEGER DEFAULT 0');
  }
  // Migration: cờ đánh dấu lớp đã được giáo viên tự kéo thả sắp xếp học sinh chưa.
  // Chưa kéo thả (=0) → LUÔN hiển thị theo bảng chữ cái (tên riêng) tự động, kể cả khi thêm/xóa học sinh.
  // Đã kéo thả (=1) → giữ đúng thứ tự đã lưu (sort_order), học sinh thêm mới xếp cuối danh sách.
  const classCols = db.prepare("PRAGMA table_info(classes)").all();
  if (!classCols.some(c => c.name === 'custom_student_order')) {
    db.exec('ALTER TABLE classes ADD COLUMN custom_student_order INTEGER DEFAULT 0');
  }
  // Migration: phân môn của chương — 'algebra' (Đại số) | 'geometry' (Hình học). Đại số hiển thị trước,
  // Hình học sau; số thứ tự (chapter_order) độc lập theo từng môn.
  const chapterCols = db.prepare("PRAGMA table_info(chapters)").all();
  if (!chapterCols.some(c => c.name === 'subject')) {
    db.exec("ALTER TABLE chapters ADD COLUMN subject TEXT DEFAULT 'algebra'");
  }
  // Migration: "quy chuẩn nhận xét" (JSON) do AI soạn ĐÚNG 1 LẦN khi giáo viên tạo/cập nhật đáp án —
  // dùng để chấm tự động (không dùng AI) tạo nhận xét khái quát cho phần trắc nghiệm/đúng-sai/trả lời ngắn.
  // KHÔNG hiển thị trên web, chỉ dùng nội bộ khi chấm bài (xem gradingQueue.js).
  if (!hwCols.some(c => c.name === 'feedback_rubric')) {
    db.exec('ALTER TABLE homework ADD COLUMN feedback_rubric TEXT');
  }
  // Kiểu bài: 'thpt' (mặc định, nộp bài như cũ — 4 phần TN/ĐS/TLN/TL, điểm quy đổi về "Thang điểm")
  // hoặc 'hsa' (mỗi câu TN hoặc TLN tự chọn, mỗi câu 1 điểm, điểm cuối = tổng điểm thô, KHÔNG quy đổi).
  if (!hwCols.some(c => c.name === 'exam_type')) {
    db.exec("ALTER TABLE homework ADD COLUMN exam_type TEXT DEFAULT 'thpt'");
  }
  if (!hwCols.some(c => c.name === 'hsa_config')) {
    db.exec('ALTER TABLE homework ADD COLUMN hsa_config TEXT');
  }
  // Thời gian làm bài tối đa (phút), tính từ lúc học sinh bấm "Làm bài" — CHỈ áp dụng bài HSA.
  // NULL = không giới hạn thời gian (như bài tập thường, chỉ theo "Hạn nộp bài" chung).
  if (!hwCols.some(c => c.name === 'time_limit_minutes')) {
    db.exec('ALTER TABLE homework ADD COLUMN time_limit_minutes INTEGER');
  }

  // Đồng bộ dữ liệu: mỗi khóa học chỉ do 1 giáo viên phụ trách (courses.created_by) nên mọi lớp trong khóa
  // phải theo đúng giáo viên đó — trước đây admin có thể tạo lớp gán cho giáo viên khác, gây lệch dữ liệu.
  db.exec(`
    UPDATE classes SET teacher_id = (SELECT created_by FROM courses WHERE courses.id = classes.course_id)
    WHERE course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM courses c JOIN users u ON u.id = c.created_by
      WHERE c.id = classes.course_id AND u.role = 'teacher' AND c.created_by <> classes.teacher_id
    )
  `);

  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (username,password,plain_password,full_name,role) VALUES (?,?,?,?,?)")
      .run('admin', hash, 'admin123', 'Quản Trị Viên', 'admin');
    console.log('Default admin created: admin / admin123');
  }
}

module.exports = { getDb };
