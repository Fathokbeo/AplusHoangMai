// Gom nội dung một lớp thành các phần hiển thị, dùng chung cho trang giáo viên và trang học sinh.
//
// Thứ tự phần: Đại số → Hình học → các phần "Khác" do giáo viên tự đặt tên.
// Phần nào không có chương nào thì KHÔNG trả về (không hiện tiêu đề trống trên giao diện).
// Bài giảng/bài tập chưa gán chương không thuộc phần nào: trả riêng ở `orphan` và luôn xếp cuối,
// hiện ra kể cả khi lớp chưa tạo chương nào.

export type ChapterSubject = 'algebra' | 'geometry' | 'other';

export type ChapterGroup = {
  key: string;
  chapter: any | null; // null = nhóm bài lẻ chưa phân chương
  lessons: any[];
  homework: any[];
};

export type ContentSection = {
  key: string;
  label: string;
  color: string;
  groups: ChapterGroup[];
};

const ALGEBRA_COLOR = '#1565C0';
const GEOMETRY_COLOR = '#6A1B9A';
export const OTHER_COLOR = '#E65100';

// Chương cũ chưa có cột subject thì coi như Đại số.
export const chapterSubject = (ch: any): ChapterSubject =>
  ch?.subject === 'geometry' || ch?.subject === 'other' ? ch.subject : 'algebra';

// Các chương "Khác" cùng tên phần gom chung một tiêu đề — bỏ qua hoa/thường và khoảng trắng thừa.
export const sectionKey = (title: any) => String(title ?? '').trim().toLowerCase();

export function buildContentSections(chapters: any[], lessons: any[], homework: any[]): {
  sections: ContentSection[];
  orphan: ChapterGroup | null;
} {
  const toGroup = (ch: any): ChapterGroup => ({
    key: String(ch.id),
    chapter: ch,
    lessons: lessons.filter((l: any) => l.chapter_id === ch.id),
    homework: homework.filter((h: any) => h.chapter_id === ch.id),
  });

  const sections: ContentSection[] = [];
  const bySubject = (s: ChapterSubject) => chapters.filter((ch) => chapterSubject(ch) === s);

  const algebra = bySubject('algebra');
  if (algebra.length) sections.push({ key: 'algebra', label: 'Đại số', color: ALGEBRA_COLOR, groups: algebra.map(toGroup) });

  const geometry = bySubject('geometry');
  if (geometry.length) sections.push({ key: 'geometry', label: 'Hình học', color: GEOMETRY_COLOR, groups: geometry.map(toGroup) });

  // Mỗi tên phần là một mục riêng, giữ đúng thứ tự phần xuất hiện đầu tiên. Bỏ trống tên thì hiện "Khác".
  const others = new Map<string, ContentSection>();
  bySubject('other').forEach((ch) => {
    const k = sectionKey(ch.section_title);
    let sec = others.get(k);
    if (!sec) {
      sec = { key: `other:${k}`, label: String(ch.section_title ?? '').trim() || 'Khác', color: OTHER_COLOR, groups: [] };
      others.set(k, sec);
    }
    sec.groups.push(toGroup(ch));
  });
  sections.push(...others.values());

  const chapterIds = new Set(chapters.map((c: any) => c.id));
  const orphanLessons = lessons.filter((l: any) => !l.chapter_id || !chapterIds.has(l.chapter_id));
  const orphanHomework = homework.filter((h: any) => !h.chapter_id || !chapterIds.has(h.chapter_id));
  const orphan: ChapterGroup | null = (orphanLessons.length || orphanHomework.length)
    ? { key: 'orphan', chapter: null, lessons: orphanLessons, homework: orphanHomework }
    : null;

  return { sections, orphan };
}

// Tên các phần "Khác" đã có trong lớp — dùng gợi ý khi giáo viên nhập tên phần mới.
export function existingSectionTitles(chapters: any[]): string[] {
  const seen = new Map<string, string>();
  chapters.filter((ch) => chapterSubject(ch) === 'other').forEach((ch) => {
    const title = String(ch.section_title ?? '').trim();
    if (title && !seen.has(sectionKey(title))) seen.set(sectionKey(title), title);
  });
  return [...seen.values()];
}
