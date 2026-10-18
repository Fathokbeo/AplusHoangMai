import { parsePartsConfig } from './homeworkParts';

// Cột "Nhận xét tự luận" trong file Excel bảng điểm (bổ sung cạnh cột "Nhận xét" cũ, không thay nó).
// Chuẩn form, ngắn gọn: làm đủ & đúng → "Có làm, trình bày đầy đủ."; còn lại chỉ nêu câu nào
// làm thiếu / sai, KHÔNG nêu chi tiết lỗi. Nhận xét chi tiết học sinh thấy trên web giữ nguyên.

type Detail = { question?: string; status?: string; comment?: string };

const OBJECTIVE_RE = /^(trắc nghiệm|đúng\/sai|trả lời ngắn)\b/i;
const NOT_DONE_RE = /không làm|chưa làm|bỏ trống|để trống|bỏ qua|không có (bài|lời giải)|không thấy (bài|lời giải)|không trình bày/i;
const WRONG_RE = /\bsai\b|nhầm|không đúng|không chính xác/i;

function parseDetails(raw: any): Detail[] {
  if (!raw) return [];
  try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : []; } catch { return []; }
}

// "Tự luận câu 2a" → "2a"; không có số câu → giữ tên câu (bỏ chữ "Tự luận")
function questionLabel(q: string): string {
  const m = q.match(/câu\s*([0-9]+[a-zđ]?(?:\s*[.,]\s*[0-9a-z]+)*)/i);
  if (m) return m[1].replace(/\s+/g, '');
  return q.replace(/tự\s*luận/i, '').replace(/[:\-–]/g, ' ').trim() || q;
}

const joinLabels = (labels: string[]) => [...new Set(labels)].join(', ');

type HwLike = { parts_config?: any; exam_type?: string };

// Bài có phần tự luận không (HSA không có; bài cũ không cấu hình phần = toàn bộ là tự luận)
export function homeworkHasEssay(hw: HwLike): boolean {
  if (hw.exam_type === 'hsa') return false;
  const cfg = parsePartsConfig(hw.parts_config);
  return cfg ? cfg.essay.enabled : true;
}

export function summarizeEssayFeedback(s: any, hw: HwLike): string {
  if (!s.submission_id) return 'Không nộp bài.';
  if (!homeworkHasEssay(hw)) return '';
  const cfg = parsePartsConfig(hw.parts_config);

  const score = s.score ?? s.best_score;
  const all = parseDetails(s.grading_details);
  const essay = all.filter((d) => {
    const q = String(d.question || '');
    return cfg ? /tự\s*luận/i.test(q) : !OBJECTIVE_RE.test(q);
  });

  if (essay.length === 0) {
    const hasFiles = !!(s.files || s.file_path);
    if (!hasFiles) return 'Không nộp bài làm tự luận.';
    return score === null || score === undefined ? 'Chưa chấm.' : 'Có làm.';
  }

  const missing: string[] = [];
  const wrong: string[] = [];
  essay.forEach((d) => {
    if (d.status === 'correct') return;
    const label = questionLabel(String(d.question || ''));
    const comment = String(d.comment || '');
    if (NOT_DONE_RE.test(comment)) missing.push(label);
    else if (d.status === 'wrong' || WRONG_RE.test(comment)) wrong.push(label);
    else missing.push(label); // đúng một phần, trình bày chưa đủ
  });

  if (missing.length === 0 && wrong.length === 0) return 'Có làm, trình bày đầy đủ.';
  const parts: string[] = [];
  if (missing.length) parts.push(`làm thiếu câu ${joinLabels(missing)}`);
  if (wrong.length) parts.push(`sai câu ${joinLabels(wrong)}`);
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// ── Nhận xét từng học sinh cho khối "Nhận xét" ở trang chi tiết bài tập (giáo viên) ─────────────
// Gom các câu chưa đạt theo LOẠI LỖI (đọc từ lời giải thích AI/máy chấm của từng câu) thành 1 câu
// nhận xét ngắn kiểu: "Tính toán sai bài 2a, 2c; đọc đề chưa kĩ bài 3a; chưa làm được câu 4.2c."
// kèm nhãn lỗi TT/TB/ĐĐ/KT/KL.

export type ErrorTag = 'TT' | 'TB' | 'DD' | 'KT' | 'KL';

export const ERROR_TAGS: { key: ErrorTag; short: string; label: string }[] = [
  { key: 'TT', short: 'TT', label: 'tính toán' },
  { key: 'TB', short: 'TB', label: 'trình bày, lập luận' },
  { key: 'DD', short: 'ĐĐ', label: 'đọc đề' },
  { key: 'KT', short: 'KT', label: 'kiến thức' },
  { key: 'KL', short: 'KL', label: 'kết luận, kí hiệu' },
];

// Thứ tự dò: loại cụ thể trước, "trình bày" (hay đi kèm mọi lỗi) sau cùng
const TAG_RULES: { key: ErrorTag; re: RegExp; phrase: string }[] = [
  { key: 'DD', re: /đọc đề|hiểu sai đề|hiểu nhầm đề|nhầm đề|sai yêu cầu|không đúng yêu cầu|sót/i, phrase: 'đọc đề chưa kĩ bài' },
  { key: 'KT', re: /kiến thức|định lý|định lí|công thức|tính chất|áp dụng sai|sai bản chất|khái niệm/i, phrase: 'sai kiến thức bài' },
  { key: 'TT', re: /tính toán|tính sai|tính nhầm|sai số|sai dấu|nhầm dấu|biến đổi sai|sai phép|đáp số sai|kết quả sai/i, phrase: 'tính toán sai bài' },
  { key: 'KL', re: /kết luận|kí hiệu|ký hiệu|đơn vị/i, phrase: 'kết luận, kí hiệu chưa đúng bài' },
  { key: 'TB', re: /trình bày|lập luận|thiếu bước|thiếu lời giải|lời giải|hình vẽ|thiếu hình|chặt chẽ|căn cứ|sơ sài|giải thích/i, phrase: 'trình bày chưa tốt bài' },
];

const NO_KEY_RE = /chưa có đáp án/i;
const OBJ_PARTS: { re: RegExp; label: string }[] = [
  { re: /^trắc nghiệm/i, label: 'trắc nghiệm' },
  { re: /^đúng\/sai/i, label: 'Đúng/Sai' },
  { re: /^trả lời ngắn/i, label: 'trả lời ngắn' },
];

export type StudentReview =
  | { kind: 'missing' | 'not_yet' | 'pending'; text: string; tags: ErrorTag[] }
  | { kind: 'graded'; score: number; text: string; tags: ErrorTag[] };

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

export function buildStudentReview(s: any, hw: HwLike & { due_date?: string | null }): StudentReview {
  if (!s.submission_id) {
    const overdue = hw.due_date ? new Date() > new Date(hw.due_date) : false;
    return overdue
      ? { kind: 'missing', text: 'Chưa nộp bài — tính 0 điểm.', tags: [] }
      : { kind: 'not_yet', text: 'Chưa nộp bài.', tags: [] };
  }
  const score = s.score ?? s.best_score;
  if (score === null || score === undefined) {
    const grading = s.grading_status === 'pending' || s.grading_status === 'grading';
    return { kind: 'pending', text: grading ? 'Hệ thống đang chấm bài.' : 'Đã nộp, chưa chấm.', tags: [] };
  }

  const isHsa = hw.exam_type === 'hsa';
  const details = parseDetails(s.grading_details).filter((d) => d.status !== 'correct' && !NO_KEY_RE.test(String(d.comment || '')));
  const allDetails = parseDetails(s.grading_details);

  // Không có chi tiết từng câu (giáo viên chấm tay) → dùng nhận xét giáo viên đã ghi
  if (allDetails.length === 0) {
    return { kind: 'graded', score, text: String(s.feedback || '').trim() || 'Đã chấm.', tags: [] };
  }
  if (details.length === 0) return { kind: 'graded', score, text: 'Làm bài tốt, trình bày đầy đủ.', tags: [] };

  const byTag = new Map<ErrorTag, string[]>();
  const wrongPlain: string[] = [];
  const notDone: string[] = [];
  const objWrong = new Map<string, string[]>(); // phần khách quan → số câu sai
  const hsaWrong: string[] = [];

  details.forEach((d) => {
    const q = String(d.question || '');
    const comment = String(d.comment || '');
    if (isHsa) { hsaWrong.push(questionLabel(q)); return; }
    const obj = OBJ_PARTS.find((p) => p.re.test(q));
    if (obj) {
      const arr = objWrong.get(obj.label) || [];
      arr.push(questionLabel(q));
      objWrong.set(obj.label, arr);
      return;
    }
    const label = questionLabel(q);
    if (NOT_DONE_RE.test(comment)) { notDone.push(label); return; }
    const rule = TAG_RULES.find((r) => r.re.test(comment));
    if (rule) { byTag.set(rule.key, [...(byTag.get(rule.key) || []), label]); return; }
    if (d.status === 'partial') byTag.set('TB', [...(byTag.get('TB') || []), label]);
    else wrongPlain.push(label);
  });

  const clauses: string[] = [];
  const tags: ErrorTag[] = [];
  (['TT', 'TB', 'DD', 'KT', 'KL'] as ErrorTag[]).forEach((k) => {
    const labels = byTag.get(k);
    if (!labels) return;
    clauses.push(`${TAG_RULES.find((r) => r.key === k)!.phrase} ${joinLabels(labels)}`);
    tags.push(k);
  });
  if (wrongPlain.length) clauses.push(`làm sai bài ${joinLabels(wrongPlain)}`);
  objWrong.forEach((labels, part) => clauses.push(`sai ${part} câu ${joinLabels(labels)}`));
  if (hsaWrong.length) clauses.push(`sai câu ${joinLabels(hsaWrong)}`);
  if (notDone.length) clauses.push(`chưa làm được câu ${joinLabels(notDone)}`);

  return { kind: 'graded', score, text: `${cap(clauses.join('; '))}.`, tags };
}
