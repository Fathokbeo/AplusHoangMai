// Ảnh bài làm đã chấm (AI vẽ ✓/✗, gạch chỗ sai, sắp đúng thứ tự trang) + kết quả đối chiếu 2 lần chấm.
// Server lưu ở cột graded_pages: { pages: [{ name, page, file, filePage }], review?: {...} }.
// Học sinh chỉ nhận được { pages } và chỉ từ "Thời gian xem đáp án".

export type GradedReview = {
  run1?: { score: number; model: string } | null;
  run2?: { score: number; model: string } | null;
  final?: { score: number; model?: string } | null;
  spread?: number | null;
  skipped?: boolean;
  group_size?: number;
  used_fallback?: boolean;
  needs_teacher?: boolean;
  note?: string;
  comparison?: { question: string; run1_points: number; run2_points: number; final_points: number; analysis: string }[];
};

type Graded = { pages: { name: string }[]; review?: GradedReview };

export function parseGraded(raw: unknown): Graded | null {
  if (!raw) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || !Array.isArray((o as Graded).pages)) return null;
    return o as Graded;
  } catch { return null; }
}

export function gradedPageUrls(raw: unknown): string[] {
  const g = parseGraded(raw);
  return g ? g.pages.filter((p) => p && p.name).map((p) => `/uploads/graded/${p.name}`) : [];
}

export function gradedReview(raw: unknown): GradedReview | null {
  return parseGraded(raw)?.review || null;
}
