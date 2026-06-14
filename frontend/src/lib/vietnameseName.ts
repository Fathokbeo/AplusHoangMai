// Tiện ích xử lý họ tên tiếng Việt: sắp xếp theo tên riêng & tìm kiếm không dấu.

// Bộ so sánh theo chuẩn tiếng Việt (a < ă < â < b < ... và phân biệt dấu thanh).
const viCollator = new Intl.Collator('vi', { numeric: true, sensitivity: 'variant' });

/** Tách họ tên thành các từ, bỏ khoảng trắng thừa. */
function nameWords(fullName: string): string[] {
  return (fullName || '').trim().split(/\s+/).filter(Boolean);
}

/**
 * So sánh hai họ tên theo kiểu Việt Nam: ưu tiên TÊN RIÊNG (từ cuối),
 * sau đó tới phần còn lại (họ + tên đệm), cuối cùng là cả tên đầy đủ.
 * VD: "Nguyễn Anh Hào" đứng trước "Trần Hữu Phát" vì Hào < Phát;
 *     "Trần Hữu Phát" đứng trước "Lê Văn Phong" vì Phát < Phong (a < o).
 */
export function compareVietnameseName(a: string, b: string): number {
  const wa = nameWords(a);
  const wb = nameWords(b);
  const givenA = wa.length ? wa[wa.length - 1] : '';
  const givenB = wb.length ? wb[wb.length - 1] : '';
  const byGiven = viCollator.compare(givenA, givenB);
  if (byGiven !== 0) return byGiven;
  // Cùng tên riêng → so theo phần còn lại (họ + tên đệm)
  const byRest = viCollator.compare(wa.slice(0, -1).join(' '), wb.slice(0, -1).join(' '));
  if (byRest !== 0) return byRest;
  return viCollator.compare(a, b);
}

/** Sắp xếp danh sách (theo họ tên) mà không làm thay đổi mảng gốc. */
export function sortByVietnameseName<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareVietnameseName(getName(x), getName(y)));
}

/** Bỏ dấu tiếng Việt + chữ thường để tìm kiếm không phân biệt dấu. */
export function normalizeVietnamese(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * Khớp tìm kiếm theo họ tên: gõ tên đệm / tên riêng (có hoặc không dấu đều được).
 * Mỗi từ trong ô tìm kiếm phải xuất hiện trong họ tên.
 */
export function matchesNameSearch(haystack: string, query: string): boolean {
  const q = normalizeVietnamese(query);
  if (!q) return true;
  const target = normalizeVietnamese(haystack);
  return q.split(/\s+/).filter(Boolean).every((token) => target.includes(token));
}
