// File đính kèm bài giảng: lưu ở cột lessons.attachments dạng JSON.
// kind: 'doc' — tài liệu bài giảng | 'answer' — đáp án bài tập trên lớp.

export type LessonAttachment = { file: string; name: string; kind: string };

/** JSON (hoặc null/hỏng) → mảng file đính kèm. */
export function parseAttachments(raw: any): LessonAttachment[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** File xem được trong FileViewer (PDF/ảnh); còn lại (Word, PowerPoint...) chỉ tải về. */
export const isViewableFile = (f: string) => /\.(pdf|jpe?g|png|webp)$/i.test(f);
