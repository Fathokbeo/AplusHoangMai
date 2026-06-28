// Tính điểm trung bình + xếp hạng (rank) của học sinh trong một lớp.
// Quy tắc: bài tập đã QUÁ HẠN mà học sinh chưa nộp (hoặc nộp nhưng chưa có điểm) → tính 0 điểm.
// Điểm mỗi bài quy về tỉ lệ 0..1 (score/max_score) rồi lấy trung bình, hiển thị trên thang 10 cho dễ so sánh.

const round1 = (n) => Math.round(n * 10) / 10;

// Một bài đã quá hạn nộp chưa? (due_date lưu dạng ISO; chưa đặt hạn → không bao giờ "quá hạn")
function isOverdue(dueDate, nowIso) {
  return dueDate ? nowIso > dueDate : false;
}

// Điểm TB (thang 10) + số bài đã tính của TỪNG học sinh trong lớp.
// Trả về Map: studentId -> { avg: number|null, counted, graded }
function classAverages(db, classId, nowIso) {
  const now = nowIso || new Date().toISOString();
  const students = db.prepare('SELECT student_id FROM class_students WHERE class_id=?').all(classId);
  const homeworks = db.prepare('SELECT id,due_date,max_score FROM homework WHERE class_id=?').all(classId);
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
function classRanking(db, classId, nowIso) {
  const averages = classAverages(db, classId, nowIso);
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
  const rows = db.prepare(`
    SELECT h.due_date,h.max_score,
      (SELECT s.score FROM submissions s WHERE s.homework_id=h.id AND s.student_id=?) AS score
    FROM homework h
    JOIN class_students cs ON cs.class_id=h.class_id AND cs.student_id=?
  `).all(studentId, studentId);
  let sum = 0, counted = 0;
  for (const hw of rows) {
    const max = hw.max_score > 0 ? hw.max_score : 10;
    if (hw.score !== null && hw.score !== undefined) { sum += Math.max(0, Math.min(1, hw.score / max)); counted++; }
    else if (isOverdue(hw.due_date, now)) { counted++; } // +0
  }
  return counted > 0 ? round1((sum / counted) * 10) : null;
}

module.exports = { classAverages, classRanking, studentOverallAverage, isOverdue };
