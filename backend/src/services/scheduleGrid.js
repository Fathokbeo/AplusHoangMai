// Lịch dạng bảng 7 ngày (T2 → CN) × 7 ca cố định — cùng định dạng với lịch làm việc trợ giảng
// (frontend/src/lib/assistantSchedule.ts). Dùng cho lịch học của khóa học.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHIFTS = ['s1', 's2', 'a1', 'a2', 'a3', 'e1', 'e2'];

// Nhận object (hoặc chuỗi JSON) → chuỗi JSON chỉ gồm ngày/ca hợp lệ, mỗi ô ≤ 60 ký tự; bảng trống → null
function cleanScheduleGrid(raw) {
  let parsed = raw;
  if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
  if (!parsed || typeof parsed !== 'object') return null;
  const out = {};
  let any = false;
  for (const d of DAYS) {
    out[d] = {};
    for (const s of SHIFTS) {
      const v = parsed?.[d]?.[s];
      const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
      out[d][s] = t;
      if (t) any = true;
    }
  }
  return any ? JSON.stringify(out) : null;
}

module.exports = { cleanScheduleGrid };
