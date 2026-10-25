import { useState } from 'react';
import { Crown } from 'lucide-react';

// "Bảng vàng" ở mục Học sinh tiêu biểu (trang chủ): các bạn có điểm TB tháng cao nhất, tự tính theo từng tháng.
// data: [{ month: 'YYYY-MM', students: [{ full_name, classes, avg, rank }] }] — tháng mới nhất trước.

const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_STYLE = [
  { bg: 'linear-gradient(135deg, #FFF8E1, #FFECB3)', border: '#FFD54F', color: '#F57F17' },
  { bg: 'linear-gradient(135deg, #FAFAFA, #EEEEEE)', border: '#E0E0E0', color: '#616161' },
  { bg: 'linear-gradient(135deg, #EFEBE9, #D7CCC8)', border: '#BCAAA4', color: '#6D4C41' },
];

function monthText(ym: string) {
  const [y, m] = ym.split('-');
  return `Tháng ${parseInt(m)}/${y}`;
}

export default function MonthlyHonorBoard({ data }: { data: any[] }) {
  const [idx, setIdx] = useState(0);
  if (!data.length) return null;
  const cur = data[Math.min(idx, data.length - 1)];
  const now = new Date();
  const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', padding: '1.25rem', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={20} color="#F9A825" /> Bảng vàng {monthText(cur.month)}
            {cur.month === thisYm && <span className="badge badge-orange">đang diễn ra</span>}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 2 }}>Những bạn có điểm trung bình các bài tập trong tháng cao nhất toàn trung tâm</div>
        </div>
        {data.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.map((m, i) => (
              <button key={m.month} type="button" onClick={() => setIdx(i)}
                className={`btn btn-sm ${i === idx ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0.25rem 0.7rem' }}>
                {monthText(m.month).replace('Tháng ', 'T')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(128px, 100%), 1fr))', gap: 10 }}>
        {cur.students.map((s: any, i: number) => {
          const st = RANK_STYLE[s.rank - 1];
          return (
            <div key={`${cur.month}-${i}`} style={{
              borderRadius: 14, padding: '0.8rem 0.85rem', border: `1.5px solid ${st ? st.border : '#F0F0F0'}`,
              background: st ? st.bg : '#FCFCFC', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: s.rank <= 3 ? '1.7rem' : '1rem', fontWeight: 800, width: 30, textAlign: 'center', color: '#999', flexShrink: 0 }}>
                {s.rank <= 3 ? MEDAL[s.rank - 1] : `#${s.rank}`}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1A1A2E', lineHeight: 1.3 }}>{s.full_name}</div>
                {s.classes && <div style={{ fontSize: '0.75rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Lớp {s.classes}</div>}
                <div style={{ fontSize: '0.8rem', marginTop: 2 }}>
                  ĐTB <strong style={{ color: st ? st.color : '#C62828', fontSize: '1rem' }}>{s.avg}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
