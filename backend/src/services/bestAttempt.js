// Nộp bài nhiều lần → LẤY ĐIỂM CỦA LẦN NỘP CAO NHẤT (không phải lần cuối).
//
// Mỗi học sinh chỉ có 1 dòng submissions / bài tập, luôn chứa lần nộp MỚI NHẤT để hàng đợi chấm xử lý.
// Khi nộp lại, lần nộp tốt nhất trước đó (đã có điểm) được cất vào best_attempt (JSON) + best_score.
// Khi lần nộp mới có điểm (chấm tự động / AI / giáo viên chấm tay) → settleBest() so sánh:
//   - lần cũ cao hơn → khôi phục lần cũ vào dòng chính (điểm, nhận xét, chi tiết, bài làm, file)
//   - lần mới cao hơn hoặc bằng → giữ lần mới
// rồi xóa phần dư (file của lần thua) và dọn best_attempt. Trong lúc lần mới đang chờ chấm, điểm hiệu
// lực = COALESCE(score, best_score) để điểm TB/xếp hạng không bị tụt tạm thời.
const path = require('path');
const fs = require('fs');

const SUB_DIR = path.join(__dirname, '../../uploads/submissions');

// Các cột thuộc về "kết quả 1 lần nộp" (submitted_at không nằm trong đây: luôn giữ thời điểm nộp mới
// nhất, vì luồng HSA dùng nó để biết lượt làm hiện tại đã nộp hay chưa).
const ATTEMPT_COLS = ['score', 'feedback', 'grading_details', 'structured_answers', 'files', 'file_path', 'graded_at', 'graded_by_ai'];

function filenamesOf(obj) {
  if (obj && obj.files) {
    try { const a = JSON.parse(obj.files); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ }
  }
  return obj && obj.file_path ? [obj.file_path] : [];
}

function rmFiles(names) {
  names.forEach((n) => {
    const f = path.join(SUB_DIR, n);
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  });
}

function parseBest(raw) {
  if (!raw) return null;
  try { const o = JSON.parse(raw); return o && typeof o === 'object' && o.score != null ? o : null; } catch { return null; }
}

function snapshot(sub) {
  const o = {};
  ATTEMPT_COLS.forEach((c) => { o[c] = sub[c] ?? null; });
  o.submitted_at = sub.submitted_at || null; // chỉ để tham khảo, không khôi phục
  return o;
}

// Gọi TRƯỚC khi ghi đè dòng submissions bằng lần nộp mới. Trả về { bestJson, bestScore } để lưu,
// đồng thời xóa file của lần nộp không còn cần giữ (lần thua / lần chưa có điểm).
function archiveBeforeResubmit(existing) {
  const best = parseBest(existing.best_attempt);
  const currentGraded = existing.score !== null && existing.score !== undefined;
  if (currentGraded && (!best || existing.score >= best.score)) {
    if (best) rmFiles(filenamesOf(best));
    const snap = snapshot(existing);
    return { bestJson: JSON.stringify(snap), bestScore: snap.score };
  }
  rmFiles(filenamesOf(existing));
  return best ? { bestJson: JSON.stringify(best), bestScore: best.score } : { bestJson: null, bestScore: null };
}

// Gọi SAU khi lần nộp hiện tại vừa có điểm. Trả về 'best' nếu đã khôi phục lần cũ (điểm cao hơn),
// 'current' nếu giữ lần mới, null nếu không có gì để so.
function settleBest(db, submissionId) {
  const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(submissionId);
  if (!sub) return null;
  const best = parseBest(sub.best_attempt);
  if (!best || sub.score === null || sub.score === undefined) return null;

  if (best.score > sub.score) {
    rmFiles(filenamesOf(sub).filter((n) => !filenamesOf(best).includes(n)));
    db.prepare(`UPDATE submissions SET ${ATTEMPT_COLS.map((c) => `${c}=?`).join(',')},grading_status='done',best_attempt=NULL,best_score=NULL WHERE id=?`)
      .run(...ATTEMPT_COLS.map((c) => best[c] ?? null), submissionId);
    return 'best';
  }
  rmFiles(filenamesOf(best).filter((n) => !filenamesOf(sub).includes(n)));
  db.prepare('UPDATE submissions SET best_attempt=NULL,best_score=NULL WHERE id=?').run(submissionId);
  return 'current';
}

// Tên file của lần nộp tốt nhất đang cất (để xóa kèm khi xóa bài nộp).
function bestFilenames(sub) {
  return filenamesOf(parseBest(sub && sub.best_attempt));
}

module.exports = { archiveBeforeResubmit, settleBest, parseBest, bestFilenames };
