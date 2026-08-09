// Hàng đợi chấm bài nền: học sinh nộp xong được nhận bài NGAY,
// việc chấm AI chạy nền tuần tự, có thử lại khi lỗi và tự phục hồi sau khi server khởi động lại.
const path = require('path');
const { getDb } = require('../db/database');
const { gradeSubmission, extractAnswerKey } = require('./aiGrading');
const { needsAiGrading, hasAnswerKey, parsePartsConfig, partEnabled, missingKeyIndices, applyExtractedKeys, PART_LABELS } = require('./homeworkParts');
const { scoreStructured, partMax, round2, rawMaxScore, scaleToTarget, composeAutoFeedback } = require('./homeworkScoring');

const MAX_ATTEMPTS = 5;            // số lần thử chấm tối đa trước khi đánh dấu thất bại
const RETRY_DELAY_MS = 30_000;     // chờ trước khi thử lại một bài bị lỗi
const SWEEP_INTERVAL_MS = 60_000;  // quét định kỳ để gom các bài còn "pending"

const queue = [];          // FIFO các submission id chờ chấm
const inQueue = new Set();
let running = false;

// Cache đáp án AI đọc được từ file đáp án, theo (homework_id : tên file đáp án).
// Nhờ đó nhiều học sinh cùng bài chỉ tốn 1 lần đọc file; file đổi (tên mới) → tự đọc lại.
const answerKeyCache = new Map();

// Lấy danh sách tên file của một bài nộp (hỗ trợ cũ: file_path đơn, mới: files JSON)
function submissionFilenames(sub) {
  if (sub && sub.files) {
    try { const a = JSON.parse(sub.files); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ }
  }
  return sub && sub.file_path ? [sub.file_path] : [];
}

function enqueue(submissionId) {
  const id = Number(submissionId);
  if (!id || inQueue.has(id)) return;
  inQueue.add(id);
  queue.push(id);
  if (!running) processQueue();
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const id = queue.shift();
    inQueue.delete(id);
    try {
      await gradeOne(id);
    } catch (err) {
      console.error(`[grading-queue] Bài nộp #${id} chấm lỗi: ${err.message}`);
    }
  }
  running = false;
}

// Chấm 1 bài nộp rồi lưu kết quả.
// force=true (giáo viên chấm lại): bỏ qua giới hạn số lần thử.
// Trả về kết quả chấm; ném lỗi nếu chấm thất bại (để nơi gọi xử lý/thử lại).
async function gradeOne(submissionId, { force = false } = {}) {
  const db = getDb();
  const sub = db.prepare(`
    SELECT s.*, h.id hw_id, h.answer_file, h.max_score, h.grading_note, h.parts_config, h.feedback_rubric
    FROM submissions s JOIN homework h ON s.homework_id = h.id
    WHERE s.id = ?
  `).get(submissionId);

  if (!sub) return null;

  // Không có đáp án nào (file tự luận lẫn key objective) → không chấm AI được, để giáo viên chấm tay
  if (!needsAiGrading(sub)) {
    db.prepare('UPDATE submissions SET grading_status=NULL WHERE id=?').run(submissionId);
    return null;
  }

  const subFiles = submissionFilenames(sub);
  // Phải có ít nhất bài làm: file ảnh/PDF HOẶC đáp án có cấu trúc đã điền
  if (subFiles.length === 0 && !sub.structured_answers) {
    db.prepare('UPDATE submissions SET grading_status=NULL WHERE id=?').run(submissionId);
    return null;
  }

  if (!force && (sub.grading_attempts || 0) >= MAX_ATTEMPTS) {
    db.prepare("UPDATE submissions SET grading_status='failed' WHERE id=?").run(submissionId);
    return null;
  }

  // Đánh dấu đang chấm + tăng số lần thử
  db.prepare("UPDATE submissions SET grading_status='grading', grading_attempts=COALESCE(grading_attempts,0)+1 WHERE id=?")
    .run(submissionId);

  const answerPath = sub.answer_file ? path.join(__dirname, '../../uploads/homework', sub.answer_file) : null;
  const subPaths = subFiles.map(name => path.join(__dirname, '../../uploads/submissions', name));
  const hasImages = subPaths.length > 0;

  try {
    let cfg = parsePartsConfig(sub.parts_config);

    // 0) Câu objective giáo viên ĐỂ TRỐNG đáp án → nhờ AI đọc từ FILE ĐÁP ÁN rồi ghép vào cfg.
    //    (đáp án giáo viên nhập tay luôn được ưu tiên; chỉ điền vào câu còn trống)
    if (cfg && answerPath) {
      const missing = {
        multiple_choice: missingKeyIndices(cfg, 'multiple_choice'),
        true_false: missingKeyIndices(cfg, 'true_false'),
        short_answer: missingKeyIndices(cfg, 'short_answer'),
      };
      if (missing.multiple_choice.length || missing.true_false.length || missing.short_answer.length) {
        const cacheKey = `${sub.hw_id}:${sub.answer_file}`;
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

    // 2) Xác định phần cần AI chấm:
    //    - pendingAi: HS KHÔNG điền giao diện → AI dò trong ẢNH (cần có ảnh)
    //    - aiKeyless: HS CÓ điền nhưng cả phần chưa có đáp án → AI đọc FILE ĐÁP ÁN + đáp án HS điền (cần file đáp án)
    //    - tự luận (nếu bật, và có ảnh bài làm); bài cũ (không cfg) có file đáp án → AI chấm toàn bộ từ ảnh
    const aiFromImages = hasImages ? (det.pendingAi || []) : [];
    const aiFromAnswers = answerPath ? (det.aiKeyless || []) : [];
    const aiObjective = [...new Set([...aiFromImages, ...aiFromAnswers])];
    const essayEnabled = cfg ? partEnabled(cfg, 'essay') : !!sub.answer_file;
    const aiEssay = hasImages && essayEnabled;
    const needAi = aiObjective.length > 0 || aiEssay;

    // Phần chưa có đáp án mà KHÔNG có file đáp án (và không có ảnh) → không thể chấm tự động/AI
    const cannotGrade = (cfg ? (det.aiKeyless || []) : []).filter((k) => !aiObjective.includes(k));

    console.log(`[grading-queue] #${submissionId} det=${det.score} pendingAi=[${det.pendingAi}] aiKeyless=[${det.aiKeyless}] unresolved=${(det.unresolved || []).length} hasImages=${hasImages} answerFile=${!!answerPath}`);

    let aiScore = 0;
    let aiDetails = [];
    let aiFeedback = '';
    if (needAi) {
      // Thang điểm THÔ phần AI phụ trách
      let aiMax;
      if (!cfg) {
        aiMax = sub.max_score; // bài cũ: AI chấm toàn bộ trên thang điểm bài
      } else {
        aiMax = 0;
        aiObjective.forEach(k => { aiMax += partMax(cfg, k); });
        if (aiEssay) aiMax += partMax(cfg, 'essay');
        aiMax = round2(aiMax);
      }
      const scope = cfg ? {
        multiple_choice: aiObjective.includes('multiple_choice'),
        true_false: aiObjective.includes('true_false'),
        short_answer: aiObjective.includes('short_answer'),
        essay: aiEssay,
      } : null;

      const aiResult = await gradeSubmission(answerPath, subPaths, aiMax || sub.max_score, sub.grading_note, {
        partsConfig: cfg || sub.parts_config, // cfg đã ghép đáp án để AI có sẵn key
        scope,
        studentAnswers: sub.structured_answers, // để AI chấm phần khách quan từ đáp án HS điền (không cần ảnh)
      });
      aiScore = aiResult.score || 0;
      aiDetails = aiResult.details || [];
      aiFeedback = aiResult.feedback || '';
    }

    // Phần không thể chấm (chưa có đáp án & không có file đáp án) → ghi chú để giáo viên xử lý
    cannotGrade.forEach((k) => aiDetails.push({
      question: PART_LABELS[k] || k, status: 'partial',
      comment: 'Chưa có đáp án để chấm — hãy nhập đáp án các câu này hoặc tải File đáp án (PDF) để AI tự đọc.',
    }));

    // 3) Gộp điểm THÔ (tổng các câu) rồi QUY ĐỔI về thang giáo viên chọn (sub.max_score)
    const rawEarned = round2(det.score + aiScore);
    let total = cfg ? scaleToTarget(rawEarned, rawMaxScore(cfg), sub.max_score) : rawEarned;
    if (sub.max_score != null) total = Math.max(0, Math.min(sub.max_score, total));
    const details = [...det.details, ...aiDetails];
    // Nhận xét khái quát cho phần chấm tự động (KHÔNG dùng AI) — dựa trên partStats + rubric đã soạn sẵn
    // 1 lần khi tạo/cập nhật đáp án (xem homework.js). Ghép với nhận xét AI (nếu có phần AI chấm, vd tự luận).
    let rubric = null;
    try { rubric = sub.feedback_rubric ? JSON.parse(sub.feedback_rubric) : null; } catch { rubric = null; }
    const detFeedback = composeAutoFeedback(det.partStats, rubric);
    const feedback = [detFeedback, aiFeedback].filter(Boolean).join(' ') || `Tổng điểm: ${total}/${sub.max_score}.`;

    db.prepare("UPDATE submissions SET score=?,feedback=?,grading_details=?,graded_at=?,graded_by_ai=?,grading_status='done' WHERE id=?")
      .run(total, feedback, JSON.stringify(details), new Date().toISOString(), needAi ? 1 : 0, submissionId);
    console.log(`[grading-queue] ✅ Đã chấm bài nộp #${submissionId}: ${total}/${sub.max_score}${needAi ? ' (auto+AI)' : ' (auto)'}`);
    return { score: total, feedback, details };
  } catch (err) {
    const attempts = (sub.grading_attempts || 0) + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    db.prepare('UPDATE submissions SET grading_status=? WHERE id=?').run(status, submissionId);
    if (status === 'pending') {
      // Lên lịch thử lại sau một lúc (không chặn hàng đợi)
      setTimeout(() => enqueue(submissionId), RETRY_DELAY_MS);
    } else {
      console.error(`[grading-queue] ❌ Bài nộp #${submissionId} thất bại sau ${attempts} lần thử.`);
    }
    throw err;
  }
}

// Gom các bài đang chờ ('pending', chưa quá số lần thử, có đáp án) vào hàng đợi
function sweepPending() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT s.id, h.answer_file, h.parts_config FROM submissions s JOIN homework h ON s.homework_id = h.id
      WHERE s.grading_status='pending' AND COALESCE(s.grading_attempts,0) < ?
        AND (h.answer_file IS NOT NULL OR h.parts_config IS NOT NULL)
    `).all(MAX_ATTEMPTS);
    // Lọc thêm: chỉ chấm bài thực sự có đáp án (file tự luận hoặc key objective)
    rows.filter(r => r.answer_file || hasAnswerKey(r.parts_config)).forEach(r => enqueue(r.id));
  } catch (err) {
    console.error('[grading-queue] sweep lỗi:', err.message);
  }
}

// Gọi khi server khởi động: phục hồi các bài còn dở + bật quét định kỳ
function startGradingWorker() {
  try {
    const db = getDb();
    // Các bài bị treo ở trạng thái 'grading' từ lần chạy trước → đưa lại 'pending'
    db.prepare("UPDATE submissions SET grading_status='pending' WHERE grading_status='grading'").run();
    sweepPending();
    setInterval(sweepPending, SWEEP_INTERVAL_MS);
    console.log('🤖 Hàng đợi chấm bài AI đã sẵn sàng');
  } catch (err) {
    console.error('[grading-queue] startGradingWorker lỗi:', err.message);
  }
}

module.exports = { enqueue, gradeOne, startGradingWorker };
