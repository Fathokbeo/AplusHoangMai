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

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      video_url TEXT,
      video_type TEXT CHECK(video_type IN ('youtube','local','url')),
      lesson_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
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

  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (username,password,plain_password,full_name,role) VALUES (?,?,?,?,?)")
      .run('admin', hash, 'admin123', 'Quản Trị Viên', 'admin');
    console.log('Default admin created: admin / admin123');
  }
}

module.exports = { getDb };
