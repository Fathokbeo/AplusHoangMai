// Tiện ích server cho 4 kiểu nộp bài (trắc nghiệm, đúng/sai, trả lời ngắn, tự luận).
// Dùng chung bởi route homework, hàng đợi chấm và AI.

const PART_LABELS = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};
const TF_SUB = ['a', 'b', 'c', 'd'];

// Parse parts_config (chuỗi JSON hoặc object) → object, hoặc null nếu rỗng/không hợp lệ.
function parsePartsConfig(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  return obj;
}

function partEnabled(cfg, key) {
  return !!(cfg && cfg[key] && cfg[key].enabled);
}

// Bài có ít nhất một phần objective (TN/ĐS/TLN) đã bật và có đáp án → AI có thể chấm.
function hasAnswerKey(raw) {
  const cfg = parsePartsConfig(raw);
  if (!cfg) return false;
  return ['multiple_choice', 'true_false', 'short_answer'].some(
    (k) => partEnabled(cfg, k) && Array.isArray(cfg[k].answers) && cfg[k].answers.length > 0
  );
}

// Bài cần học sinh chấm AI (có đáp án objective hoặc có file đáp án tự luận).
function needsAiGrading(homework) {
  return !!homework.answer_file || hasAnswerKey(homework.parts_config);
}

// Loại bỏ đáp án (key) khỏi parts_config trước khi gửi cho học sinh — chỉ giữ enabled + count.
function stripAnswers(raw) {
  const cfg = parsePartsConfig(raw);
  if (!cfg) return null;
  const out = {};
  ['multiple_choice', 'true_false', 'short_answer'].forEach((k) => {
    if (partEnabled(cfg, k)) out[k] = { enabled: true, count: Math.max(0, parseInt(cfg[k].count) || 0) };
  });
  if (partEnabled(cfg, 'essay')) out.essay = { enabled: true };
  return Object.keys(out).length ? out : null;
}

// Diễn giải đáp án (key) của các phần objective thành text cho prompt AI.
// only (tùy chọn): { multiple_choice, true_false, short_answer } — chỉ mô tả phần được chọn.
function describeAnswerKey(cfg, only) {
  const want = (k) => partEnabled(cfg, k) && (!only || only[k]);
  const lines = [];
  if (want('multiple_choice')) {
    const a = cfg.multiple_choice.answers || [];
    lines.push(`• TRẮC NGHIỆM (${a.length} câu) — đáp án đúng: ${a.map((v, i) => `Câu ${i + 1}: ${v}`).join('; ')}`);
  }
  if (want('true_false')) {
    const a = cfg.true_false.answers || [];
    const conv = (v) => (String(v).toUpperCase().startsWith('T') ? 'Đúng' : 'Sai');
    lines.push('• ĐÚNG/SAI (' + a.length + ' câu) — đáp án đúng từng ý:');
    a.forEach((row, i) => {
      const parts = (Array.isArray(row) ? row : []).map((v, j) => `${TF_SUB[j]}) ${conv(v)}`).join(', ');
      lines.push(`   Câu ${i + 1}: ${parts}`);
    });
  }
  if (want('short_answer')) {
    const a = cfg.short_answer.answers || [];
    lines.push(`• TRẢ LỜI NGẮN (${a.length} câu) — đáp án đúng: ${a.map((v, i) => `Câu ${i + 1}: "${v}"`).join('; ')}`);
  }
  return lines.join('\n');
}

// Diễn giải bài làm có cấu trúc của học sinh thành text cho prompt AI.
function describeStudentAnswers(cfg, raw) {
  const ans = parsePartsConfig(raw);
  if (!ans) return '';
  const lines = [];
  if (partEnabled(cfg, 'multiple_choice') && Array.isArray(ans.multiple_choice)) {
    lines.push(`• TRẮC NGHIỆM: ${ans.multiple_choice.map((v, i) => `Câu ${i + 1}: ${v || '(bỏ trống)'}`).join('; ')}`);
  }
  if (partEnabled(cfg, 'true_false') && Array.isArray(ans.true_false)) {
    const conv = (v) => (v ? (String(v).toUpperCase().startsWith('T') ? 'Đúng' : 'Sai') : '(bỏ trống)');
    lines.push('• ĐÚNG/SAI:');
    ans.true_false.forEach((row, i) => {
      const parts = (Array.isArray(row) ? row : []).map((v, j) => `${TF_SUB[j]}) ${conv(v)}`).join(', ');
      lines.push(`   Câu ${i + 1}: ${parts}`);
    });
  }
  if (partEnabled(cfg, 'short_answer') && Array.isArray(ans.short_answer)) {
    lines.push(`• TRẢ LỜI NGẮN: ${ans.short_answer.map((v, i) => `Câu ${i + 1}: "${v || '(bỏ trống)'}"`).join('; ')}`);
  }
  return lines.join('\n');
}

module.exports = {
  PART_LABELS,
  parsePartsConfig,
  partEnabled,
  hasAnswerKey,
  needsAiGrading,
  stripAnswers,
  describeAnswerKey,
  describeStudentAnswers,
};
