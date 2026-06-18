// Tiện ích cho 4 kiểu nộp bài: trắc nghiệm, đúng/sai, trả lời ngắn, tự luận.
// Dùng chung giữa giao diện tạo bài (giáo viên) và làm bài (học sinh).

export type PartKey = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

// Thứ tự cố định khi hiển thị làm bài: Trắc nghiệm → Đúng/Sai → Trả lời ngắn → Tự luận
export const PART_ORDER: PartKey[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];

export const PART_LABELS: Record<PartKey, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};

// Lựa chọn cho 1 câu trắc nghiệm
export const MC_OPTIONS = ['A', 'B', 'C', 'D'] as const;
// Nhãn 4 ý trong 1 câu đúng/sai
export const TF_SUB_LABELS = ['a', 'b', 'c', 'd'] as const;

// Một phần objective (TN / ĐS / TLN). answers kiểu khác nhau tùy phần.
export interface PartConfig {
  enabled: boolean;
  count: number;
  answers: any[];   // MC: string[] ('A'..'D'); TF: string[][] ('T'|'F' x4); SA: string[]
  points: number[]; // MC/SA: điểm mỗi câu; TF: điểm tối đa mỗi câu (4 ý đúng = điểm này)
}

export interface PartsConfig {
  multiple_choice: PartConfig;
  true_false: PartConfig;
  short_answer: PartConfig;
  essay: { enabled: boolean; points: number };
}

// Điểm mặc định mỗi câu theo từng phần (yêu cầu: TN 0.25, ĐS 1.0/câu, TLN 0.5)
export const DEFAULT_POINTS: Record<string, number> = { multiple_choice: 0.25, true_false: 1, short_answer: 0.5 };
export const DEFAULT_ESSAY_POINTS = 4;
// Tỉ lệ điểm Đúng/Sai theo số ý đúng (chuẩn THPT): 0,1,2,3,4 ý → 0, 0.1, 0.25, 0.5, 1.0 × điểm câu
export const TF_LADDER = [0, 0.1, 0.25, 0.5, 1.0];

export function emptyPartsConfig(): PartsConfig {
  return {
    multiple_choice: { enabled: false, count: 0, answers: [], points: [] },
    true_false: { enabled: false, count: 0, answers: [], points: [] },
    short_answer: { enabled: false, count: 0, answers: [], points: [] },
    essay: { enabled: false, points: DEFAULT_ESSAY_POINTS },
  };
}

// Giá trị mặc định cho 1 đáp án mới theo từng phần
function defaultAnswer(part: PartKey): any {
  if (part === 'multiple_choice') return 'A';
  if (part === 'true_false') return ['T', 'T', 'T', 'T'];
  return ''; // short_answer
}

// Cắt/đệm mảng answers cho khớp số câu (count) khi giáo viên đổi số lượng.
export function resizeAnswers(part: PartKey, answers: any[], count: number): any[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const next = (answers || []).slice(0, n);
  while (next.length < n) next.push(defaultAnswer(part));
  return next;
}

// Cắt/đệm mảng điểm cho khớp số câu; giá trị thiếu/không hợp lệ dùng điểm mặc định của phần.
export function resizePoints(part: PartKey, points: any[], count: number): number[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const def = DEFAULT_POINTS[part] ?? 0;
  const next = (points || []).slice(0, n).map((v) => (typeof v === 'number' && v >= 0 ? v : def));
  while (next.length < n) next.push(def);
  return next;
}

// Chuẩn hóa parts_config nhận từ server (có thể null / chuỗi JSON / thiếu trường) về dạng đầy đủ.
export function normalizePartsConfig(raw: any): PartsConfig {
  const base = emptyPartsConfig();
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return base; }
  }
  if (!raw || typeof raw !== 'object') return base;
  (['multiple_choice', 'true_false', 'short_answer'] as PartKey[]).forEach((k) => {
    const p = raw[k];
    if (p && p.enabled) {
      const count = Math.max(0, Math.floor(p.count) || 0);
      (base as any)[k] = {
        enabled: true,
        count,
        answers: resizeAnswers(k, Array.isArray(p.answers) ? p.answers : [], count),
        points: resizePoints(k, Array.isArray(p.points) ? p.points : [], count),
      };
    }
  });
  if (raw.essay && raw.essay.enabled) {
    const pts = Number(raw.essay.points);
    base.essay = { enabled: true, points: isFinite(pts) && pts >= 0 ? pts : DEFAULT_ESSAY_POINTS };
  }
  return base;
}

// Tổng điểm tối đa của một phần objective
export function partTotalPoints(cfg: PartsConfig, key: PartKey): number {
  const p = (cfg as any)[key] as PartConfig;
  if (!p || !p.enabled) return 0;
  return (p.points || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

// Tổng điểm tối đa của cả bài (TN + ĐS + TLN + tự luận)
export function computeMaxScore(cfg: PartsConfig | null): number {
  if (!cfg) return 0;
  let total = 0;
  (['multiple_choice', 'true_false', 'short_answer'] as PartKey[]).forEach((k) => { total += partTotalPoints(cfg, k); });
  if (cfg.essay.enabled) total += Number(cfg.essay.points) || 0;
  return Math.round(total * 100) / 100;
}

// Có bật phần nào không (kể cả tự luận)
export function anyPartEnabled(cfg: PartsConfig | null): boolean {
  return !!cfg && (cfg.multiple_choice.enabled || cfg.true_false.enabled || cfg.short_answer.enabled || cfg.essay.enabled);
}

// Parse parts_config từ chuỗi JSON (server trả) hoặc object; trả null nếu không hợp lệ/không có phần nào.
export function parsePartsConfig(raw: any): PartsConfig | null {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  const cfg = normalizePartsConfig(obj);
  if (!cfg.multiple_choice.enabled && !cfg.true_false.enabled && !cfg.short_answer.enabled && !cfg.essay.enabled) return null;
  return cfg;
}

export function hasObjectiveParts(cfg: PartsConfig | null): boolean {
  return !!cfg && (cfg.multiple_choice.enabled || cfg.true_false.enabled || cfg.short_answer.enabled);
}

export function hasEssay(cfg: PartsConfig | null): boolean {
  return !!cfg && cfg.essay.enabled;
}

// Tạo state đáp án rỗng cho học sinh điền, dựa trên cấu hình bài.
export function emptyStudentAnswers(cfg: PartsConfig | null) {
  return {
    multiple_choice: cfg?.multiple_choice.enabled ? Array(cfg.multiple_choice.count).fill('') : [],
    true_false: cfg?.true_false.enabled ? Array.from({ length: cfg.true_false.count }, () => ['', '', '', '']) : [],
    short_answer: cfg?.short_answer.enabled ? Array(cfg.short_answer.count).fill('') : [],
  };
}
