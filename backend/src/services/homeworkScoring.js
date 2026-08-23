// Chấm điểm tự động (deterministic) cho các phần khách quan: trắc nghiệm, đúng/sai, trả lời ngắn.
// Phần tự luận do AI chấm (xem aiGrading.js). Tệp này KHÔNG gọi AI.
const { parsePartsConfig, partEnabled, keyIsSet, parseHsaConfig, hsaKeyIsSet } = require('./homeworkParts');

// Cách chia điểm phần Đúng/Sai theo số ý đúng (TỈ LỆ trên điểm câu):
//   'thpt' (chuẩn THPT): 0,1,2,3,4 ý → 0, 0.1, 0.25, 0.5, 1.0
//   'even' (chia đều):   mỗi ý đúng = 25% điểm câu → 0, 0.25, 0.5, 0.75, 1.0
const TF_LADDER = [0, 0.1, 0.25, 0.5, 1.0];
const TF_LADDER_EVEN = [0, 0.25, 0.5, 0.75, 1.0];
// Mảng tỉ lệ điểm Đúng/Sai theo cách chia điểm giáo viên chọn (mặc định 'thpt').
function tfLadder(cfg) {
  const mode = cfg && cfg.true_false && cfg.true_false.tfMode;
  return mode === 'even' ? TF_LADDER_EVEN : TF_LADDER;
}
const DEFAULT_POINTS = { multiple_choice: 0.25, true_false: 1, short_answer: 0.5 };
const DEFAULT_ESSAY_POINTS = 4;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mảng điểm của 1 phần objective, khớp số câu; thiếu/không hợp lệ → điểm mặc định của phần.
function partPoints(cfg, key) {
  const p = cfg[key] || {};
  const n = Array.isArray(p.answers) ? p.answers.length : (parseInt(p.count) || 0);
  const pts = Array.isArray(p.points) ? p.points : [];
  const def = DEFAULT_POINTS[key] ?? 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(typeof pts[i] === 'number' && pts[i] >= 0 ? pts[i] : def);
  return out;
}

function essayPoints(cfg) {
  if (!partEnabled(cfg, 'essay')) return 0;
  const v = Number(cfg.essay.points);
  return isFinite(v) && v >= 0 ? v : DEFAULT_ESSAY_POINTS;
}

// Tổng điểm tối đa của 1 phần
function partMax(cfg, key) {
  if (key === 'essay') return essayPoints(cfg);
  if (!partEnabled(cfg, key)) return 0;
  return round2(partPoints(cfg, key).reduce((a, b) => a + b, 0));
}

// Tổng điểm tối đa của cả bài (= thang điểm)
function computeMaxScore(raw) {
  const cfg = parsePartsConfig(raw);
  if (!cfg) return null;
  let total = 0;
  ['multiple_choice', 'true_false', 'short_answer', 'essay'].forEach((k) => { total += partMax(cfg, k); });
  return round2(total);
}

// ── Khớp đáp án trả lời ngắn (linh hoạt) ────────────────────────────────
// Chuẩn hóa: bỏ khoảng trắng, hạ chữ thường, đổi dấu phẩy thập phân thành chấm.
function normSA(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
}
// Quy về số nếu có thể (kể cả phân số a/b) để so sánh tương đương: "1/2"="0.5", "2"="2.0".
function saNumeric(s) {
  const t = normSA(s);
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = t.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
  if (m) { const d = parseFloat(m[2]); if (d !== 0) return parseFloat(m[1]) / d; }
  return null;
}
function saMatch(stud, key) {
  const ks = normSA(key);
  if (ks === '') return false; // không có đáp án thì không tự chấm đúng
  if (normSA(stud) === ks) return true;
  const a = saNumeric(stud), b = saNumeric(key);
  if (a !== null && b !== null) return Math.abs(a - b) < 1e-9;
  return false;
}

const up1 = (v) => String(v == null ? '' : v).trim().toUpperCase().charAt(0);

// Một phần objective có dữ liệu học sinh điền hay không
function partAnswered(arr, kind) {
  if (!Array.isArray(arr)) return false;
  if (kind === 'true_false') return arr.some((r) => Array.isArray(r) && r.some((v) => v));
  return arr.some((v) => String(v == null ? '' : v).trim() !== '');
}

// Chấm các phần objective dựa trên đáp án (key) + bài làm có cấu trúc của học sinh.
// Trả về: { score, details[], gradedParts{set}, pendingAi[] (phần bật nhưng HS chưa điền) }
// Detail báo "chưa có đáp án" (câu để trống mà cũng không đọc được từ file đáp án).
function unresolvedDetail(label, i) {
  return { question: `${label} câu ${i + 1}`, status: 'partial', comment: 'Chưa có đáp án để chấm — cần giáo viên kiểm tra' };
}

// Số câu của một phần đã có đáp án (key) sẵn
function setKeyCount(key, arr) {
  return (Array.isArray(arr) ? arr : []).filter((v) => keyIsSet(key, v)).length;
}

function scoreStructured(rawCfg, rawAns) {
  const cfg = parsePartsConfig(rawCfg);
  // pendingAi: HS không điền giao diện (AI dò ảnh). aiKeyless: HS có điền nhưng cả phần CHƯA có đáp án (AI đọc file đáp án + đáp án HS điền).
  // partStats: thống kê đúng/sai từng câu mỗi phần (để tạo nhận xét khái quát KHÔNG dùng AI, xem composeAutoFeedback).
  const result = { score: 0, details: [], gradedParts: {}, pendingAi: [], aiKeyless: [], unresolved: [], partStats: {} };
  if (!cfg) return result;

  let ans = rawAns;
  if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch { ans = null; } }
  ans = ans && typeof ans === 'object' ? ans : {};

  // Trắc nghiệm
  if (partEnabled(cfg, 'multiple_choice')) {
    const key = cfg.multiple_choice.answers || [];
    const pts = partPoints(cfg, 'multiple_choice');
    const stud = ans.multiple_choice;
    if (!partAnswered(stud, 'multiple_choice')) { result.pendingAi.push('multiple_choice'); }
    else if (setKeyCount('multiple_choice', key) === 0) { result.aiKeyless.push('multiple_choice'); }
    else {
      result.gradedParts.multiple_choice = true;
      const stat = { total: 0, correct: 0, wrongIdx: [] };
      key.forEach((k, i) => {
        if (!keyIsSet('multiple_choice', k)) { result.unresolved.push(['multiple_choice', i]); result.details.push(unresolvedDetail('Trắc nghiệm', i)); return; }
        stat.total++;
        const got = up1(stud[i]);
        const ok = got !== '' && got === up1(k);
        if (ok) { result.score += pts[i]; stat.correct++; } else { stat.wrongIdx.push(i); }
        result.details.push({
          question: `Trắc nghiệm câu ${i + 1}`,
          status: ok ? 'correct' : 'wrong',
          comment: ok ? `Đúng (+${round2(pts[i])}đ)` : `Chọn ${up1(stud[i]) || '—'}, đáp án đúng ${String(k).toUpperCase()}`,
        });
      });
      result.partStats.multiple_choice = stat;
    }
  }

  // Đúng / Sai
  if (partEnabled(cfg, 'true_false')) {
    const key = cfg.true_false.answers || [];
    const pts = partPoints(cfg, 'true_false');
    const stud = ans.true_false;
    if (!partAnswered(stud, 'true_false')) { result.pendingAi.push('true_false'); }
    else if (setKeyCount('true_false', key) === 0) { result.aiKeyless.push('true_false'); }
    else {
      result.gradedParts.true_false = true;
      const ladder = tfLadder(cfg);
      // wrongSub: tổng số Ý (a,b,c,d) sai TRÊN CẢ PHẦN — dùng để quyết định có nhắc "Đúng/Sai" trong
      // nhận xét khái quát hay không (xem composeAutoFeedback), khác wrongIdx (đếm theo CÂU).
      const stat = { total: 0, correct: 0, wrongIdx: [], wrongSub: 0 };
      key.forEach((krow, i) => {
        if (!keyIsSet('true_false', krow)) { result.unresolved.push(['true_false', i]); result.details.push(unresolvedDetail('Đúng/Sai', i)); return; }
        stat.total++;
        const srow = Array.isArray(stud[i]) ? stud[i] : [];
        const k = Array.isArray(krow) ? krow : [];
        let correct = 0;
        const subTxt = [];
        for (let j = 0; j < 4; j++) {
          const kk = up1(k[j]);
          const sv = up1(srow[j]);
          const ok = sv !== '' && sv === kk;
          if (ok) correct++;
          subTxt.push(`${'abcd'[j]}:${sv === 'T' ? 'Đ' : sv === 'F' ? 'S' : '—'}${ok ? '✓' : '✗'}`);
        }
        const earned = round2((pts[i] || 0) * ladder[correct]);
        result.score += earned;
        stat.wrongSub += 4 - correct;
        if (correct === 4) stat.correct++; else stat.wrongIdx.push(i);
        const status = correct === 4 ? 'correct' : correct === 0 ? 'wrong' : 'partial';
        result.details.push({
          question: `Đúng/Sai câu ${i + 1}`,
          status,
          comment: `Đúng ${correct}/4 ý (+${earned}đ) — ${subTxt.join(' ')}`,
        });
      });
      result.partStats.true_false = stat;
    }
  }

  // Trả lời ngắn
  if (partEnabled(cfg, 'short_answer')) {
    const key = cfg.short_answer.answers || [];
    const pts = partPoints(cfg, 'short_answer');
    const stud = ans.short_answer;
    if (!partAnswered(stud, 'short_answer')) { result.pendingAi.push('short_answer'); }
    else if (setKeyCount('short_answer', key) === 0) { result.aiKeyless.push('short_answer'); }
    else {
      result.gradedParts.short_answer = true;
      const stat = { total: 0, correct: 0, wrongIdx: [] };
      key.forEach((k, i) => {
        if (!keyIsSet('short_answer', k)) { result.unresolved.push(['short_answer', i]); result.details.push(unresolvedDetail('Trả lời ngắn', i)); return; }
        stat.total++;
        const got = stud[i];
        const ok = saMatch(got, k);
        if (ok) { result.score += pts[i]; stat.correct++; } else { stat.wrongIdx.push(i); }
        result.details.push({
          question: `Trả lời ngắn câu ${i + 1}`,
          status: ok ? 'correct' : 'wrong',
          comment: ok ? `Đúng (+${round2(pts[i])}đ)` : `Trả lời "${String(got == null ? '' : got).trim() || '—'}", đáp án "${k}"`,
        });
      });
      result.partStats.short_answer = stat;
    }
  }

  result.score = round2(result.score);
  return result;
}

// Chấm bài kiểu HSA: mỗi câu tự chọn Trắc nghiệm hoặc Trả lời ngắn, luôn 1 điểm/câu, cộng dồn thành
// điểm cuối (KHÔNG quy đổi thang 10). Câu chưa có đáp án (giáo viên chưa nhập) → 'partial', không cộng
// điểm, cần giáo viên kiểm tra (không có đường AI đọc file đáp án như THPT).
function scoreHsa(rawCfg, rawAns) {
  const cfg = parseHsaConfig(rawCfg);
  const result = { score: 0, details: [] };
  if (!cfg) return result;

  let ans = rawAns;
  if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch { ans = null; } }
  const list = ans && Array.isArray(ans.hsa) ? ans.hsa : [];

  cfg.questions.forEach((q, i) => {
    const kindTxt = q.kind === 'multiple_choice' ? 'TN' : 'TLN';
    if (!hsaKeyIsSet(q)) {
      result.details.push({ question: `Câu ${i + 1} (${kindTxt})`, status: 'partial', comment: 'Chưa có đáp án để chấm — cần giáo viên kiểm tra' });
      return;
    }
    const got = list[i];
    const ok = q.kind === 'multiple_choice' ? (up1(got) !== '' && up1(got) === up1(q.answer)) : saMatch(got, q.answer);
    if (ok) result.score += 1;
    result.details.push({
      question: `Câu ${i + 1} (${kindTxt})`,
      status: ok ? 'correct' : 'wrong',
      comment: ok ? 'Đúng (+1đ)' : (q.kind === 'multiple_choice'
        ? `Chọn ${up1(got) || '—'}, đáp án đúng ${String(q.answer).toUpperCase()}`
        : `Trả lời "${String(got == null ? '' : got).trim() || '—'}", đáp án "${q.answer}"`),
    });
  });

  result.score = round2(result.score);
  return result;
}

// Tổng điểm THÔ (sum tất cả các câu + tự luận) của một cfg đã parse.
function rawMaxScore(cfg) {
  if (!cfg) return 0;
  return round2(['multiple_choice', 'true_false', 'short_answer', 'essay'].reduce((s, k) => s + partMax(cfg, k), 0));
}

// Quy đổi điểm thô về thang giáo viên chọn: final = rawEarned / rawMax × scale.
function scaleToTarget(rawEarned, rawMax, scale) {
  const s = Number(scale);
  if (!isFinite(s) || s <= 0 || !(rawMax > 0)) return round2(rawEarned);
  return round2((Number(rawEarned) || 0) * s / rawMax);
}

const PART_LABEL_TXT = { multiple_choice: 'Trắc nghiệm', true_false: 'Đúng/Sai', short_answer: 'Trả lời ngắn' };

// Nhận xét khái quát cho phần khách quan (trắc nghiệm/đúng-sai/trả lời ngắn) — KHÔNG dùng AI ở đây,
// chọn theo MẪU + thang điểm (quy đổi thang 10), theo đúng yêu cầu giáo viên:
//   >=9đ: khen, không liệt kê lỗi.
//   >=8đ / >=7đ: khen có điều kiện — liệt kê phần còn sai (nếu đạt ngưỡng) + nhắc chủ đề bài.
//   >=5đ: nhắc chung cả 3 phần + luyện tập thêm.
//   <5đ: nhắc học lại + luyện tập thêm.
// Ngưỡng liệt kê 1 phần vào câu nhận xét: Trắc nghiệm sai ≥2 câu; Đúng/Sai sai ≥2 Ý (không phải câu);
// Trả lời ngắn sai ≥1 câu.
// pct10: điểm phần khách quan quy đổi thang 10 (điểm thô / điểm tối đa phần khách quan × 10).
// partStats: xem scoreStructured. topic: rubric.overview do AI soạn sẵn ĐÚNG 1 LẦN khi tạo/cập nhật
// đáp án (xem aiGrading.generateFeedbackRubric + routes/homework.js) — có thể null nếu chưa có/lỗi.
function composeAutoFeedback(pct10, partStats, topic) {
  const topicTxt = topic || 'các dạng bài trong bài tập này';
  const mc = partStats && partStats.multiple_choice;
  const tf = partStats && partStats.true_false;
  const sa = partStats && partStats.short_answer;
  const wrongParts = [];
  if (mc && mc.wrongIdx.length >= 2) wrongParts.push(PART_LABEL_TXT.multiple_choice);
  if (tf && (tf.wrongSub || 0) >= 2) wrongParts.push(PART_LABEL_TXT.true_false);
  if (sa && sa.wrongIdx.length >= 1) wrongParts.push(PART_LABEL_TXT.short_answer);

  if (pct10 >= 9) return 'Con làm bài tốt, cố gắng phát huy.';
  if (pct10 >= 8) {
    return wrongParts.length
      ? `Con làm bài khá tốt tuy nhiên còn sai phần ${wrongParts.join(', ')} và cẩn thận hơn khi làm các dạng bài về ${topicTxt}.`
      : 'Con làm bài khá tốt, cố gắng phát huy hơn nữa.';
  }
  if (pct10 >= 7) {
    return wrongParts.length
      ? `Con làm bài khá ổn tuy nhiên còn sai phần ${wrongParts.join(', ')} và cẩn thận hơn khi làm các dạng bài về ${topicTxt}.`
      : 'Con làm bài khá ổn, cố gắng phát huy hơn nữa.';
  }
  if (pct10 >= 5) {
    return `Con đã nắm được kiến thức tuy nhiên còn nhiều sai sót, cần cẩn thận hơn khi làm Trắc nghiệm, Đúng/Sai, Trả lời ngắn và luyện tập thêm các bài tập về ${topicTxt}.`;
  }
  return `Con còn sai sót nhiều khi làm bài tập, cần chú ý học lại và luyện tập thêm các bài toán về ${topicTxt}.`;
}

module.exports = {
  TF_LADDER,
  TF_LADDER_EVEN,
  tfLadder,
  DEFAULT_POINTS,
  round2,
  partPoints,
  essayPoints,
  partMax,
  computeMaxScore,
  rawMaxScore,
  scaleToTarget,
  saMatch,
  scoreStructured,
  scoreHsa,
  composeAutoFeedback,
};
