// Tổng kết tháng của lớp + điểm trung bình + xếp hạng (rank) theo tháng.
//
// Mỗi BÀI TẬP (BTVN) là 1 buổi học, thuộc tháng theo NGÀY TẠO bài. Điểm TB tháng của 1 học sinh (thang 10):
//   - Điểm BTVN mỗi buổi (quy về thang 10): quá hạn mà chưa có điểm → 0; chưa tới hạn & chưa có điểm → bỏ qua.
//   - Điểm 10 phút mỗi buổi (giáo viên nhập ở mục Nhận xét): không có → BỎ QUA (không tính 0).
//   - Điểm kiểm tra cuối tháng: HỆ SỐ 2; thiếu điểm → 0 — chỉ áp dụng khi tháng đã kết thúc hoặc lớp đã có
//     ít nhất 1 điểm kiểm tra của tháng đó (giữa tháng chưa kiểm tra thì chưa kéo điểm cả lớp xuống).
//   TB = (tổng BTVN + tổng 10p + 2 × KT) / (số điểm BTVN + số điểm 10p + 2)
// Bảng xếp hạng tháng (giáo viên, học sinh, Bảng vàng trang chủ) đều dùng điểm TB này.

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Một bài đã quá hạn nộp chưa? (due_date lưu dạng ISO; chưa đặt hạn → không bao giờ "quá hạn")
function isOverdue(dueDate, nowIso) {
  return dueDate ? nowIso > dueDate : false;
}

// Mốc thời gian "thuộc tháng nào" của một bài tập: NGÀY TẠO bài (không có thì hạn nộp).
function monthAnchor(hw) {
  return hw.created_at || hw.due_date || null;
}

// Tháng 'YYYY-MM' theo GIỜ VIỆT NAM (UTC+7) của một mốc thời gian; null nếu không hợp lệ.
// Nhận cả ISO lẫn dạng SQLite "YYYY-MM-DD HH:MM:SS" (CURRENT_TIMESTAMP, giờ UTC).
const VN_OFFSET_MS = 7 * 3600e3;
function ymOf(v) {
  if (!v) return null;
  let str = String(v);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)) str = str.replace(' ', 'T') + 'Z';
  const t = new Date(str).getTime();
  if (isNaN(t)) return null;
  const d = new Date(t + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const isYm = (v) => /^\d{4}-\d{2}$/.test(String(v || ''));

// Danh sách các tháng ('YYYY-MM', mới nhất trước) có bài tập trong lớp — để giáo viên xem lại lịch sử xếp hạng.
function classMonths(db, classId) {
  const homeworks = db.prepare('SELECT due_date,created_at FROM homework WHERE class_id=?').all(classId);
  const set = new Set();
  homeworks.forEach((hw) => { const ym = ymOf(monthAnchor(hw)); if (ym) set.add(ym); });
  return [...set].sort().reverse();
}

// Tổng kết tháng của 1 lớp: các buổi (BTVN tạo trong tháng) + điểm BTVN / 10 phút từng buổi + điểm kiểm tra
// cuối tháng + điểm TB + hạng. month 'YYYY-MM' (bỏ trống/không hợp lệ → tháng hiện tại).
function classMonthlySummary(db, classId, month, nowIso) {
  const now = nowIso || new Date().toISOString();
  const currentYm = ymOf(now);
  const ym = isYm(month) ? String(month) : currentYm;

  const students = db.prepare(`
    SELECT u.id, u.username, u.full_name, cs.sort_order FROM class_students cs
    JOIN users u ON cs.student_id=u.id WHERE cs.class_id=? AND u.active=1
  `).all(classId);
  const sessions = db.prepare('SELECT id,title,due_date,created_at,max_score FROM homework WHERE class_id=? ORDER BY created_at, id')
    .all(classId).filter((hw) => ymOf(monthAnchor(hw)) === ym);

  const hwIds = sessions.map((h) => h.id);
  const ph = hwIds.map(() => '?').join(',');
  const scoreOf = new Map();
  const quizOf = new Map();
  if (hwIds.length) {
    db.prepare(`SELECT homework_id,student_id,COALESCE(score,best_score) score FROM submissions WHERE homework_id IN (${ph})`).all(...hwIds)
      .forEach((r) => scoreOf.set(`${r.homework_id}-${r.student_id}`, r.score));
    db.prepare(`SELECT homework_id,student_id,quiz_score FROM homework_marks WHERE homework_id IN (${ph}) AND quiz_score IS NOT NULL`).all(...hwIds)
      .forEach((r) => quizOf.set(`${r.homework_id}-${r.student_id}`, r.quiz_score));
  }
  const testOf = new Map();
  db.prepare('SELECT student_id,score FROM class_month_tests WHERE class_id=? AND ym=? AND score IS NOT NULL').all(classId, ym)
    .forEach((r) => testOf.set(r.student_id, r.score));
  // Điểm kiểm tra thiếu → 0 khi tháng đã qua, hoặc lớp đã có điểm kiểm tra tháng này
  const testCounted = ym < currentYm || testOf.size > 0;

  const rows = students.map((st) => {
    let sum = 0, n = 0, graded = 0;
    const cells = sessions.map((hw) => {
      const key = `${hw.id}-${st.id}`;
      const max = hw.max_score > 0 ? hw.max_score : 10;
      const raw = scoreOf.get(key);
      let btvn = null, missing = false;
      if (raw !== null && raw !== undefined) { btvn = round2(Math.max(0, Math.min(1, raw / max)) * 10); graded++; }
      else if (isOverdue(hw.due_date, now)) { btvn = 0; missing = true; }
      if (btvn !== null) { sum += btvn; n++; }
      const quiz = quizOf.has(key) ? Number(quizOf.get(key)) : null;
      if (quiz !== null) { sum += quiz; n++; }
      return { btvn, missing, quiz };
    });
    const test = testOf.has(st.id) ? Number(testOf.get(st.id)) : null;
    if (testCounted) { sum += 2 * (test ?? 0); n += 2; }
    return {
      id: st.id, username: st.username, full_name: st.full_name, sort_order: st.sort_order,
      cells, test, avg: n > 0 ? round1(sum / n) : null, counted: n, graded,
    };
  });

  // Hạng theo điểm TB giảm dần, đồng điểm → đồng hạng (1, 2, 2, 4); chưa có điểm TB → không xếp hạng
  const ranked = rows.filter((r) => r.avg !== null).sort((x, y) => y.avg - x.avg);
  let lastAvg = null, lastRank = 0;
  ranked.forEach((r, i) => { if (lastAvg === null || r.avg < lastAvg) { lastRank = i + 1; lastAvg = r.avg; } r.rank = lastRank; });
  rows.forEach((r) => { if (r.rank === undefined) r.rank = null; });

  return {
    month: ym, current_month: currentYm, test_counted: testCounted, ranked_total: ranked.length,
    sessions: sessions.map((h) => ({ id: h.id, title: h.title, created_at: h.created_at, due_date: h.due_date, max_score: h.max_score })),
    students: rows,
  };
}

// Điểm TB (thang 10) + số điểm đã tính của TỪNG học sinh trong lớp (theo tổng kết tháng ở trên).
// month ('YYYY-MM', tùy chọn): tính cho tháng đó; bỏ trống → tháng hiện tại.
// Trả về Map: studentId -> { avg: number|null, counted, graded }
function classAverages(db, classId, nowIso, month) {
  const sum = classMonthlySummary(db, classId, month, nowIso);
  return new Map(sum.students.map((r) => [r.id, { avg: r.avg, counted: r.counted, graded: r.graded }]));
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

// Điểm TB tháng hiện tại (thang 10) của 1 học sinh: trung bình điểm TB tháng ở các lớp đang học.
function studentOverallAverage(db, studentId, nowIso) {
  const classes = db.prepare('SELECT cs.class_id FROM class_students cs JOIN classes cl ON cs.class_id=cl.id WHERE cs.student_id=? AND cl.active=1').all(studentId);
  const avgs = classes.map((c) => classAverages(db, c.class_id, nowIso).get(studentId)?.avg).filter((v) => v !== null && v !== undefined);
  return avgs.length ? round1(avgs.reduce((x, y) => x + y, 0) / avgs.length) : null;
}

// Bảng xếp hạng lớp theo THÁNG (dùng chung cho giáo viên & học sinh).
// month: 'YYYY-MM' (không hợp lệ/bỏ trống → tháng hiện tại). Trả về { month, months, current_month, students }
// — students: có hạng đứng trước (hạng tăng dần), chưa có hạng xếp sau.
function classRankingReport(db, classId, month) {
  const currentYm = ymOf(new Date().toISOString());
  const ym = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : currentYm;

  const students = db.prepare(`
    SELECT u.id, u.username, u.full_name FROM class_students cs
    JOIN users u ON cs.student_id=u.id WHERE cs.class_id=? AND u.active=1
  `).all(classId);

  const rankMap = classRanking(db, classId, null, ym);
  const rows = students.map((s) => {
    const r = rankMap.get(s.id) || {};
    return { ...s, avg: r.avg ?? null, counted: r.counted ?? 0, graded: r.graded ?? 0, rank: r.rank ?? null };
  });
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.avg ?? -1) - (a.avg ?? -1));

  // Các tháng có bài tập để chọn xem lại; luôn kèm tháng hiện tại
  const months = classMonths(db, classId);
  if (!months.includes(currentYm)) { months.push(currentYm); months.sort(); months.reverse(); }

  return { month: ym, months, current_month: currentYm, students: rows };
}

// Tháng liền trước của 'YYYY-MM'
function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// "Bảng vàng" toàn trung tâm theo tháng (trang chủ): điểm TB tháng (theo tổng kết tháng của lớp) của mỗi học
// sinh — học nhiều lớp thì lấy trung bình các lớp. Lấy `months` tháng gần nhất có bài tập, KHÔNG tính tháng sau
// tháng hiện tại; mỗi tháng `limit` bạn cao nhất (đồng điểm → ai có nhiều điểm hơn đứng trước).
// Trả về [{ month, students: [{ id, full_name, classes, avg, counted, rank }] }] — tháng mới nhất trước.
function monthlyTopStudents(db, { months = 6, limit = 5, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  const nowYm = ymOf(now);
  const classes = db.prepare('SELECT id,title FROM classes WHERE active=1').all();
  const hwMonths = new Set();
  db.prepare('SELECT h.created_at,h.due_date FROM homework h JOIN classes cl ON h.class_id=cl.id WHERE cl.active=1').all()
    .forEach((hw) => { const ym = ymOf(monthAnchor(hw)); if (ym && ym <= nowYm) hwMonths.add(ym); });
  const ymList = [...hwMonths].sort().reverse().slice(0, months);
  if (ymList.length === 0) return [];

  const studentOk = new Set(db.prepare("SELECT id FROM users WHERE active=1 AND role='student'").all().map((u) => u.id));
  return ymList.map((ym) => {
    // studentId -> { full_name, classes:Set, avgs:[], counted }
    const acc = new Map();
    for (const c of classes) {
      for (const r of classMonthlySummary(db, c.id, ym, now).students) {
        if (r.avg === null || !studentOk.has(r.id)) continue;
        if (!acc.has(r.id)) acc.set(r.id, { full_name: r.full_name, classes: new Set(), avgs: [], counted: 0 });
        const a = acc.get(r.id);
        a.classes.add(c.title); a.avgs.push(r.avg); a.counted += r.counted;
      }
    }
    const list = [...acc.entries()].map(([id, a]) => ({
      id, full_name: a.full_name, classes: [...a.classes].join(', '), counted: a.counted,
      avg: round1(a.avgs.reduce((x, y) => x + y, 0) / a.avgs.length),
    }));
    list.sort((x, y) => y.avg - x.avg || y.counted - x.counted || x.full_name.localeCompare(y.full_name, 'vi'));
    let lastAvg = null, lastRank = 0;
    list.forEach((st, i) => { if (st.avg !== lastAvg) { lastRank = i + 1; lastAvg = st.avg; } st.rank = lastRank; });
    return { month: ym, students: list.slice(0, limit) };
  }).filter((m) => m.students.length > 0);
}

module.exports = { classAverages, classMonthlySummary, classRanking, classRankingReport, classMonths, studentOverallAverage, monthlyTopStudents, prevYm, isOverdue, ymOf };
