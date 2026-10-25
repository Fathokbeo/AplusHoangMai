import type { ReactNode } from 'react';

// Thành phần dùng chung cho các trang "Tổng quát" (admin, giáo viên, học sinh).

export function SectionHeader({ title, count, action }: { title: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <h2 className="section-title" style={{ margin: 0 }}>
        {title}{typeof count === 'number' && <span style={{ color: '#999', fontWeight: 500, marginLeft: 8 }}>{count}</span>}
      </h2>
      {action}
    </div>
  );
}

// "Chào buổi sáng/chiều/tối" theo giờ máy người dùng
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// Tên gọi = chữ cuối của họ tên Việt ("Nguyễn Bảo Anh" → "Anh")
export const givenName = (full?: string) => (full || '').trim().split(/\s+/).pop() || '';

export const todayLabel = (d = new Date()) =>
  d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

// Màu theo độ gấp của hạn nộp: < 24h đỏ, < 3 ngày cam, còn lại xanh dương
export function urgencyColor(ms: number) {
  if (ms < 24 * 3600e3) return '#C62828';
  if (ms < 72 * 3600e3) return '#E65100';
  return '#1565C0';
}

// Màu điểm theo tỉ lệ trên thang: ≥ 80% xanh lá, ≥ 50% cam, còn lại đỏ
export function scoreTone(score: number, max: number) {
  const r = max > 0 ? score / max : 0;
  if (r >= 0.8) return { color: '#2E7D32', bg: '#E8F5E9' };
  if (r >= 0.5) return { color: '#E65100', bg: '#FFF3E0' };
  return { color: '#C62828', bg: '#FFEBEE' };
}

export function EmptyState({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '2.25rem 1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      {icon && <div style={{ color: '#BDBDBD', marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ fontWeight: 600, color: '#1A1A2E' }}>{title}</div>
      {text && <div style={{ color: '#888', fontSize: '0.88rem', marginTop: 4 }}>{text}</div>}
    </div>
  );
}

// Thanh tiến độ "đã nộp / sĩ số"
export function SubmitProgress({ submitted, total, muted }: { submitted: number; total: number; muted?: boolean }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#EEEEEE', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: muted ? '#BDBDBD' : '#1565C0', borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: '#777', whiteSpace: 'nowrap' }}>{submitted}/{total} đã nộp</span>
    </div>
  );
}
