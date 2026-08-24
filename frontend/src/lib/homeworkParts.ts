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
// Đáp án "để trống" ('' với TN/TLN, '' từng ý với ĐS) nghĩa là: AI tự đọc từ File đáp án khi chấm.
export interface PartConfig {
  enabled: boolean;
  count: number;
  answers: any[];   // MC: string ('' | 'A'..'D'); TF: string[] ('' | 'T' | 'F' × 4); SA: string
  points: number[]; // điểm mỗi câu (hệ thống đặt tất cả bằng "điểm mỗi câu" của phần)
  notes?: string[]; // gợi ý cách điền cho từng câu (chủ yếu dùng cho Trả lời ngắn)
  tfMode?: TfMode;  // cách chia điểm phần Đúng/Sai (chỉ dùng cho true_false)
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

// Cách chia điểm phần Đúng/Sai theo số ý đúng (TỈ LỆ trên "điểm mỗi câu").
//   'thpt' (chuẩn THPT): 1 ý 10%, 2 ý 25%, 3 ý 50%, 4 ý 100% → với câu 1đ: 0.1/0.25/0.5/1.0
//   'even' (đều nhau):   mỗi ý đúng = 25% điểm câu          → với câu 1đ: 0.25/0.5/0.75/1.0
export type TfMode = 'thpt' | 'even';
export const TF_MODE_DEFAULT: TfMode = 'thpt';
// Tỉ lệ điểm Đúng/Sai theo số ý đúng (chuẩn THPT): 0,1,2,3,4 ý → 0, 0.1, 0.25, 0.5, 1.0 × điểm câu
export const TF_LADDER = [0, 0.1, 0.25, 0.5, 1.0];
// Tỉ lệ điểm Đúng/Sai khi chia đều: mỗi ý đúng = 25% điểm câu
export const TF_LADDER_EVEN = [0, 0.25, 0.5, 0.75, 1.0];

// Chuẩn hóa giá trị tfMode (mặc định 'thpt' để tương thích bài cũ).
export function tfModeOf(val: any): TfMode {
  return val === 'even' ? 'even' : 'thpt';
}
// Mảng tỉ lệ điểm tương ứng cách chia điểm đã chọn.
export function tfLadderOf(mode: any): number[] {
  return tfModeOf(mode) === 'even' ? TF_LADDER_EVEN : TF_LADDER;
}

export function emptyPartsConfig(): PartsConfig {
  return {
    multiple_choice: { enabled: false, count: 0, answers: [], points: [] },
    true_false: { enabled: false, count: 0, answers: [], points: [], tfMode: TF_MODE_DEFAULT },
    short_answer: { enabled: false, count: 0, answers: [], points: [], notes: [] },
    essay: { enabled: false, points: DEFAULT_ESSAY_POINTS },
  };
}

// Giá trị mặc định cho 1 đáp án mới theo từng phần ('' = chưa đặt → AI đọc từ file đáp án)
function defaultAnswer(part: PartKey): any {
  if (part === 'true_false') return ['', '', '', ''];
  return ''; // multiple_choice / short_answer
}

// Cắt/đệm mảng answers cho khớp số câu (count) khi giáo viên đổi số lượng.
export function resizeAnswers(part: PartKey, answers: any[], count: number): any[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const next = (answers || []).slice(0, n);
  while (next.length < n) next.push(defaultAnswer(part));
  return next;
}

// Cắt/đệm mảng ghi chú (gợi ý cách điền) cho khớp số câu.
export function resizeNotes(notes: any[], count: number): string[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const next = (notes || []).slice(0, n).map((v) => (typeof v === 'string' ? v : ''));
  while (next.length < n) next.push('');
  return next;
}

// "Điểm mỗi câu" của một phần (lấy phần tử đầu, hoặc mặc định của phần).
export function pointPerOf(part: PartKey, points: any[]): number {
  const v = Array.isArray(points) ? points.find((x) => typeof x === 'number' && x >= 0) : undefined;
  return typeof v === 'number' && v >= 0 ? v : (DEFAULT_POINTS[part] ?? 0);
}

// Tạo mảng điểm khớp số câu, tất cả bằng "điểm mỗi câu".
export function uniformPoints(per: number, count: number): number[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const p = typeof per === 'number' && per >= 0 ? per : 0;
  return Array(n).fill(p);
}

// Một câu objective đã có đáp án (key) chưa? '' = chưa đặt (sẽ để AI đọc file đáp án).
export function keyIsSet(part: PartKey, val: any): boolean {
  if (part === 'multiple_choice') return typeof val === 'string' && /^[ABCD]$/i.test(val.trim());
  if (part === 'true_false') return Array.isArray(val) && val.length >= 4 && val.slice(0, 4).every((v) => v === 'T' || v === 'F');
  return typeof val === 'string' && val.trim() !== ''; // short_answer
}

// Phần objective có câu nào chưa đặt đáp án (sẽ nhờ AI đọc từ file đáp án)?
export function hasUnsetKey(cfg: PartsConfig | null, key: PartKey): boolean {
  const p = cfg && (cfg as any)[key];
  if (!p || !p.enabled) return false;
  for (let i = 0; i < (p.count || 0); i++) if (!keyIsSet(key, (p.answers || [])[i])) return true;
  return false;
}

export function anyUnsetKey(cfg: PartsConfig | null): boolean {
  return (['multiple_choice', 'true_false', 'short_answer'] as PartKey[]).some((k) => hasUnsetKey(cfg, k));
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
      const per = pointPerOf(k, Array.isArray(p.points) ? p.points : []);
      (base as any)[k] = {
        enabled: true,
        count,
        answers: resizeAnswers(k, Array.isArray(p.answers) ? p.answers : [], count),
        points: uniformPoints(per, count),
        ...(k === 'short_answer' ? { notes: resizeNotes(Array.isArray(p.notes) ? p.notes : [], count) } : {}),
        ...(k === 'true_false' ? { tfMode: tfModeOf(p.tfMode) } : {}),
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

// Tổng điểm THÔ của cả bài (tổng điểm tất cả các câu + tự luận). Đây là cơ sở để quy đổi về thang chọn.
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

// ── HSA: Lựa chọn 2 khi tạo bài — mỗi câu tự chọn Trắc nghiệm hoặc Trả lời ngắn, luôn 1 điểm/câu.
// Điểm cuối = tổng số câu đúng (KHÔNG quy đổi về thang điểm như THPT). Khác THPT: chấm hoàn toàn tự
// động theo đáp án nhập ở đây, không hỗ trợ để trống đáp án cho AI đọc từ file.
export type ExamType = 'thpt' | 'hsa';
export type HsaQuestionKind = 'multiple_choice' | 'short_answer';

export interface HsaQuestion {
  kind: HsaQuestionKind;
  answer: string; // TN: '' | 'A'..'D'; TLN: đáp án text
  note?: string;  // gợi ý cách điền (chỉ áp dụng câu TLN)
}

export interface HsaConfig {
  questions: HsaQuestion[];
}

export function emptyHsaConfig(): HsaConfig {
  return { questions: [] };
}

function defaultHsaQuestion(): HsaQuestion {
  return { kind: 'multiple_choice', answer: '', note: '' };
}

// Cắt/đệm danh sách câu hỏi HSA cho khớp số câu, giữ nguyên các câu cũ theo thứ tự.
export function resizeHsaQuestions(questions: HsaQuestion[], count: number): HsaQuestion[] {
  const n = Math.max(0, Math.min(50, Math.floor(count) || 0));
  const next: HsaQuestion[] = (questions || []).slice(0, n).map((q) => ({
    kind: q?.kind === 'short_answer' ? 'short_answer' : 'multiple_choice' as HsaQuestionKind,
    answer: typeof q?.answer === 'string' ? q.answer : '',
    note: typeof q?.note === 'string' ? q.note : '',
  }));
  while (next.length < n) next.push(defaultHsaQuestion());
  return next;
}

// Một câu HSA đã có đáp án chưa (theo đúng kiểu TN/TLN của câu đó)?
export function hsaKeyIsSet(q: HsaQuestion): boolean {
  if (q.kind === 'multiple_choice') return /^[ABCD]$/i.test((q.answer || '').trim());
  return (q.answer || '').trim() !== '';
}

// Thang điểm HSA = số câu (mỗi câu 1 điểm, không quy đổi).
export function hsaMaxScore(cfg: HsaConfig | null): number {
  return cfg ? cfg.questions.length : 0;
}

// Parse hsa_config từ chuỗi JSON (server trả) hoặc object; trả null nếu không hợp lệ/không có câu nào.
export function parseHsaConfig(raw: any): HsaConfig | null {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.questions) || obj.questions.length === 0) return null;
  return { questions: resizeHsaQuestions(obj.questions, obj.questions.length) };
}

// Tạo state đáp án rỗng cho học sinh điền bài HSA (1 chuỗi/câu).
export function emptyHsaStudentAnswers(cfg: HsaConfig | null): string[] {
  return cfg ? Array(cfg.questions.length).fill('') : [];
}

// mm:ss (hoặc h:mm:ss nếu còn hơn 1 tiếng) từ số mili-giây còn lại — dùng cho đồng hồ đếm ngược bài HSA
// có giới hạn thời gian, cả lúc đang làm bài (toàn màn hình) lẫn ngoài danh sách bài tập.
export function formatRemainingMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
