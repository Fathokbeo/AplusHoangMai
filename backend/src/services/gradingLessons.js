// "Sổ kinh nghiệm chấm" cho AI — AI không tự học giữa các lần gọi, nên ta GHI LẠI kinh nghiệm rồi gửi kèm
// mỗi lần chấm:
//  1) Kinh nghiệm từ giáo viên: khi sửa điểm một bài AI đã chấm, giáo viên ghi 1 dòng lý do (vd "hình vẽ tay
//     không cần đúng tỉ lệ", "thiếu ĐK x ≠ 0 trừ 0,25đ"). Áp dụng cho riêng bài tập đó hoặc cho MỌI bài.
//     AI phải tuân theo ở các lần chấm sau (chỉ đứng sau ghi chú chấm của chính bài tập).
//  2) Lỗi hay gặp của đề: tự thống kê từ các bài ĐÃ chấm của cùng bài tập (ý nào nhiều em sai, sai thế nào)
//     → nhắc AI SOI KỸ đúng chỗ đó ở các bài sau, KHÔNG được mặc định trừ điểm.

const MAX_LESSONS = 30;
const MAX_LESSON_LEN = 300;

function addLesson(db, { homeworkId = null, text, createdBy = null, context = null }) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LESSON_LEN);
  if (t.length < 4) return null;
  const r = db.prepare('INSERT INTO grading_lessons (homework_id, lesson, context, created_by) VALUES (?, ?, ?, ?)')
    .run(homeworkId || null, t, context ? String(context).slice(0, 200) : null, createdBy);
  return r.lastInsertRowid;
}

// Kinh nghiệm áp dụng khi chấm 1 bài tập: của riêng bài tập đó + của mọi bài (mới nhất trước)
function lessonsFor(db, homeworkId) {
  try {
    return db.prepare(`SELECT lesson, homework_id FROM grading_lessons
      WHERE active=1 AND (homework_id IS NULL OR homework_id=?) ORDER BY (homework_id IS NULL), id DESC LIMIT ?`)
      .all(homeworkId || -1, MAX_LESSONS)
      .map((r) => `${r.homework_id ? '[bài này] ' : ''}${r.lesson}`);
  } catch { return []; }
}

// Danh sách để hiển thị (giáo viên / admin)
function listLessons(db, { homeworkId } = {}) {
  const where = homeworkId ? 'WHERE (l.homework_id IS NULL OR l.homework_id=?)' : '';
  return db.prepare(`SELECT l.id, l.homework_id, l.lesson, l.context, l.active, l.created_at, l.created_by,
      u.full_name created_by_name, h.title homework_title
    FROM grading_lessons l LEFT JOIN users u ON u.id=l.created_by LEFT JOIN homework h ON h.id=l.homework_id
    ${where} ORDER BY l.id DESC LIMIT 200`).all(...(homeworkId ? [homeworkId] : []));
}

// Lỗi nhiều học sinh mắc ở cùng bài tập: từ kết quả AI đã lưu (graded_pages.items — nhãn ý, trạng thái,
// ghi chú lỗi). Chỉ nêu ý có ≥ 2 em sai, kèm vài ghi chú lỗi hay gặp nhất.
// TẮT mặc định (GRADING_HINTS=1 để bật): thống kê lấy từ chính kết quả AI chấm, CHƯA được giáo viên kiểm tra —
// AI chấm sai vài bài đầu thì gợi ý sai lan sang các bài sau. Ưu tiên độ chính xác → chỉ dùng sổ kinh nghiệm
// do giáo viên ghi (lessonsFor). Trang "Kinh nghiệm AI" vẫn hiện thống kê này cho giáo viên tham khảo.
function commonErrorHints(db, homeworkId, opts = {}) {
  if (process.env.GRADING_HINTS !== '1' && !opts.forDisplay) return [];
  return computeHints(db, homeworkId, opts);
}
function computeHints(db, homeworkId, { minStudents = 2, max = 8 } = {}) {
  if (!homeworkId) return [];
  let rows = [];
  try {
    rows = db.prepare("SELECT graded_pages FROM submissions WHERE homework_id=? AND grading_status='done' AND graded_pages IS NOT NULL ORDER BY graded_at DESC LIMIT 60").all(homeworkId);
  } catch { return []; }
  const byItem = new Map(); // nhãn ý → { wrong: số em sai, notes: Map(ghi chú → số lần) }
  rows.forEach((r) => {
    let g = null;
    try { g = JSON.parse(r.graded_pages); } catch { g = null; }
    const items = g && Array.isArray(g.items) ? g.items : [];
    const seen = new Set();
    items.forEach((it) => {
      if (!it || it.status === 'correct' || !it.short) return;
      const key = String(it.short).trim();
      if (seen.has(key)) return;
      seen.add(key);
      if (!byItem.has(key)) byItem.set(key, { wrong: 0, notes: new Map() });
      const e = byItem.get(key);
      e.wrong += 1;
      (it.errors || []).forEach((er) => {
        const n = String((er && er.note) || '').trim().toLowerCase();
        if (n) e.notes.set(n, (e.notes.get(n) || 0) + 1);
      });
    });
  });
  return [...byItem.entries()]
    .filter(([, e]) => e.wrong >= minStudents)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .slice(0, max)
    .map(([key, e]) => {
      const notes = [...e.notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
      return `Ý ${key}: ${e.wrong}/${rows.length} bài đã chấm làm chưa đúng${notes.length ? ` — hay gặp: ${notes.join('; ')}` : ''}`;
    });
}

module.exports = { addLesson, lessonsFor, listLessons, commonErrorHints };
