import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ChevronRight, Trophy } from 'lucide-react';

// Thẻ xếp hạng tháng của 1 lớp trên trang Tổng quát học sinh: hạng + điểm TB của mình, so với tháng trước
// (tăng hạng → chúc mừng, giảm → nhắc nhở động viên), kèm 3 bạn đầu bảng + chính mình dàn ngang (ô của mình tô nổi bật).

const MEDAL = ['🥇', '🥈', '🥉'];
export const monthLabel = (ym?: string) => {
  const [y, m] = String(ym || '').split('-');
  return y && m ? `tháng ${parseInt(m)}` : '';
};

type Tone = { color: string; bg: string; icon: string; text: string; trend: 'up' | 'down' | 'same' | 'none'; diff: number };

function rankMessage(c: any, lastMonth: string): Tone {
  const last = monthLabel(lastMonth);
  const r = c.my_rank as number | null;
  const p = c.prev_rank as number | null;
  if (!r) return { color: '#616161', bg: '#F5F5F5', icon: '📝', trend: 'none', diff: 0, text: 'Tháng này bạn chưa có điểm để xếp hạng. Hãy nộp bài đầy đủ, đúng hạn để có tên trên bảng nhé!' };
  if (!p) return {
    color: '#1565C0', bg: '#E3F2FD', icon: r === 1 ? '🏆' : '📊', trend: 'none', diff: 0,
    text: r === 1 ? 'Bạn đang dẫn đầu lớp! Giữ vững phong độ nhé!' : `Bạn đang đứng hạng ${r}. ${last ? `Tháng trước (${last}) chưa có xếp hạng để so sánh.` : ''}`,
  };
  if (r < p) return {
    color: '#2E7D32', bg: '#E8F5E9', icon: '🎉', trend: 'up', diff: p - r,
    text: r === 1
      ? `Xuất sắc! Bạn đã vươn lên dẫn đầu lớp (${last}: hạng ${p}). Chúc mừng bạn, tiếp tục phát huy nhé!`
      : `Chúc mừng! Bạn đã tăng ${p - r} bậc so với ${last} (hạng ${p} → ${r}). Tiếp tục cố gắng nhé!`,
  };
  if (r > p) return {
    color: '#E65100', bg: '#FFF3E0', icon: '💪', trend: 'down', diff: r - p,
    text: `Bạn đã giảm ${r - p} bậc so với ${last} (hạng ${p} → ${r}). Đừng nản lòng! Xem lại các câu sai, nộp bài đầy đủ và đúng hạn để lấy lại phong độ nhé!`,
  };
  return {
    color: '#1565C0', bg: '#E3F2FD', icon: r === 1 ? '🏆' : '👍', trend: 'same', diff: 0,
    text: r === 1 ? 'Bạn tiếp tục giữ vững ngôi đầu lớp! Tuyệt vời!' : `Bạn giữ vững hạng ${r} như ${last}. Cố thêm chút nữa để bứt phá nhé!`,
  };
}

// Nền ô theo hạng: vàng / bạc / đồng
const TIER_BG = ['#FFF8E1', '#F5F5F5', '#FBE9E7'];

export default function ClassRankCard({ c, month, lastMonth }: { c: any; month: string; lastMonth: string }) {
  const msg = rankMessage(c, lastMonth);
  const board: any[] = c.board || [];
  // Chỉ hiện 3 bạn đầu bảng + chính mình (nếu mình không nằm trong 3 bạn đó)
  const top = board.slice(0, 3);
  const me = board.find((s) => s.is_me);
  const tiles = me && !top.includes(me) ? [...top, me] : top;
  const TrendIcon = msg.trend === 'up' ? TrendingUp : msg.trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem 1.15rem', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        {/* Lớp + hạng của mình */}
        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {c.course_title && <div style={{ fontSize: '0.75rem', color: '#999', fontWeight: 500 }}>{c.course_title}</div>}
            <div style={{ fontWeight: 800, fontSize: '1.08rem', color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
            <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>Điểm TB {monthLabel(month)}: <strong style={{ color: '#E65100' }}>{c.my_avg ?? '—'}</strong></div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.72rem', color: '#999' }}>Hạng của bạn</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#C62828', lineHeight: 1.15, display: 'flex', alignItems: 'baseline', gap: 2, justifyContent: 'flex-end' }}>
              {c.my_rank ? <>{c.my_rank <= 3 && <span style={{ fontSize: '1.1rem', marginRight: 2 }}>{MEDAL[c.my_rank - 1]}</span>}{c.my_rank}<span style={{ fontSize: '0.85rem', color: '#BBB', fontWeight: 600 }}>/{c.rank_total}</span></> : '—'}
            </div>
            {msg.trend !== 'none' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: msg.color, background: msg.bg, borderRadius: 99, padding: '1px 7px', marginTop: 3 }}>
                <TrendIcon size={12} /> {msg.trend === 'same' ? 'Giữ hạng' : `${msg.trend === 'up' ? 'Tăng' : 'Giảm'} ${msg.diff}`}
              </span>
            )}
          </div>
        </div>

        {/* Top 3 + mình, dàn ngang */}
        <div style={{ flex: '3 1 420px', minWidth: 0 }}>
          {tiles.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: '#AAA', padding: '0.5rem 0' }}>Chưa có bạn nào có điểm trong {monthLabel(month)}.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {tiles.map((s, i) => (
                <div key={`${s.rank}-${i}`} style={{
                  borderRadius: 12, padding: '0.65rem 0.8rem', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                  background: s.is_me ? '#FFEBEE' : s.rank <= 3 ? TIER_BG[s.rank - 1] : '#FAFAFA',
                  border: `1px solid ${s.is_me ? '#FFCDD2' : '#EEEEEE'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: s.rank <= 3 ? '1.15rem' : '0.85rem', color: s.is_me ? '#C62828' : '#888' }}>
                      {s.rank <= 3 ? MEDAL[s.rank - 1] : `Hạng ${s.rank}`}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: s.avg >= 8 ? '#2E7D32' : s.avg >= 5 ? '#E65100' : '#C62828' }}>{s.avg}</span>
                  </div>
                  <div title={s.full_name} style={{ fontSize: '0.86rem', fontWeight: s.is_me ? 800 : 600, color: s.is_me ? '#C62828' : '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.full_name}
                  </div>
                  {s.is_me && <span className="badge badge-red" style={{ alignSelf: 'flex-start' }}>Bạn</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: '0 1.15rem 0.85rem', padding: '0.55rem 0.75rem', borderRadius: 10, background: msg.bg, color: msg.color, fontSize: '0.82rem', lineHeight: 1.5, display: 'flex', gap: 8 }}>
        <span style={{ fontSize: '1rem', lineHeight: 1.3 }}>{msg.icon}</span>
        <span style={{ fontWeight: 600 }}>{msg.text}</span>
      </div>

      <Link to={`/student/classes/${c.id}?tab=ranking`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0.6rem', borderTop: '1px solid #F2F2F2', color: '#C62828', fontWeight: 600, fontSize: '0.83rem', textDecoration: 'none' }}>
        <Trophy size={14} /> Xem bảng xếp hạng đầy đủ <ChevronRight size={14} />
      </Link>
    </div>
  );
}
