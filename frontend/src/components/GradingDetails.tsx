import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

interface Detail { question: string; status: 'correct' | 'wrong' | 'partial'; comment: string; }

const STYLE: Record<string, { bg: string; color: string; label: string; Icon: any }> = {
  correct: { bg: '#E8F5E9', color: '#2E7D32', label: 'Đúng', Icon: CheckCircle2 },
  wrong:   { bg: '#FFEBEE', color: '#C62828', label: 'Sai', Icon: XCircle },
  partial: { bg: '#FFF3E0', color: '#E65100', label: 'Đúng một phần', Icon: MinusCircle },
};

export default function GradingDetails({ details }: { details: string | Detail[] | null | undefined }) {
  let list: Detail[] = [];
  if (Array.isArray(details)) list = details;
  else if (typeof details === 'string' && details.trim()) {
    try { const p = JSON.parse(details); if (Array.isArray(p)) list = p; } catch { /* ignore */ }
  }
  if (list.length === 0) return null;

  const counts = list.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.83rem', color: '#1A1A2E' }}>Chi tiết từng câu:</strong>
        {counts.correct > 0 && <span style={{ fontSize: '0.74rem', color: '#2E7D32', fontWeight: 600 }}>✓ {counts.correct} đúng</span>}
        {counts.partial > 0 && <span style={{ fontSize: '0.74rem', color: '#E65100', fontWeight: 600 }}>~ {counts.partial} một phần</span>}
        {counts.wrong > 0 && <span style={{ fontSize: '0.74rem', color: '#C62828', fontWeight: 600 }}>✗ {counts.wrong} sai</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((d, i) => {
          const st = STYLE[d.status] || STYLE.partial;
          const Icon = st.Icon;
          return (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '0.5rem 0.7rem', background: st.bg, borderRadius: 8, alignItems: 'flex-start' }}>
              <Icon size={16} color={st.color} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1A1A2E' }}>{d.question || `Câu ${i + 1}`}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: st.color, background: 'white', padding: '1px 7px', borderRadius: 99 }}>{st.label}</span>
                </div>
                {d.comment && <div style={{ fontSize: '0.8rem', color: '#555', lineHeight: 1.5, marginTop: 2 }}>{d.comment}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
