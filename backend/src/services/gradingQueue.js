// Hàng đợi chấm bài nền: học sinh nộp xong được nhận bài NGAY,
// việc chấm AI chạy nền tuần tự, có thử lại khi lỗi và tự phục hồi sau khi server khởi động lại.
const path = require('path');
const { getDb } = require('../db/database');
const { gradeSubmission, gradeGroup, extractAnswerKey } = require('./aiGrading');
const { needsAiGrading, hasAnswerKey, parsePartsConfig, partEnabled, missingKeyIndices, applyExtractedKeys, PART_LABELS, parseHsaConfig, hasHsaAnswerKey } = require('./homeworkParts');
const { settleBest } = require('./bestAttempt');
const { removeGradedFiles } = require('./gradingPages');
const { batchEnabled } = require('./geminiClient');
const aiKeys = require('./aiKeys');
const { lessonsFor, commonErrorHints } = require('./gradingLessons');
const { scoreStructured, scoreHsa, partMax, round2, rawMaxScore, scaleToTarget, composeAutoFeedback, composeEssayFeedback, essayDetailsOf } = require('./homeworkScoring');

const MAX_ATTEMPTS = 5;            // số lần thử chấm tối đa trước khi đánh dấu thất bại
const RETRY_DELAY_MS = 30_000;     // chờ trước khi thử lại một bài bị lỗi
const QUOTA_RETRY_MS = 15 * 60_000; // hết quota model mạnh → chờ lâu hơn, KHÔNG tính vào số lần thử
const SWEEP_INTERVAL_MS = 60_000;  // quét định kỳ để gom các bài còn "pending"

const queue = [];          // FIFO các mục chờ chấm, dạng "<loại>:<id>" (vd "hw:12", "mock:5")
const inQueue = new Set();

// Hai loại bài được chấm bằng cùng một logic:
//  - hw:   bài nộp của học sinh (submissions + homework)
//  - mock: bài làm thi thử của khách vãng lai (mock_attempts + mock_exams)
// Cả hai bảng bài làm có cùng tên cột kết quả (score, feedback, grading_details, graded_at, graded_by_ai,
// grading_status, grading_attempts, files, structured_answers) nên chỉ khác câu truy vấn + thư mục file.
const KINDS = {
  hw: {
    table: 'submissions',
    answerDir: 'homework',
    filesDir: 'submissions',
    settle: settleBest, // nộp nhiều lần → giữ lần có điểm cao nhất
    load: (db, id) => db.prepare(`
      SELECT s.*, h.id hw_id, h.answer_file, h.max_score, h.grading_note, h.parts_config, h.feedback_rubric, h.exam_type, h.hsa_config, h.due_date
      FROM submissions s JOIN homework h ON s.homework_id = h.id
      WHERE s.id = ?
    `).get(id),
    pending: (db) => db.prepare(`
      SELECT s.id, h.answer_file, h.parts_config, h.hsa_config FROM submissions s JOIN homework h ON s.homework_id = h.id
      WHERE s.grading_status='pending' AND COALESCE(s.grading_attempts,0) < ?
        AND (h.answer_file IS NOT NULL OR h.parts_config IS NOT NULL OR h.hsa_config IS NOT NULL)
    `).all(MAX_ATTEMPTS),
  },
  mock: {
    table: 'mock_attempts',
    answerDir: 'mock',
    filesDir: 'mock_submissions',
    settle: null,
    load: (db, id) => db.prepare(`
      SELECT a.*, e.id hw_id, e.answer_file, e.max_score, e.grading_note, e.parts_config, e.feedback_rubric, e.exam_type, e.hsa_config
      FROM mock_attempts a JOIN mock_exams e ON a.exam_id = e.id
      WHERE a.id = ?
    `).get(id),
    pending: (db) => db.prepare(`
      SELECT a.id, e.answer_file, e.parts_config, e.hsa_config FROM mock_attempts a JOIN mock_exams e ON a.exam_id = e.id
      WHERE a.grading_status='pending' AND COALESCE(a.grading_attempts,0) < ?
        AND (e.answer_file IS NOT NULL OR e.parts_config IS NOT NULL OR e.hsa_config IS NOT NULL)
    `).all(MAX_ATTEMPTS),
  },
};
let running = 0; // số bài đang chấm cùng lúc
let quotaBlockedUntil = 0; // hết quota → tạm ngừng quét bài chờ cho tới thời điểm này

// Cache đáp án AI đọc được từ file đáp án, theo (loại : id đề : tên file đáp án).
// Nhờ đó nhiều học sinh cùng bài chỉ tốn 1 lần đọc file; file đổi (tên mới) → tự đọc lại.
const answerKeyCache = new Map();

// Lấy danh sách tên file của một bài nộp (hỗ trợ cũ: file_path đơn, mới: files JSON)
function submissionFilenames(sub) {
  if (sub && sub.files) {
    try { const a = JSON.parse(sub.files); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ }
  }
  return sub && sub.file_path ? [sub.file_path] : [];
}

// Phần khách quan do AI chấm hộ (học sinh không điền ở giao diện) không nằm trong partStats của máy chấm
// → gộp các câu AI chấm chưa đúng vào thống kê để câu nhận xét vẫn nhắc đúng phần còn sai.
function mergeAiObjectiveStats(partStats, aiDetails) {
  const out = {};
  Object.entries(partStats || {}).forEach(([k, st]) => { out[k] = { ...st, wrongIdx: [...(st.wrongIdx || [])] }; });
  const keyOf = (q) => (/^\s*(tn\b|trắc nghiệm)/i.test(q) ? 'multiple_choice'
    : /^\s*(đúng\s*[-/]\s*sai|đ\/s)/i.test(q) ? 'true_false'
    : /^\s*(tln\b|trả lời ngắn)/i.test(q) ? 'short_answer' : null);
  (aiDetails || []).forEach((d) => {
    const k = keyOf(String(d.question || ''));
    if (!k || d.status === 'correct') return;
    if (!out[k]) out[k] = { total: 0, correct: 0, wrongIdx: [], wrongSub: 0 };
    const n = (String(d.question || '').match(/(\d+)\s*$/) || [])[1]; // "TN câu 3" → câu 3
    out[k].wrongIdx.push(n ? Number(n) - 1 : -1);
    if (k === 'true_false') out[k].wrongSub = (out[k].wrongSub || 0) + (d.status === 'wrong' ? 2 : 1);
  });
  return out;
}

// kind: 'hw' (bài nộp học sinh, mặc định) | 'mock' (bài làm thi thử)
function enqueue(submissionId, kind = 'hw') {
  const id = Number(submissionId);
  if (!id || !KINDS[kind]) return;
  const key = `${kind}:${id}`;
  if (inQueue.has(key)) return;
  inQueue.add(key);
  queue.push(key);
  processQueue();
}

// Số bài chấm SONG SONG: chế độ Batch (rẻ 50%) mỗi lô có thể chờ vài phút → vài giờ nên chạy nhiều bài
// cùng lúc; gọi thường thì ít hơn để không chạm giới hạn/phút. Ghi đè bằng GRADING_CONCURRENCY.
function concurrency() {
  const env = Number(process.env.GRADING_CONCURRENCY);
  if (env > 0) return env;
  return batchEnabled() ? 8 : 2;
}

function processQueue() {
  while (queue.length && running < concurrency()) {
    const key = queue.shift();
    inQueue.delete(key);
    const [kind, id] = key.split(':');
    running += 1;
    gradeRecord(kind, Number(id))
      .catch((err) => console.error(`[grading-queue] Bài ${key} chấm lỗi: ${err.message}`))
      .finally(() => { running -= 1; processQueue(); });
  }
}

// Chấm 1 bài nộp kiểu HSA: hoàn toàn tự động theo đáp án giáo viên nhập, KHÔNG dùng AI,
// mỗi câu 1 điểm, điểm cuối = tổng điểm thô (không quy đổi thang 10).
function gradeHsaSubmission(db, K, sub, submissionId) {
  const cfg = parseHsaConfig(sub.hsa_config);
  if (!cfg) { db.prepare(`UPDATE ${K.table} SET grading_status=NULL WHERE id=?`).run(submissionId); return null; }
  const det = scoreHsa(cfg, sub.structured_answers);
  const total = Math.max(0, Math.min(cfg.questions.length, det.score));
  const correct = det.details.filter((d) => d.status === 'correct').length;
  const graded = det.details.filter((d) => d.status !== 'partial').length;
  const feedback = graded < cfg.questions.length
    ? `Đúng ${correct}/${graded} câu đã có đáp án — tổng điểm ${total}/${cfg.questions.length}. Còn ${cfg.questions.length - graded} câu chưa có đáp án, cần giáo viên kiểm tra.`
    : `Đúng ${correct}/${cfg.questions.length} câu — tổng điểm ${total}/${cfg.questions.length}.`;
  db.prepare(`UPDATE ${K.table} SET score=?,feedback=?,grading_details=?,graded_at=?,graded_by_ai=0,grading_status='done' WHERE id=?`)
    .run(total, feedback, JSON.stringify(det.details), new Date().toISOString(), submissionId);
  if (K.settle) K.settle(db, submissionId); // nộp nhiều lần → giữ lần có điểm cao nhất
  console.log(`[grading-queue] ✅ Đã chấm bài nộp #${submissionId} (HSA): ${total}/${cfg.questions.length}`);
  return { score: total, feedback, details: det.details };
}

// ── LỊCH CHẤM GOM (tiết kiệm lượt gọi/ngày) ────────────────────────────────────────────────
// GRADING_SCHEDULE=daily (mặc định): bài nộp cần AI KHÔNG chấm ngay mà chờ ('scheduled'), rồi được gom
// theo bài tập, mỗi lượt gọi chấm GRADING_GROUP_SIZE học sinh (mặc định 3), vào:
//   • mỗi tối GRADING_DAILY_TIME (mặc định 21:30, giờ Việt Nam) — chấm mọi bài đang chờ;
//   • GRADING_PREDUE_MINUTES (mặc định 60) phút trước hạn nộp của từng bài tập — để học sinh nộp sớm biết
//     điểm và còn kịp nộp lại.
// Server ngủ đúng giờ (Render gói free) → lúc thức dậy chấm bù ngay. GRADING_SCHEDULE=immediate: chấm ngay
// từng bài như trước. Ngoại lệ luôn chấm ngay: giáo viên bấm "chấm lại", bài thi thử của khách, bài chỉ có
// phần máy tự chấm (không cần AI).
const VN_TZ = 'Asia/Ho_Chi_Minh';
const scheduleMode = () => (String(process.env.GRADING_SCHEDULE || 'daily').toLowerCase() === 'immediate' ? 'immediate' : 'daily');
const groupSize = () => Math.max(1, Math.min(5, Number(process.env.GRADING_GROUP_SIZE) || 3));
// Đợt ƯU TIÊN (bài đến hạn hôm nay / trước hạn nộp / nộp hộ / bấm chấm lại): số bài mỗi lượt gọi tự chia theo số
// key đang có (xem runScheduledGrading) → có điểm nhanh nhất. Đợt thường (21:30) giữ GRADING_GROUP_SIZE, chạy theo lô.
let priorityActive = 0; // số đợt ưu tiên đang chạy — đợt thường tạm nhường khi > 0
const predueMinutes = () => (Number(process.env.GRADING_PREDUE_MINUTES) >= 0 ? Number(process.env.GRADING_PREDUE_MINUTES) : 60);
function dailyTime() {
  const m = String(process.env.GRADING_DAILY_TIME || '21:30').match(/^(\d{1,2}):(\d{2})$/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : { h: 21, m: 30 };
}
// Giờ Việt Nam hiện tại: { date: 'YYYY-MM-DD', minutes: phút trong ngày }
function vnNow(t = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday); // 0 = Chủ nhật
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

// ── GIỜ HOẠT ĐỘNG CỦA TRUNG TÂM: bài của bài tập ĐẾN HẠN HÔM NAY được chấm gom NGAY (gom các bài nộp sát nhau
//    ~1 phút), gọi thường cho nhanh — để có kết quả ngay sau buổi học. Mặc định:
//      • Thứ 2 – Thứ 7: 18:30–21:30   (GRADING_CENTER_DAYS="1-6", GRADING_CENTER_HOURS="18:30-21:30")
//      • Chủ nhật học cả ngày: 07:00–21:30   (GRADING_CENTER_SUNDAY_HOURS="07:00-21:30"; để trống = không ưu tiên)
//    Thứ: 1 = Thứ 2 … 6 = Thứ 7, 0 = Chủ nhật.
function parseRange(text) {
  const m = String(text || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  return m ? { start: Number(m[1]) * 60 + Number(m[2]), end: Number(m[3]) * 60 + Number(m[4]) } : null;
}
function parseDays(text) {
  const days = new Set();
  const dm = String(text || '').match(/^(\d)\s*-\s*(\d)$/);
  if (dm) { for (let d = Number(dm[1]); d <= Number(dm[2]); d++) days.add(d % 7); } else String(text || '').split(',').filter(Boolean).forEach((d) => days.add(Number(d) % 7));
  return days;
}
function centerWindows() {
  const list = [];
  const weekday = parseRange(process.env.GRADING_CENTER_HOURS || '18:30-21:30');
  if (weekday) list.push({ ...weekday, days: parseDays(process.env.GRADING_CENTER_DAYS || '1-6') });
  const sunEnv = process.env.GRADING_CENTER_SUNDAY_HOURS;
  const sunday = parseRange(sunEnv === undefined ? '07:00-21:30' : sunEnv);
  if (sunday) list.push({ ...sunday, days: new Set([0]) });
  return list;
}
function inCenterHours(t = Date.now()) {
  const v = vnNow(t);
  return centerWindows().some((w) => w.days.has(v.weekday) && v.minutes >= w.start && v.minutes < w.end);
}
// Hạn nộp rơi vào HÔM NAY (giờ Việt Nam)
function dueToday(dueDate, t = Date.now()) {
  const d = dueDate ? Date.parse(dueDate) : NaN;
  return Number.isFinite(d) && vnNow(d).date === vnNow(t).date;
}
// Thời điểm (ms) của lần chấm 21:30 sắp tới
function nextDailyRunAt(t = Date.now()) {
  const { h, m } = dailyTime();
  const now = vnNow(t);
  const offset = (h * 60 + m - now.minutes) * 60_000;
  const base = t - (new Date(t).getSeconds() * 1000 + new Date(t).getMilliseconds());
  return offset > 0 ? base + offset : base + offset + 24 * 3600_000;
}
// Lần chấm gom sắp tới của 1 bài tập (để hiện "Chờ chấm lúc ..."): đợt chấm sớm đã hẹn (nộp hộ / chấm lại /
// giờ trung tâm) → hoặc sớm hơn giữa 21:30 và (hạn nộp − 60 phút)
function nextGradingAt(dueDate, homeworkId = null) {
  const soon = homeworkId != null ? soonRuns.get(Number(homeworkId)) : null;
  if (soon) return soon.at;
  if (inCenterHours() && dueToday(dueDate)) return Date.now() + centerDelayMs();
  const daily = nextDailyRunAt();
  const due = dueDate ? Date.parse(dueDate) : NaN;
  const pre = Number.isFinite(due) ? due - predueMinutes() * 60_000 : NaN;
  return Number.isFinite(pre) && pre > Date.now() && pre < daily ? pre : daily;
}

// Giáo viên NỘP HỘ (thường cả lớp 1 lúc, cần điểm sớm để gửi nhận xét) → không chờ 21:30: đợi vài phút
// sau lần nộp hộ cuối của bài tập đó (gom đủ cả loạt) rồi chấm gom luôn.
const teacherDelayMs = () => (Number(process.env.GRADING_TEACHER_DELAY_MIN) >= 0 ? Number(process.env.GRADING_TEACHER_DELAY_MIN) : 2) * 60_000;
const soonRuns = new Map(); // id bài tập → { at, first, maxWait, realtime, reason }
// Giờ trung tâm: đợi 10 phút sau bài nộp gần nhất (gom nhiều bài, phòng lệch giờ nộp), tối đa 15 phút kể từ bài đầu
const centerDelayMs = () => (Number(process.env.GRADING_CENTER_DELAY_MIN) > 0 ? Number(process.env.GRADING_CENTER_DELAY_MIN) : 10) * 60_000;
const centerMaxWaitMs = () => Math.max(centerDelayMs(), (Number(process.env.GRADING_CENTER_MAX_WAIT_MIN) > 0 ? Number(process.env.GRADING_CENTER_MAX_WAIT_MIN) : 15) * 60_000);
// Hẹn chấm gom SỚM 1 bài tập: gọi nhiều lần liên tiếp (nhiều bài nộp / nhiều lần bấm "chấm lại") thì lùi mốc
// để gom chung 1 đợt, nhưng không chờ quá 3 phút kể từ lần đầu.
// maxWaitMs: chờ lâu nhất bao lâu kể từ lần hẹn đầu tiên (mặc định 3 phút).
function queueSoon(hwId, delayMs, { realtime = false, reason = '', maxWaitMs = 3 * 60_000 } = {}) {
  const id = Number(hwId);
  const now = Date.now();
  const cur = soonRuns.get(id);
  const first = cur ? cur.first : now;
  const maxWait = Math.max(maxWaitMs, cur ? cur.maxWait || 0 : 0);
  soonRuns.set(id, {
    at: Math.min(now + delayMs, first + maxWait),
    maxWait,
    first,
    realtime: !!(realtime || (cur && cur.realtime)),
    reason: reason || (cur && cur.reason) || '',
  });
  return soonRuns.get(id).at;
}

function ranBefore(db, key) {
  return !!db.prepare('SELECT 1 FROM grading_runs WHERE run_key=?').get(key);
}
function markRan(db, key) {
  db.prepare('INSERT OR IGNORE INTO grading_runs (run_key, ran_at) VALUES (?, ?)').run(key, new Date().toISOString());
}

// ── Phân tích 1 bài nộp: phần nào máy tự chấm, phần nào cần AI ───────────────────────────────
async function analyze(kind, K, sub, submissionId) {
  const subFiles = submissionFilenames(sub);
  const answerPath = sub.answer_file ? path.join(__dirname, '../../uploads', K.answerDir, sub.answer_file) : null;
  const subPaths = subFiles.map((name) => path.join(__dirname, '../../uploads', K.filesDir, name));
  const hasImages = subPaths.length > 0;
  let cfg = parsePartsConfig(sub.parts_config);

  // 0) Câu objective giáo viên ĐỂ TRỐNG đáp án → nhờ AI đọc từ FILE ĐÁP ÁN rồi ghép vào cfg.
  //    (đáp án giáo viên nhập tay luôn được ưu tiên; chỉ điền vào câu còn trống; đọc 1 lần cho cả bài tập)
  if (cfg && answerPath) {
    const missing = {
      multiple_choice: missingKeyIndices(cfg, 'multiple_choice'),
      true_false: missingKeyIndices(cfg, 'true_false'),
      short_answer: missingKeyIndices(cfg, 'short_answer'),
    };
    if (missing.multiple_choice.length || missing.true_false.length || missing.short_answer.length) {
      const cacheKey = `${kind}:${sub.hw_id}:${sub.answer_file}`;
      let extracted = answerKeyCache.get(cacheKey);
      if (extracted === undefined) {
        try {
          extracted = await extractAnswerKey(answerPath, cfg, missing);
          answerKeyCache.set(cacheKey, extracted);
          console.log(`[grading-queue] 📖 Đã đọc đáp án từ file cho bài #${sub.hw_id}`);
        } catch (e) {
          console.error(`[grading-queue] đọc đáp án từ file lỗi (#${submissionId}): ${e.message}`);
          extracted = null; // không cache lỗi để lần sau thử lại
        }
      }
      if (extracted) cfg = applyExtractedKeys(cfg, extracted);
    }
  }

  // 1) Chấm tự động (deterministic) các phần khách quan học sinh đã điền (cfg đã ghép đáp án)
  const det = scoreStructured(cfg || sub.parts_config, sub.structured_answers);

  // 2) Phần cần AI: pendingAi (HS không điền giao diện → AI dò trong ẢNH), aiKeyless (HS có điền nhưng cả
  //    phần chưa có đáp án → AI đọc FILE ĐÁP ÁN), tự luận (có ảnh); bài cũ (không cfg) → AI chấm toàn bộ.
  const aiFromImages = hasImages ? (det.pendingAi || []) : [];
  const aiFromAnswers = answerPath ? (det.aiKeyless || []) : [];
  const aiObjective = [...new Set([...aiFromImages, ...aiFromAnswers])];
  const essayEnabled = cfg ? partEnabled(cfg, 'essay') : !!sub.answer_file;
  const aiEssay = hasImages && essayEnabled;
  const needAi = aiObjective.length > 0 || aiEssay;
  // Phần chưa có đáp án mà KHÔNG có file đáp án (và không có ảnh) → không thể chấm tự động/AI
  const cannotGrade = (cfg ? (det.aiKeyless || []) : []).filter((k) => !aiObjective.includes(k));

  // Thang điểm THÔ phần AI phụ trách + phạm vi chấm
  let aiMax = sub.max_score;
  if (cfg) {
    aiMax = 0;
    aiObjective.forEach((k) => { aiMax += partMax(cfg, k); });
    if (aiEssay) aiMax += partMax(cfg, 'essay');
    aiMax = round2(aiMax);
  }
  const scope = cfg ? {
    multiple_choice: aiObjective.includes('multiple_choice'),
    true_false: aiObjective.includes('true_false'),
    short_answer: aiObjective.includes('short_answer'),
    essay: aiEssay,
  } : null;
  return { cfg, det, aiObjective, aiEssay, needAi, cannotGrade, aiMax: aiMax || sub.max_score, scope, answerPath, subPaths };
}

// ── Lưu kết quả (phần máy chấm + phần AI chấm) ─────────────────────────────────────────────
function finalize(kind, K, sub, submissionId, ctx, aiResult) {
  const db = getDb();
  const { cfg, det, aiEssay, needAi, cannotGrade } = ctx;
  const aiScore = aiResult ? aiResult.score || 0 : 0;
  const aiDetails = aiResult ? (aiResult.details || []).slice() : [];
  const aiFeedback = aiResult ? aiResult.feedback || '' : '';
  const aiMarks = aiResult ? aiResult.marks || null : null; // ảnh bài làm đã chấm + kết quả đối chiếu
  // Chi tiết AI vừa chấm (trước khi thêm các ghi chú "chưa có đáp án" bên dưới)
  const aiGradedDetails = aiDetails.slice();
  // Phần không thể chấm (chưa có đáp án & không có file đáp án) → ghi chú để giáo viên xử lý
  cannotGrade.forEach((k) => aiDetails.push({
    question: PART_LABELS[k] || k, status: 'partial',
    comment: 'Chưa có đáp án để chấm — hãy nhập đáp án các câu này hoặc tải File đáp án (PDF) để AI tự đọc.',
  }));

  // Gộp điểm THÔ (tổng các câu) rồi QUY ĐỔI về thang giáo viên chọn (sub.max_score)
  const rawEarned = round2(det.score + aiScore);
  let total = cfg ? scaleToTarget(rawEarned, rawMaxScore(cfg), sub.max_score) : rawEarned;
  if (sub.max_score != null) total = Math.max(0, Math.min(sub.max_score, total));
  const details = [...det.details, ...aiDetails];
  // Nhận xét theo MẪU (KHÔNG dùng AI), mức theo điểm cả bài + chủ đề bài (overview soạn sẵn 1 lần).
  let rubric = null;
  try { rubric = sub.feedback_rubric ? JSON.parse(sub.feedback_rubric) : null; } catch { rubric = null; }
  const topic = rubric && rubric.overview;
  const objMaxPts = ['multiple_choice', 'true_false', 'short_answer']
    .reduce((s, k) => s + (det.gradedParts[k] ? partMax(cfg, k) : 0), 0);
  let feedback;
  if (cfg ? partEnabled(cfg, 'essay') : aiEssay) {
    // Câu sai theo LOẠI LỖI (tính toán / lập luận / đọc đề / kiến thức / kết luận), gộp nhãn "5abc, 6b"
    const pct10 = sub.max_score > 0 ? (total / sub.max_score) * 10 : 0;
    feedback = composeEssayFeedback(pct10, mergeAiObjectiveStats(det.partStats, aiGradedDetails), topic,
      essayDetailsOf(aiGradedDetails), { essayNotSubmitted: !aiEssay });
  } else {
    const detFeedback = objMaxPts > 0 ? composeAutoFeedback((det.score / objMaxPts) * 10, det.partStats, topic) : '';
    feedback = [detFeedback, aiFeedback].filter(Boolean).join(' ') || `Tổng điểm: ${total}/${sub.max_score}.`;
  }

  removeGradedFiles(sub.graded_pages); // ảnh chấm của lần chấm trước (chấm lại) không còn dùng
  db.prepare(`UPDATE ${K.table} SET score=?,feedback=?,grading_details=?,graded_pages=?,graded_at=?,graded_by_ai=?,grading_status='done' WHERE id=?`)
    .run(total, feedback, JSON.stringify(details), aiMarks ? JSON.stringify(aiMarks) : null, new Date().toISOString(), needAi ? 1 : 0, submissionId);
  if (K.settle) K.settle(db, submissionId); // nộp nhiều lần → giữ lần có điểm cao nhất
  console.log(`[grading-queue] ✅ Đã chấm ${kind} #${submissionId}: ${total}/${sub.max_score}${needAi ? ' (auto+AI)' : ' (auto)'}`);
  return { score: total, feedback, details };
}

// ── Chấm lỗi: hết lượt mọi key → không tính lần thử, hẹn lại; lỗi khác → thử lại / đánh dấu thất bại ──
let scheduledRetryAt = 0; // chấm gom gặp hết lượt → chạy lại các bài đang chờ vào lúc này
function handleFail(kind, K, sub, submissionId, err, { scheduled = false } = {}) {
  const db = getDb();
  const waitStatus = scheduled ? 'scheduled' : 'pending';
  if (err.quota) {
    db.prepare(`UPDATE ${K.table} SET grading_status=?, grading_attempts=MAX(0,COALESCE(grading_attempts,1)-1) WHERE id=?`).run(waitStatus, submissionId);
    // Hẹn đúng lúc sớm nhất có key × model dùng lại được (tối thiểu 1 phút, tối đa 6 giờ)
    const delay = Math.min(6 * 3600_000, Math.max(60_000, (err.retryAt || 0) - Date.now() || QUOTA_RETRY_MS));
    if (scheduled) {
      scheduledRetryAt = scheduledRetryAt ? Math.min(scheduledRetryAt, Date.now() + delay) : Date.now() + delay;
    } else {
      quotaBlockedUntil = Date.now() + delay;
      setTimeout(() => enqueue(submissionId, kind), delay);
    }
    console.warn(`[grading-queue] Mọi API key đã hết lượt model chấm → chấm lại ${kind} #${submissionId} sau ${Math.round(delay / 60000)} phút`);
    return;
  }
  const attempts = (sub.grading_attempts || 0) + 1;
  const status = attempts >= MAX_ATTEMPTS ? 'failed' : waitStatus;
  db.prepare(`UPDATE ${K.table} SET grading_status=? WHERE id=?`).run(status, submissionId);
  if (status === 'failed') console.error(`[grading-queue] ❌ Bài ${kind} #${submissionId} thất bại sau ${attempts} lần thử.`);
  else if (scheduled) scheduledRetryAt = scheduledRetryAt || Date.now() + 10 * 60_000;
  else setTimeout(() => enqueue(submissionId, kind), RETRY_DELAY_MS); // thử lại sau một lúc (không chặn hàng đợi)
}

// Kiểm tra chung trước khi chấm. Trả về { sub } nếu chấm được, hoặc { result } nếu đã xử lý xong.
function precheck(K, kind, submissionId, force) {
  const db = getDb();
  const sub = K.load(db, submissionId);
  if (!sub) return { result: null };
  // Không có đáp án nào (file tự luận lẫn key objective/HSA) → không chấm tự động được, để giáo viên chấm tay
  if (!needsAiGrading(sub)) {
    db.prepare(`UPDATE ${K.table} SET grading_status=NULL WHERE id=?`).run(submissionId);
    return { result: null };
  }
  // HSA: chấm hoàn toàn tự động (không AI, không quy đổi thang điểm)
  if (sub.exam_type === 'hsa') return { result: gradeHsaSubmission(db, K, sub, submissionId) };
  // Phải có ít nhất bài làm: file ảnh/PDF HOẶC đáp án có cấu trúc đã điền
  if (submissionFilenames(sub).length === 0 && !sub.structured_answers) {
    db.prepare(`UPDATE ${K.table} SET grading_status=NULL WHERE id=?`).run(submissionId);
    return { result: null };
  }
  if (!force && (sub.grading_attempts || 0) >= MAX_ATTEMPTS) {
    db.prepare(`UPDATE ${K.table} SET grading_status='failed' WHERE id=?`).run(submissionId);
    return { result: null };
  }
  return { sub };
}

// Chấm 1 bài nộp rồi lưu kết quả.
// force=true (giáo viên chấm lại): bỏ qua giới hạn số lần thử, chấm NGAY (không chờ lịch chấm gom).
// Trả về kết quả chấm (null nếu bài được xếp chờ chấm gom); ném lỗi nếu chấm thất bại.
async function gradeRecord(kind, submissionId, { force = false } = {}) {
  const K = KINDS[kind];
  if (!K) return null;
  const db = getDb();
  const pre = precheck(K, kind, submissionId, force);
  if (!pre.sub) return pre.result;
  const sub = pre.sub;

  let ctx;
  try {
    ctx = await analyze(kind, K, sub, submissionId);
  } catch (err) {
    handleFail(kind, K, sub, submissionId, err);
    throw err;
  }
  console.log(`[grading-queue] #${submissionId} det=${ctx.det.score} pendingAi=[${ctx.det.pendingAi}] aiKeyless=[${ctx.det.aiKeyless}] needAi=${ctx.needAi}`);

  // Cần AI + đang chạy lịch chấm gom → chờ tới đợt chấm (21:30 / trước hạn nộp), không tốn lượt gọi ngay
  if (ctx.needAi && kind === 'hw' && !force && scheduleMode() === 'daily') {
    db.prepare(`UPDATE ${K.table} SET grading_status='scheduled' WHERE id=?`).run(submissionId);
    if (sub.submitted_by) {
      queueSoon(sub.hw_id, teacherDelayMs(), { realtime: true, reason: `giáo viên nộp hộ bài #${sub.hw_id}` }); // gom đủ cả loạt
      console.log(`[grading-queue] ⏳ Bài nộp hộ #${submissionId} → chấm gom sau ${Math.round(teacherDelayMs() / 60000)} phút`);
    } else if (inCenterHours() && dueToday(sub.due_date)) {
      queueSoon(sub.hw_id, centerDelayMs(), { realtime: true, reason: `giờ trung tâm — bài #${sub.hw_id} đến hạn hôm nay`, maxWaitMs: centerMaxWaitMs() });
      console.log(`[grading-queue] ⚡ Bài nộp #${submissionId} (đến hạn hôm nay, giờ trung tâm) → chấm gom sau ~${Math.round(centerDelayMs() / 60000)} phút`);
    } else {
      console.log(`[grading-queue] ⏳ Bài nộp #${submissionId} chờ đợt chấm gom (${new Date(nextGradingAt(sub.due_date)).toLocaleString('vi-VN', { timeZone: VN_TZ })})`);
    }
    return null;
  }

  // Đánh dấu đang chấm + tăng số lần thử
  db.prepare(`UPDATE ${K.table} SET grading_status='grading', grading_attempts=COALESCE(grading_attempts,0)+1 WHERE id=?`).run(submissionId);
  try {
    let aiResult = null;
    if (ctx.needAi) {
      aiResult = await gradeSubmission(ctx.answerPath, ctx.subPaths, ctx.aiMax, sub.grading_note, {
        partsConfig: ctx.cfg || sub.parts_config, // cfg đã ghép đáp án để AI có sẵn key
        scope: ctx.scope,
        studentAnswers: sub.structured_answers,
        annotatePrefix: `${kind}_${submissionId}_${Date.now()}`, // vẽ đúng/sai lên ảnh bài làm
        realtime: force, // giáo viên bấm "chấm lại" đang chờ → gọi thường; chấm nền → Batch (rẻ 50%)
        // Sổ kinh nghiệm chấm (giáo viên đã sửa AI) + lỗi hay gặp của đề (chỉ với bài tập của lớp)
        lessons: lessonsFor(db, kind === 'hw' ? sub.hw_id : null),
        hints: kind === 'hw' ? commonErrorHints(db, sub.hw_id) : [],
      });
    }
    return finalize(kind, K, sub, submissionId, ctx, aiResult);
  } catch (err) {
    handleFail(kind, K, sub, submissionId, err);
    throw err;
  }
}

// ── Chạy 1 đợt chấm gom: các bài đang chờ (của 1 bài tập hoặc tất cả) → nhóm theo bài tập → chấm ──
// Nhiều đợt có thể chạy cùng lúc (mỗi bài tập 1 đợt + đợt chung 21:30); mỗi bài nộp được "nhận" (scheduled →
// grading) trước khi chấm nên không bao giờ bị 2 đợt chấm trùng.
const runningRuns = new Set(); // 'all' | 'hw:<id>'
const isRunning = (key) => runningRuns.has(key);
async function runScheduledGrading({ homeworkId = null, reason = '', realtime = false } = {}) {
  const lockKey = homeworkId ? `hw:${homeworkId}` : 'all';
  if (runningRuns.has(lockKey)) return { skipped: true };
  runningRuns.add(lockKey);
  const fast = !!realtime; // đợt ưu tiên
  if (fast) priorityActive += 1;
  const K = KINDS.hw;
  const db = getDb();
  let graded = 0, failed = 0;
  try {
    const ids = db.prepare(`SELECT s.id FROM submissions s WHERE s.grading_status='scheduled'${homeworkId ? ' AND s.homework_id=?' : ''} ORDER BY s.submitted_at`)
      .all(...(homeworkId ? [homeworkId] : [])).map((r) => r.id);
    const claim = db.prepare(`UPDATE ${K.table} SET grading_status='grading' WHERE id=? AND grading_status='scheduled'`);
    const claimed = ids.filter((id) => claim.run(id).changes === 1);
    if (!claimed.length) return { graded: 0 };
    console.log(`[grading-queue] 🗂️ Đợt chấm gom (${reason || 'thủ công'}${realtime ? ', gọi nhanh' : ''}): ${claimed.length} bài`);

    // Phân tích từng bài; bài nào không còn cần AI thì lưu luôn
    const items = [];
    for (const id of claimed) {
      const pre = precheck(K, 'hw', id, false);
      if (!pre.sub) continue;
      try {
        const ctx = await analyze('hw', K, pre.sub, id);
        if (!ctx.needAi) { finalize('hw', K, pre.sub, id, ctx, null); graded++; continue; }
        db.prepare(`UPDATE ${K.table} SET grading_attempts=COALESCE(grading_attempts,0)+1 WHERE id=?`).run(id);
        items.push({ id, sub: pre.sub, ctx });
      } catch (err) {
        handleFail('hw', K, pre.sub, id, err, { scheduled: true });
        failed++;
      }
    }

    // Nhóm: cùng bài tập + cùng phạm vi chấm + cùng thang điểm phần AI → chia mỗi nhóm tối đa N học sinh
    const groups = new Map();
    items.forEach((it) => {
      const key = [it.sub.hw_id, it.sub.answer_file, it.ctx.aiMax, JSON.stringify(it.ctx.scope)].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    const chunks = [];
    // Số "chỗ" chạy cùng lúc = số key còn lượt model mạnh × số nhóm mỗi key gánh (GRADING_PARALLEL_PER_KEY, mặc định 2)
    const { gradingModels } = require('./aiGrading');
    const usable = Math.max(...gradingModels().map((m) => aiKeys.keysFor(m, { rotate: false }).length), 1);
    const perKey = Math.max(1, Number(process.env.GRADING_PARALLEL_PER_KEY) || 2);
    const maxPar = fast
      ? Math.max(1, Number(process.env.GRADING_FAST_MAX_PARALLEL) || 20) // ưu tiên: càng nhiều key càng nhiều nhóm chạy cùng lúc
      : Math.max(1, Number(process.env.GRADING_MAX_PARALLEL) || 6);
    const slots = Math.max(1, Math.min(maxPar, usable * perKey));
    // Số bài mỗi lượt gọi:
    //  • đợt ƯU TIÊN: chia đều số bài cho số chỗ đang có → nhiều key thì mỗi lượt ít bài (có thể 1 bài/lượt),
    //    ít key thì gộp nhiều hơn; tối đa GRADING_FAST_GROUP_MAX (mặc định 3 — mức đã đo vẫn chấm chuẩn);
    //  • đợt THƯỜNG (21:30): giữ GRADING_GROUP_SIZE (mặc định 3) để tiết kiệm lượt gọi.
    const fastMax = Math.max(1, Math.min(5, Number(process.env.GRADING_FAST_GROUP_MAX) || 3));
    const n = fast ? Math.max(1, Math.min(fastMax, Math.ceil(items.length / slots))) : groupSize();
    groups.forEach((list) => { for (let i = 0; i < list.length; i += n) chunks.push(list.slice(i, i + n)); });
    console.log(`[grading-queue] Chia ${items.length} bài → ${chunks.length} lượt gọi × ≤${n} bài, ${usable} key còn lượt${fast ? ' (ưu tiên)' : ''}`);

    const runChunk = async (chunk) => {
      // Đợt thường nhường đợt ưu tiên: chờ các đợt ưu tiên chấm xong mới gọi tiếp (không tranh lượt / key)
      while (!fast && priorityActive > 0) await new Promise((r) => setTimeout(r, 5000));
      const first = chunk[0];
      let results;
      try {
        results = await gradeGroup({
          answerFilePath: first.ctx.answerPath,
          maxScore: first.ctx.aiMax,
          gradingNote: first.sub.grading_note,
          partsConfig: first.ctx.cfg || first.sub.parts_config,
          scope: first.ctx.scope,
          realtime, // chấm gấp (nộp hộ / chấm lại / giờ trung tâm) → gọi thường; đợt 21:30 → Batch nếu có (rẻ 50%)
          lessons: lessonsFor(db, first.sub.hw_id),
          // Lỗi hay gặp tính lại trước MỖI nhóm: nhóm sau được hưởng thống kê từ các nhóm đã chấm xong
          hints: commonErrorHints(db, first.sub.hw_id),
        }, chunk.map((it) => ({ files: it.ctx.subPaths, studentAnswers: it.sub.structured_answers, annotatePrefix: `hw_${it.id}_${Date.now()}` })));
      } catch (err) {
        results = chunk.map(() => ({ ok: false, error: err }));
      }
      chunk.forEach((it, i) => {
        const r = results[i];
        if (r && r.ok) {
          try { finalize('hw', K, it.sub, it.id, it.ctx, r); graded++; } catch (e) { handleFail('hw', K, it.sub, it.id, e, { scheduled: true }); failed++; }
        } else {
          handleFail('hw', K, it.sub, it.id, (r && r.error) || new Error('Không có kết quả'), { scheduled: true });
          failed++;
        }
      });
    };
    // Chạy SONG SONG nhiều nhóm để có điểm nhanh: mỗi key gánh tối đa GRADING_PARALLEL_PER_KEY nhóm cùng lúc
    // (mặc định 2; mỗi nhóm = 2 lượt gọi song song), tổng tối đa GRADING_MAX_PARALLEL (mặc định 6). Các nhóm
    // được xoay vòng sang key khác nhau (aiKeys.keysFor) để không dồn token/phút (TPM), lượt/phút (RPM) vào
    // 1 key; chạm giới hạn phút thì tự đổi key hoặc chờ vài chục giây (geminiClient.generateJson).
    const parallel = Math.max(1, Math.min(slots, chunks.length));
    const queueChunks = chunks.slice();
    await Promise.all(Array.from({ length: parallel }, async () => { while (queueChunks.length) await runChunk(queueChunks.shift()); }));
    console.log(`[grading-queue] 🗂️ Xong đợt chấm gom (${parallel} nhóm chạy song song): ${graded} bài đã chấm, ${failed} bài chưa chấm được (${chunks.length} lượt nhóm)`);
    return { graded, failed, groups: chunks.length };
  } finally {
    runningRuns.delete(lockKey);
    if (fast) priorityActive = Math.max(0, priorityActive - 1);
  }
}

// Giáo viên bấm "AI chấm lại" (có thể bấm nhiều bài liên tiếp): xếp bài vào hàng, các bài bấm trong ~20 giây
// được gom chấm chung (nhóm nhiều học sinh / lượt gọi), gọi thường cho nhanh. Không chấm từng bài song song.
function queueRegrade(submissionId) {
  const db = getDb();
  const sub = db.prepare('SELECT id, homework_id FROM submissions WHERE id=?').get(submissionId);
  if (!sub) return null;
  db.prepare("UPDATE submissions SET grading_status='scheduled', grading_attempts=0 WHERE id=? AND COALESCE(grading_status,'') <> 'grading'").run(submissionId);
  return queueSoon(sub.homework_id, 20_000, { realtime: true, reason: `giáo viên bấm chấm lại bài #${sub.homework_id}` });
}
const soonAt = (homeworkId) => { const e = soonRuns.get(Number(homeworkId)); return e ? e.at : null; };

// Mỗi 30 giây: đợt chấm sớm đã hẹn (nộp hộ / chấm lại / giờ trung tâm), giờ chấm gom hằng ngày, trước hạn nộp,
// hết thời gian chờ quota → chạy đợt chấm (chạy nền, không chờ nhau; mỗi bài tập tối đa 1 đợt cùng lúc).
const centerLaunched = new Map(); // id bài tập → lần chạy giờ trung tâm gần nhất (tránh gọi dồn khi đang hết lượt)
function launch(opts) {
  runScheduledGrading(opts).catch((e) => console.error('[grading-queue] đợt chấm lỗi:', e.message));
}
async function scheduleTick() {
  try {
    const db = getDb();
    const now = Date.now();
    // 0) Đợt chấm sớm đã hẹn (nộp hộ / giáo viên bấm chấm lại / giờ trung tâm) — chạy ở mọi chế độ
    for (const [hwId, e] of soonRuns) {
      if (now >= e.at && !isRunning(`hw:${hwId}`)) {
        soonRuns.delete(hwId);
        launch({ homeworkId: hwId, reason: e.reason, realtime: e.realtime });
      }
    }
    if (scheduleMode() !== 'daily') return;
    const vn = vnNow(now);
    const { h, m } = dailyTime();
    // 1) Giờ hoạt động của trung tâm: bài đến hạn HÔM NAY còn chờ → chấm luôn (ưu tiên, gọi nhanh)
    if (inCenterHours(now)) {
      db.prepare(`SELECT DISTINCT h.id, h.due_date FROM homework h JOIN submissions s ON s.homework_id=h.id
        WHERE s.grading_status='scheduled' AND h.due_date IS NOT NULL`).all()
        .filter((r) => dueToday(r.due_date, now) && !soonRuns.has(r.id) && !isRunning(`hw:${r.id}`) && now - (centerLaunched.get(r.id) || 0) > centerMaxWaitMs())
        .forEach((r) => {
          centerLaunched.set(r.id, now);
          queueSoon(r.id, centerDelayMs(), { realtime: true, reason: `giờ trung tâm — bài #${r.id} đến hạn hôm nay`, maxWaitMs: centerMaxWaitMs() });
        });
    }
    // 2) Mỗi tối 21:30 (chạy bù nếu server ngủ đúng giờ)
    if (vn.minutes >= h * 60 + m && !ranBefore(db, `daily:${vn.date}`) && !isRunning('all')) {
      markRan(db, `daily:${vn.date}`);
      launch({ reason: `hằng ngày ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
    }
    // 3) Trước hạn nộp N phút: chấm riêng các bài đang chờ của bài tập đó
    const dues = db.prepare(`SELECT DISTINCT h.id, h.due_date FROM homework h JOIN submissions s ON s.homework_id=h.id
      WHERE s.grading_status='scheduled' AND h.due_date IS NOT NULL`).all();
    for (const d of dues) {
      const at = Date.parse(d.due_date) - predueMinutes() * 60_000;
      const key = `predue:${d.id}:${d.due_date}`;
      if (Number.isFinite(at) && now >= at && !ranBefore(db, key) && !isRunning(`hw:${d.id}`)) {
        markRan(db, key);
        launch({ homeworkId: d.id, reason: `trước hạn nộp bài #${d.id}`, realtime: true });
      }
    }
    // 4) Đợt trước gặp hết lượt / lỗi tạm thời → chạy lại khi đã tới giờ hẹn
    if (scheduledRetryAt && now >= scheduledRetryAt && !isRunning('all')) {
      scheduledRetryAt = 0;
      launch({ reason: 'chấm lại bài còn chờ (hết lượt/lỗi tạm thời)' });
    }
  } catch (err) {
    console.error('[grading-queue] lịch chấm gom lỗi:', err.message);
  }
}

// Gom các bài đang chờ ('pending', chưa quá số lần thử, có đáp án) vào hàng đợi
function sweepPending() {
  if (Date.now() < quotaBlockedUntil) return;
  try {
    const db = getDb();
    for (const [kind, K] of Object.entries(KINDS)) {
      // Lọc thêm: chỉ chấm bài thực sự có đáp án (file tự luận, key objective, hoặc key HSA)
      K.pending(db).filter(r => r.answer_file || hasAnswerKey(r.parts_config) || hasHsaAnswerKey(r.hsa_config)).forEach(r => enqueue(r.id, kind));
    }
  } catch (err) {
    console.error('[grading-queue] sweep lỗi:', err.message);
  }
}

// Gọi khi server khởi động: phục hồi các bài còn dở + bật quét định kỳ
function startGradingWorker() {
  try {
    const db = getDb();
    // Các bài bị treo ở trạng thái 'grading' từ lần chạy trước → đưa lại 'pending'
    Object.values(KINDS).forEach((K) => db.prepare(`UPDATE ${K.table} SET grading_status='pending' WHERE grading_status='grading'`).run());
    sweepPending();
    setInterval(sweepPending, SWEEP_INTERVAL_MS);
    // Lịch chấm gom: kiểm tra mỗi phút (và ngay khi khởi động — chạy bù nếu server ngủ đúng giờ chấm)
    setTimeout(scheduleTick, 15_000);
    setInterval(scheduleTick, 30_000);
    console.log(`🤖 Hàng đợi chấm bài AI đã sẵn sàng (${scheduleMode() === 'daily' ? `chấm gom lúc ${process.env.GRADING_DAILY_TIME || '21:30'} + trước hạn nộp ${predueMinutes()} phút, ${groupSize()} bài/lượt` : 'chấm ngay từng bài'})`);
  } catch (err) {
    console.error('[grading-queue] startGradingWorker lỗi:', err.message);
  }
}

// Chấm 1 bài nộp của học sinh (giữ tên cũ cho các nơi đang gọi)
const gradeOne = (submissionId, opts) => gradeRecord('hw', submissionId, opts);
// Chấm 1 bài làm thi thử
const gradeMock = (attemptId, opts) => gradeRecord('mock', attemptId, opts);

module.exports = { enqueue, gradeOne, gradeMock, startGradingWorker, runScheduledGrading, nextGradingAt, scheduleMode, queueRegrade, soonAt, inCenterHours, dueToday, _scheduleTick: scheduleTick };
