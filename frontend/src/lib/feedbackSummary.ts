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
