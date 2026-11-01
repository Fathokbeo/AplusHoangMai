import { CalendarClock } from 'lucide-react';

// Ô nhập dùng chung cho form khóa học / lớp học:
//  - CategoryField: danh mục khóa học (THCS, THPT, HSA, TSA… hoặc tự gõ) — trang chủ chia hàng theo danh mục
//  - ScheduleField: lịch học của lớp (mỗi dòng một buổi) — hiện ở trang khóa học công khai
//  - ScheduleLines: hiển thị lịch học

const COURSE_CATEGORY_SUGGESTIONS = ['THCS', 'THPT', 'HSA', 'TSA'];

export function CategoryField({ value, onChange, existing = [] }: { value: string; onChange: (v: string) => void; existing?: string[] }) {
  const options = [...new Set([...COURSE_CATEGORY_SUGGESTIONS, ...existing.filter(Boolean)])];
  return (
    <div className="form-group">
      <label className="label">Danh mục</label>
      <input className="input" list="course-category-options" placeholder="vd: THCS, THPT, HSA, TSA…" maxLength={40}
        value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="course-category-options">
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {options.map((o) => (
          <button key={o} type="button" className="btn btn-sm" onClick={() => onChange(o)}
            style={{ padding: '2px 10px', fontSize: '0.75rem', background: value === o ? '#FFEBEE' : '#F5F5F5', color: value === o ? '#C62828' : '#666', border: 'none' }}>
            {o}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Trang chủ xếp các khóa cùng danh mục thành 1 hàng.</div>
    </div>
  );
}

export function ScheduleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="form-group">
      <label className="label">Lịch học</label>
      <textarea className="input" rows={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={'Mỗi dòng một buổi, vd:\nThứ 2, 4, 6: 18:00 – 19:30\nChủ nhật: 8:00 – 10:00'} />
      <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Hiện ở trang giới thiệu khóa học để phụ huynh, học sinh xem lịch.</div>
    </div>
  );
}

export function ScheduleLines({ schedule, compact = false }: { schedule?: string | null; compact?: boolean }) {
  const lines = String(schedule || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: compact ? '0.78rem' : '0.88rem', color: '#444' }}>
      <CalendarClock size={compact ? 13 : 16} color="#E65100" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}
