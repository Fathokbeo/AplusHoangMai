// Lịch làm việc trợ giảng: 7 ngày (T2 → CN) × 7 ca cố định, dùng chung giữa giao diện
// giáo viên (sửa) và học sinh (chỉ xem).

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ShiftKey = 's1' | 's2' | 'a1' | 'a2' | 'a3' | 'e1' | 'e2';
export type Period = 'morning' | 'afternoon' | 'evening';

export const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Thứ 2' },
  { key: 'tue', label: 'Thứ 3' },
  { key: 'wed', label: 'Thứ 4' },
  { key: 'thu', label: 'Thứ 5' },
  { key: 'fri', label: 'Thứ 6' },
  { key: 'sat', label: 'Thứ 7' },
  { key: 'sun', label: 'Chủ nhật' },
];

export const SHIFTS: { key: ShiftKey; label: string; period: Period }[] = [
  { key: 's1', label: '8h30 - 10h00', period: 'morning' },
  { key: 's2', label: '10h00 - 11h30', period: 'morning' },
  { key: 'a1', label: '14h00 - 15h30', period: 'afternoon' },
  { key: 'a2', label: '15h30 - 17h00', period: 'afternoon' },
  { key: 'a3', label: '17h00 - 18h30', period: 'afternoon' },
  { key: 'e1', label: '18h30 - 20h00', period: 'evening' },
  { key: 'e2', label: '20h00 - 21h30', period: 'evening' },
];

export const PERIOD_LABELS: Record<Period, string> = {
  morning: 'Buổi sáng',
  afternoon: 'Buổi chiều',
  evening: 'Buổi tối',
};

export type AssistantSchedule = Record<DayKey, Record<ShiftKey, string>>;

export function emptySchedule(): AssistantSchedule {
  const sch = {} as AssistantSchedule;
  for (const d of DAYS) {
    sch[d.key] = {} as Record<ShiftKey, string>;
    for (const s of SHIFTS) sch[d.key][s.key] = '';
  }
  return sch;
}

// Chuẩn hóa dữ liệu từ server (chuỗi JSON hoặc object, có thể thiếu ngày/ca do dữ liệu cũ)
export function normalizeSchedule(raw: unknown): AssistantSchedule {
  let parsed: any = {};
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) || {}; } catch { parsed = {}; }
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  }
  const sch = emptySchedule();
  for (const d of DAYS) {
    for (const s of SHIFTS) {
      const v = parsed?.[d.key]?.[s.key];
      sch[d.key][s.key] = typeof v === 'string' ? v : '';
    }
  }
  return sch;
}
