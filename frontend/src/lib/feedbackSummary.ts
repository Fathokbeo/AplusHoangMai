import { parsePartsConfig } from './homeworkParts';

// Nhận xét CHUẨN FORM, ngắn gọn cho file Excel bảng điểm (giáo viên gửi phụ huynh/lưu sổ).
// Chỉ nhận xét phần TỰ LUẬN: làm đủ & đúng → "Có làm, trình bày đầy đủ."; còn lại chỉ nêu câu nào
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

export function summarizeEssayFeedback(s: any, hw: { parts_config?: any; exam_type?: string }): string {
  if (!s.submission_id) return 'Không nộp bài.';
  if (hw.exam_type === 'hsa') return 'Đã nộp bài.'; // HSA không có tự luận
  const cfg = parsePartsConfig(hw.parts_config);
  const essayOn = cfg ? cfg.essay.enabled : true; // bài cũ không cấu hình phần = toàn bộ là tự luận
  if (!essayOn) return 'Đã nộp bài.';

  const score = s.score ?? s.best_score;
  const all = parseDetails(s.grading_details);
  const essay = all.filter((d) => {
    const q = String(d.question || '');
    return cfg ? /tự\s*luận/i.test(q) : !OBJECTIVE_RE.test(q);
  });

  if (essay.length === 0) {
    const hasFiles = !!(s.files || s.file_path);
    if (!hasFiles) return 'Tự luận: Không nộp bài làm.';
    return score === null || score === undefined ? 'Đã nộp, chưa chấm.' : 'Tự luận: Có làm.';
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

  if (missing.length === 0 && wrong.length === 0) return 'Tự luận: Có làm, trình bày đầy đủ.';
  const parts: string[] = [];
  if (missing.length) parts.push(`làm thiếu câu ${joinLabels(missing)}`);
  if (wrong.length) parts.push(`sai câu ${joinLabels(wrong)}`);
  const text = parts.join('; ');
  return `Tự luận: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
