// Tính điểm trung bình + xếp hạng (rank) của học sinh trong một lớp.
// Quy tắc: bài tập đã QUÁ HẠN mà học sinh chưa nộp (hoặc nộp nhưng chưa có điểm) → tính 0 điểm.
// Điểm mỗi bài quy về tỉ lệ 0..1 (score/max_score) rồi lấy trung bình, hiển thị trên thang 10 cho dễ so sánh.
//
// XẾP HẠNG RESET THEO THÁNG: chỉ tính các bài thuộc THÁNG HIỆN TẠI (theo HẠN NỘP của bài;
// bài không đặt hạn thì xét theo ngày tạo). Sang tháng mới, điểm TB & thứ hạng tự reset.

const round1 = (n) => Math.round(n * 10) / 10;

// Một bài đã quá hạn nộp chưa? (due_date lưu dạng ISO; chưa đặt hạn → không bao giờ "quá hạn")
function isOverdue(dueDate, nowIso) {
  return dueDate ? nowIso > dueDate : false;
}

// Mốc thời gian "thuộc tháng nào" của một bài tập: ưu tiên hạn nộp, không có thì ngày tạo.
function monthAnchor(hw) {
  return hw.due_date || hw.created_at || null;
}

// Tháng 'YYYY-MM' (theo lịch địa phương) của một mốc thời gian ISO; null nếu không hợp lệ.
function ymOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Bài có thuộc cùng tháng (theo lịch địa phương) với mốc tham chiếu không?
function inSameMonth(anchorIso, ref) {
  if (!anchorIso) return false;
  const d = new Date(anchorIso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// Danh sách các tháng ('YYYY-MM', mới nhất trước) có bài tập trong lớp — để giáo viên xem lại lịch sử xếp hạng.
function classMonths(db, classId) {
  const homeworks = db.prepare('SELECT due_date,created_at FROM homework WHERE class_id=?').all(classId);
  const set = new Set();
  homeworks.forEach((hw) => { const ym = ymOf(monthAnchor(hw)); if (ym) set.add(ym); });
  return [...set].sort().reverse();
}

// Điểm TB (thang 10) + số bài đã tính của TỪNG học sinh trong lớp.
// month ('YYYY-MM', tùy chọn): tính cho tháng đó; bỏ trống → tháng hiện tại.
// Trả về Map: studentId -> { avg: number|null, counted, graded }
function classAverages(db, classId, nowIso, month) {
  const now = nowIso || new Date().toISOString();
  const targetYm = month || ymOf(now);
  const students = db.prepare('SELECT student_id FROM class_students WHERE class_id=?').all(classId);
  // Chỉ lấy bài tập thuộc THÁNG ĐANG XÉT (theo hạn nộp / ngày tạo) → xếp hạng reset theo tháng.
  const homeworks = db.prepare('SELECT id,due_date,max_score,created_at FROM homework WHERE class_id=?')
    .all(classId)
    .filter((hw) => ymOf(monthAnchor(hw)) === targetYm);
  const subs = db.prepare(`
    SELECT s.homework_id,s.student_id,s.score
    FROM submissions s JOIN homework h ON s.homework_id=h.id
    WHERE h.class_id=?
  `).all(classId);
  const scoreOf = new Map(); // `${hwId}-${studentId}` -> score (có thể null nếu chưa chấm)
  subs.forEach((r) => scoreOf.set(`${r.homework_id}-${r.student_id}`, r.score));

  const out = new Map();
  for (const { student_id } of students) {
    let sum = 0, counted = 0, graded = 0;
    for (const hw of homeworks) {
      const max = hw.max_score > 0 ? hw.max_score : 10;
      const key = `${hw.id}-${student_id}`;
      const score = scoreOf.has(key) ? scoreOf.get(key) : undefined;
      if (score !== null && score !== undefined) {
        sum += Math.max(0, Math.min(1, score / max)); // đã có điểm
        counted++; graded++;
      } else if (isOverdue(hw.due_date, now)) {
        counted++; // quá hạn mà chưa có điểm → +0
      }
      // chưa tới hạn & chưa có điểm → bỏ qua, không tính vào TB
    }
    out.set(student_id, { avg: counted > 0 ? round1((sum / counted) * 10) : null, counted, graded });
  }
  return out;
}

// Gắn thứ hạng (rank) theo điểm TB giảm dần. Đồng điểm → đồng hạng (kiểu thi đấu: 1,2,2,4).
// Học sinh chưa có điểm TB (avg=null) → rank=null. total = số học sinh đã được xếp hạng.
// month ('YYYY-MM', tùy chọn): xếp hạng của tháng đó; bỏ trống → tháng hiện tại.
function classRanking(db, classId, nowIso, month) {
  const averages = classAverages(db, classId, nowIso, month);
  const ranked = [...averages.entries()]
    .map(([student_id, v]) => ({ student_id, ...v }))
    .filter((e) => e.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  let lastAvg = null, lastRank = 0;
  ranked.forEach((e, i) => {
    if (lastAvg === null || e.avg < lastAvg) { lastRank = i + 1; lastAvg = e.avg; }
    e.rank = lastRank;
  });
  const total = ranked.length;

  const map = new Map();
  for (const [student_id, v] of averages.entries()) {
    const hit = ranked.find((e) => e.student_id === student_id);
    map.set(student_id, { avg: v.avg, counted: v.counted, graded: v.graded, rank: hit ? hit.rank : null, total });
  }
  return map;
}

// Điểm TB tổng (thang 10) của 1 học sinh trên TẤT CẢ các lớp đang học (cùng quy tắc quá hạn = 0).
function studentOverallAverage(db, studentId, nowIso) {
  const now = nowIso || new Date().toISOString();
  const ref = new Date(now);
  const rows = db.prepare(`
    SELECT h.due_date,h.max_score,h.created_at,
      (SELECT s.score FROM submissions s WHERE s.homework_id=h.id AND s.student_id=?) AS score
    FROM homework h
    JOIN class_students cs ON cs.class_id=h.class_id AND cs.student_id=?
  `).all(studentId, studentId)
    .filter((hw) => inSameMonth(monthAnchor(hw), ref)); // chỉ tính bài của tháng hiện tại
  let sum = 0, counted = 0;
  for (const hw of rows) {
    const max = hw.max_score > 0 ? hw.max_score : 10;
    if (hw.score !== null && hw.score !== undefined) { sum += Math.max(0, Math.min(1, hw.score / max)); counted++; }
    else if (isOverdue(hw.due_date, now)) { counted++; } // +0
  }
  return counted > 0 ? round1((sum / counted) * 10) : null;
}

module.exports = { classAverages, classRanking, classMonths, studentOverallAverage, isOverdue, ymOf };
