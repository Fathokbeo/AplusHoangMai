import { Fragment } from 'react';
import { DAYS, SHIFTS, PERIOD_LABELS } from '../lib/assistantSchedule';
import type { AssistantSchedule, DayKey, ShiftKey, Period } from '../lib/assistantSchedule';

const PERIOD_ORDER: Period[] = ['morning', 'afternoon', 'evening'];

interface Props {
  value: AssistantSchedule;
  editing?: boolean;
  onChange?: (next: AssistantSchedule) => void;
  // Chế độ xem: ẩn các ca (và buổi) không có ô nào được điền — dùng ở trang công khai cho gọn
  hideEmptyRows?: boolean;
  placeholder?: string;
}

// Bảng 7 ngày (T2 → CN) × 7 ca — dùng chung cho lịch làm việc trợ giảng và lịch học của khóa học
export default function ScheduleGrid({ value, editing = false, onChange, hideEmptyRows = false, placeholder = '—' }: Props) {
  const setCell = (day: DayKey, shift: ShiftKey, v: string) => {
    onChange?.({ ...value, [day]: { ...value[day], [shift]: v } });
  };
  const rowHasData = (shift: ShiftKey) => DAYS.some((d) => value[d.key][shift].trim());
  const shiftsOf = (period: Period) =>
    SHIFTS.filter((s) => s.period === period && (editing || !hideEmptyRows || rowHasData(s.key)));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: 760 }}>
        <thead>
          <tr>
            <th style={{ width: 120 }}>Ca</th>
            {DAYS.map((d) => <th key={d.key} style={{ textAlign: 'center' }}>{d.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PERIOD_ORDER.map((period) => {
            const shifts = shiftsOf(period);
            if (shifts.length === 0) return null;
            return (
              <Fragment key={period}>
                <tr>
                  <td colSpan={8} style={{ background: '#F9F9F9', fontWeight: 700, fontSize: '0.78rem', color: '#666', padding: '0.4rem 1rem' }}>
                    {PERIOD_LABELS[period]}
                  </td>
                </tr>
                {shifts.map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontSize: '0.78rem', color: '#888', whiteSpace: 'nowrap' }}>{s.label}</td>
                    {DAYS.map((d) => (
                      <td key={d.key} style={{ textAlign: editing ? undefined : 'center' }}>
                        {editing ? (
                          <input
                            className="input"
                            style={{ padding: '4px 6px', fontSize: '0.8rem', minWidth: 92 }}
                            value={value[d.key][s.key]}
                            onChange={(e) => setCell(d.key, s.key, e.target.value)}
                            placeholder={placeholder}
                            maxLength={60}
                          />
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: value[d.key][s.key] ? '#1A1A2E' : '#ccc' }}>
                            {value[d.key][s.key] || '—'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Lịch đã có ô nào được điền chưa
export function scheduleHasData(s: AssistantSchedule) {
  return DAYS.some((d) => SHIFTS.some((sh) => s[d.key][sh.key].trim()));
}
