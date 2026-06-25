// Chấm điểm tự động (deterministic) cho các phần khách quan: trắc nghiệm, đúng/sai, trả lời ngắn.
// Phần tự luận do AI chấm (xem aiGrading.js). Tệp này KHÔNG gọi AI.
const { parsePartsConfig, partEnabled, keyIsSet } = require('./homeworkParts');

// Tỉ lệ điểm Đúng/Sai theo số ý đúng (chuẩn THPT): 0,1,2,3,4 ý → 0, 0.1, 0.25, 0.5, 1.0 × điểm câu
const TF_LADDER = [0, 0.1, 0.25, 0.5, 1.0];
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
  const result = { score: 0, details: [], gradedParts: {}, pendingAi: [], aiKeyless: [], unresolved: [] };
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
      key.forEach((k, i) => {
        if (!keyIsSet('multiple_choice', k)) { result.unresolved.push(['multiple_choice', i]); result.details.push(unresolvedDetail('Trắc nghiệm', i)); return; }
        const got = up1(stud[i]);
        const ok = got !== '' && got === up1(k);
        if (ok) result.score += pts[i];
        result.details.push({
          question: `Trắc nghiệm câu ${i + 1}`,
          status: ok ? 'correct' : 'wrong',
          comment: ok ? `Đúng (+${round2(pts[i])}đ)` : `Chọn ${up1(stud[i]) || '—'}, đáp án đúng ${String(k).toUpperCase()}`,
        });
      });
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
      key.forEach((krow, i) => {
        if (!keyIsSet('true_false', krow)) { result.unresolved.push(['true_false', i]); result.details.push(unresolvedDetail('Đúng/Sai', i)); return; }
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
        const earned = round2((pts[i] || 0) * TF_LADDER[correct]);
        result.score += earned;
        const status = correct === 4 ? 'correct' : correct === 0 ? 'wrong' : 'partial';
        result.details.push({
          question: `Đúng/Sai câu ${i + 1}`,
          status,
          comment: `Đúng ${correct}/4 ý (+${earned}đ) — ${subTxt.join(' ')}`,
        });
      });
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
      key.forEach((k, i) => {
        if (!keyIsSet('short_answer', k)) { result.unresolved.push(['short_answer', i]); result.details.push(unresolvedDetail('Trả lời ngắn', i)); return; }
        const got = stud[i];
        const ok = saMatch(got, k);
        if (ok) result.score += pts[i];
        result.details.push({
          question: `Trả lời ngắn câu ${i + 1}`,
          status: ok ? 'correct' : 'wrong',
          comment: ok ? `Đúng (+${round2(pts[i])}đ)` : `Trả lời "${String(got == null ? '' : got).trim() || '—'}", đáp án "${k}"`,
        });
      });
    }
  }

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

module.exports = {
  TF_LADDER,
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
};
