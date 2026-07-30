// So sánh họ tên theo kiểu Việt Nam (ưu tiên tên riêng) — bản backend, cùng thuật toán với
// frontend/src/lib/vietnameseName.ts, dùng để sắp xếp danh sách học sinh mặc định theo bảng chữ cái.

const viCollator = new Intl.Collator('vi', { numeric: true, sensitivity: 'variant' });

function nameWords(fullName) {
  return String(fullName || '').trim().split(/\s+/).filter(Boolean);
}

function compareVietnameseName(a, b) {
  const wa = nameWords(a);
  const wb = nameWords(b);
  const givenA = wa.length ? wa[wa.length - 1] : '';
  const givenB = wb.length ? wb[wb.length - 1] : '';
  const byGiven = viCollator.compare(givenA, givenB);
  if (byGiven !== 0) return byGiven;
  const byRest = viCollator.compare(wa.slice(0, -1).join(' '), wb.slice(0, -1).join(' '));
  if (byRest !== 0) return byRest;
  return viCollator.compare(a, b);
}

module.exports = { compareVietnameseName };
