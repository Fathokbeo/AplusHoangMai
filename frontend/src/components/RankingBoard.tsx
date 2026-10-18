import { useEffect, useState } from 'react';
import api from '../lib/api';
import { toast } from './Toast';
import useIsMobile from '../lib/useIsMobile';

// Bảng xếp hạng lớp theo tháng (dùng chung giáo viên & học sinh): top 3 gắn huy chương vàng/bạc/đồng
// + bảng đầy đủ. url: API trả về { month, months, current_month, students }.
// Bản học sinh: server đã ẩn tên đăng nhập, dòng của chính học sinh có is_me → tô nổi bật.

// 'YYYY-MM' → 'Tháng M/YYYY' cho ô chọn tháng
function formatMonth(ym: string): string {
  const [y, m] = (ym || '').split('-');
  return y && m ? `Tháng ${parseInt(m)}/${y}` : ym;
}

const MEDALS = [
  { rank: 1, medal: '🥇', label: 'Hạng Nhất', color: '#F9A825', bg: '#FFF8E1', border: '#FFE082' },
  { rank: 2, medal: '🥈', label: 'Hạng Nhì', color: '#757575', bg: '#F5F5F5', border: '#E0E0E0' },
  { rank: 3, medal: '🥉', label: 'Hạng Ba', color: '#8D6E63', bg: '#EFEBE9', border: '#D7CCC8' },
];

const MeBadge = () => <span className="badge badge-red" style={{ marginLeft: 6 }}>Bạn</span>;

export default function RankingBoard({ url }: { url: string }) {
  const isMobile = useIsMobile();
  const [ranking, setRanking] = useState<any>(null);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);

  // Tải xếp hạng khi mở mục hoặc đổi tháng
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(url, { params: month ? { month } : {} });
        setRanking(data);
      } catch {
        toast.error('Lỗi tải xếp hạng');
      } finally {
        setLoading(false);
      }
    })();
  }, [url, month]);

  const students: any[] = ranking?.students || [];
  // Nhóm huy chương top 3 của tháng đang xem (đồng hạng → cùng huy chương)
  const medalGroups = MEDALS.map((g) => ({ ...g, students: students.filter((s) => s.rank === g.rank) }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.82rem', color: '#888', lineHeight: 1.5 }}>
          Xếp hạng theo <strong>điểm TB các bài tập trong tháng</strong> (quá hạn không nộp = 0 điểm). Sang tháng mới bảng tự reset — chọn tháng để xem lại.
        </div>
        <select className="input" style={{ width: 'auto', minWidth: 160 }} value={month || ranking?.month || ''}
          onChange={(e) => setMonth(e.target.value)}>
          {(ranking?.months || []).map((m: string) => (
            <option key={m} value={m}>{formatMonth(m)}{m === ranking?.current_month ? ' (hiện tại)' : ''}</option>
          ))}
        </select>
      </div>

      {loading && !ranking ? (
        <div style={{ padding: '2rem', color: '#999', textAlign: 'center' }}>Đang tải...</div>
      ) : (
        <>
          {/* Podium top 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {medalGroups.map((g) => (
              <div key={g.rank} className="card" style={{ padding: '1rem 1.25rem', background: g.bg, border: `1px solid ${g.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.6rem' }}>{g.medal}</span>
                  <span style={{ fontWeight: 800, color: g.color, fontSize: '0.95rem' }}>{g.label}</span>
                </div>
                {g.students.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#aaa' }}>Chưa có</div>
                ) : g.students.map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{s.full_name}{s.is_me && <MeBadge />}</div>
                      {s.username && <div style={{ fontSize: '0.75rem', color: '#999' }}>{s.username}</div>}
                    </div>
                    <span style={{ fontWeight: 800, color: g.color, fontSize: '1.05rem' }}>{s.avg}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bảng xếp hạng đầy đủ */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Hạng</th>
                  <th>Học sinh</th>
                  <th>Điểm TB</th>
                  <th>Số bài tính điểm</th>
                  <th>Đã có điểm</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any) => (
                  <tr key={s.id} style={s.is_me ? { background: '#FFF5F5' } : undefined}>
                    <td>
                      {s.rank ? (
                        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                          {s.rank <= 3 ? <span style={{ marginRight: 4 }}>{s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : '🥉'}</span> : null}
                          {s.rank}
                        </span>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td>
                      <strong>{s.full_name}</strong>{s.is_me && <MeBadge />}
                      {s.username && <div style={{ fontSize: '0.78rem', color: '#999' }}>{s.username}</div>}
                    </td>
                    <td>
                      {s.avg !== null
                        ? <span style={{ fontWeight: 700, color: s.avg >= 8 ? '#2E7D32' : s.avg >= 5 ? '#E65100' : '#C62828' }}>{s.avg}/10</span>
                        : <span style={{ color: '#ccc' }}>Chưa có</span>}
                    </td>
                    <td style={{ color: '#888' }}>{s.counted}</td>
                    <td style={{ color: '#888' }}>{s.graded}</td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Lớp chưa có học sinh</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
