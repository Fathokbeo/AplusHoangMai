// Xử lý dữ liệu form "đề bài" dùng chung cho bài tập (homework) và đề thi thử (mock_exams):
// chuẩn hóa cấu hình các phần / HSA / thời gian làm bài, tên file gốc, và soạn "quy chuẩn nhận xét".
const path = require('path');
const { getDb } = require('../db/database');
const { parsePartsConfig, partEnabled, keyIsSet } = require('./homeworkParts');
const { DEFAULT_POINTS } = require('./homeworkScoring');
const { generateFeedbackRubric } = require('./aiGrading');

// Đọc FILE ĐÁP ÁN đúng 1 LẦN (chạy nền, không chặn request) để soạn "quy chuẩn nhận xét" (1 câu mô tả
// khái quát nội dung đề) — dùng khi chấm tự động sau này để ghép vào mẫu nhận xét theo thang điểm mà
// KHÔNG cần gọi AI mỗi lần chấm (xem homeworkScoring.composeAutoFeedback + gradingQueue.js).
// Chỉ chạy khi có file đáp án + ít nhất 1 phần khách quan đã có đáp án (key) sẵn (nếu không thì
// composeAutoFeedback không có gì để chấm/nhận xét, tạo rubric lúc này sẽ phí lượt AI).
// table: 'homework' | 'mock_exams'; uploadDir: thư mục chứa file đáp án ('homework' | 'mock').
function scheduleRubricGeneration(id, answerFilename, partsJson, { table = 'homework', uploadDir = 'homework' } = {}) {
  const cfg = parsePartsConfig(partsJson);
  if (!cfg || !answerFilename) return;
  const hasObjectiveKey = ['multiple_choice', 'true_false', 'short_answer'].some(
    (k) => partEnabled(cfg, k) && Array.isArray(cfg[k].answers) && cfg[k].answers.some((v) => keyIsSet(k, v))
  );
  if (!hasObjectiveKey) return;
  const answerPath = path.join(__dirname, '../../uploads', uploadDir, answerFilename);
  generateFeedbackRubric(answerPath)
    .then((rubric) => {
      if (!rubric) return;
      getDb().prepare(`UPDATE ${table} SET feedback_rubric=? WHERE id=?`).run(JSON.stringify(rubric), id);
      console.log(`[${table}] 📝 Đã tạo quy chuẩn nhận xét cho #${id}`);
    })
    .catch((err) => console.error(`[${table}] Tạo quy chuẩn nhận xét lỗi (#${id}): ${err.message}`));
}

// Chuẩn hóa parts_config nhận từ form (chuỗi JSON) → chuỗi JSON để lưu, hoặc null.
function sanitizePartsConfig(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  ['multiple_choice', 'true_false', 'short_answer'].forEach((k) => {
    const p = obj[k];
    if (p && p.enabled) {
      const count = Math.max(0, parseInt(p.count) || 0);
      const answers = Array.isArray(p.answers) ? p.answers.slice(0, count) : [];
      const def = DEFAULT_POINTS[k] ?? 0;
      const points = [];
      const rawPts = Array.isArray(p.points) ? p.points : [];
      for (let i = 0; i < count; i++) points.push(typeof rawPts[i] === 'number' && rawPts[i] >= 0 ? rawPts[i] : def);
      out[k] = { enabled: true, count, answers, points };
      // Cách chia điểm phần Đúng/Sai khi đúng một phần ('thpt' theo bậc, 'even' chia đều mỗi ý)
      if (k === 'true_false') out[k].tfMode = p.tfMode === 'even' ? 'even' : 'thpt';
      // Ghi chú cách điền cho học sinh (chủ yếu phần Trả lời ngắn)
      if (k === 'short_answer') {
        const rawNotes = Array.isArray(p.notes) ? p.notes : [];
        const notes = [];
        for (let i = 0; i < count; i++) notes.push(String(rawNotes[i] == null ? '' : rawNotes[i]));
        out[k].notes = notes;
      }
    }
  });
  if (obj.essay && obj.essay.enabled) {
    const ep = Number(obj.essay.points);
    out.essay = { enabled: true, points: isFinite(ep) && ep >= 0 ? ep : 3 };
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// Chuẩn hóa hsa_config nhận từ form (chuỗi JSON) → chuỗi JSON để lưu, hoặc null.
// Mỗi câu: { kind: 'multiple_choice'|'short_answer', answer, note? } — luôn 1 điểm/câu.
function sanitizeHsaConfig(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.questions)) return null;
  const count = Math.max(0, Math.min(50, obj.questions.length));
  const questions = [];
  for (let i = 0; i < count; i++) {
    const q = obj.questions[i] || {};
    const kind = q.kind === 'short_answer' ? 'short_answer' : 'multiple_choice';
    questions.push({
      kind,
      answer: typeof q.answer === 'string' ? q.answer : '',
      note: kind === 'short_answer' ? String(q.note == null ? '' : q.note) : '',
    });
  }
  return questions.length ? JSON.stringify({ questions }) : null;
}

// Thời gian làm bài tối đa (phút): số nguyên dương, để trống/0 = không giới hạn
function sanitizeTimeLimit(raw) {
  const n = parseInt(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Tên gốc của file upload (multer đọc tên UTF-8 thành latin1 → đổi lại cho đúng tiếng Việt)
function originalName(f) {
  if (!f) return null;
  try { return Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch { return f.originalname; }
}

module.exports = { scheduleRubricGeneration, sanitizePartsConfig, sanitizeHsaConfig, sanitizeTimeLimit, originalName };
