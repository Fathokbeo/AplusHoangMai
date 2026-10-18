import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react';
import { buildStudentReview, ERROR_TAGS, type ErrorTag } from '../lib/feedbackSummary';
import useIsMobile from '../lib/useIsMobile';

// Khối "Nhận xét" ở trang chi tiết bài tập (giáo viên): tổng quan điểm cả lớp + phổ điểm + nhận xét
// ngắn từng học sinh kèm nhãn lỗi. Mức điểm tính theo tỉ lệ trên thang của bài (quy về thang 10).

const BANDS = [
  { key: 'good', label: 'Tốt', min: 0.85, color: '#2E7D32', bg: '#E8F5E9' },
  { key: 'fair', label: 'Khá', min: 0.75, color: '#1565C0', bg: '#E3F2FD' },
  { key: 'avg', label: 'Trung bình', min: 0.65, color: '#E65100', bg: '#FFF3E0' },
  { key: 'weak', label: 'Cần cố gắng', min: 0, color: '#C62828', bg: '#FFEBEE' },
] as const;

const bandOf = (ratio: number) => BANDS.find((b) => ratio >= b.min)!;
const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
// Ngưỡng hiển thị theo thang của bài, làm tròn 0,25 cho dễ đọc
const at = (ratio: number, max: number) => Math.round(ratio * max * 4) / 4;

const TAG_SHORT: Record<ErrorTag, string> = Object.fromEntries(ERROR_TAGS.map((t) => [t.key, t.short])) as Record<ErrorTag, string>;

export default function HomeworkReport({ hw, roster }: { hw: any; roster: any[] }) {
  const [open, setOpen] = useState(true);
  const isMobile = useIsMobile();
  const max = hw.max_score > 0 ? hw.max_score : 10;

  const rows = roster.map((s) => ({ s, review: buildStudentReview(s, hw) }));
  const scores = rows.flatMap(({ review }) => (review.kind === 'graded' ? [review.score] : []));
  const graded = scores.length;
  const avg = graded ? scores.reduce((a, b) => a + b, 0) / graded : null;
  const top = graded ? Math.max(...scores) : null;
  const topCount = top === null ? 0 : scores.filter((x) => x === top).length;
  const fairUp = scores.filter((x) => x / max >= 0.75).length;
  const bandCounts = BANDS.map((b, i) => ({
    ...b,
    count: scores.filter((x) => { const r = x / max; return r >= b.min && (i === 0 || r < BANDS[i - 1].min); }).length,
  }));
  const bandRange = (i: number) => {
    const b = BANDS[i];
    if (i === 0) return `${fmt(at(b.min, max))} – ${fmt(max)}`;
    if (b.min === 0) return `Dưới ${fmt(at(BANDS[i - 1].min, max))}`;
    return `${fmt(at(b.min, max))} – <${fmt(at(BANDS[i - 1].min, max))}`;
  };

  const stats = [
    { label: 'Có kết quả', value: `${graded}/${roster.length}`, sub: `${roster.length - graded} HS chưa có điểm` },
    { label: 'Điểm trung bình', value: avg === null ? '—' : fmt(Math.round(avg * 100) / 100), sub: `trên thang ${fmt(max)} điểm` },
    { label: 'Điểm cao nhất', value: top === null ? '—' : fmt(top), sub: top === null ? 'chưa có điểm' : `${topCount} HS đạt mức này` },
    { label: `Từ ${fmt(at(0.75, max))} điểm trở lên`, value: `${fairUp} HS`, sub: graded ? `${Math.round((fairUp / graded) * 100)}% HS có điểm` : '—' },
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
      {/* Dải tiêu đề */}
      <div style={{ background: 'linear-gradient(135deg, #C62828, #8E0000)', color: 'white', padding: isMobile ? '1rem 1.1rem' : '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.8, fontWeight: 700 }}>
            Bài tập về nhà{hw.due_date ? ` · hạn ${new Date(hw.due_date).toLocaleDateString('vi-VN')}` : ''}
          </div>
          <div style={{ fontSize: isMobile ? '1.25rem' : '1.55rem', fontWeight: 800, margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquareText size={isMobile ? 20 : 24} /> Nhận xét
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hw.title} · điểm tối đa {fmt(max)}
          </div>
        </div>
        {hw.class_title && !isMobile && (
          <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '35%' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Lớp</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hw.class_title}</div>
          </div>
        )}
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}
          style={{ background: 'rgba(255,255,255,0.16)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {open ? 'Thu gọn' : 'Mở'}
        </button>
      </div>

      {open && (
        <div style={{ padding: isMobile ? '1rem' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* 4 ô tổng quan */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            {stats.map((st) => (
              <div key={st.label} style={{ border: '1px solid #EEE', borderRadius: 12, padding: '0.85rem 1rem', background: '#FCFCFC' }}>
                <div style={{ fontSize: '0.78rem', color: '#888' }}>{st.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#C62828', lineHeight: 1.3 }}>{st.value}</div>
                <div style={{ fontSize: '0.75rem', color: '#999' }}>{st.sub}</div>
              </div>
            ))}
          </div>

          {/* Phổ điểm */}
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 10 }}>Phổ điểm</div>
            {graded === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#aaa' }}>Chưa có học sinh nào có điểm</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 4, height: 14 }}>
                  {bandCounts.filter((b) => b.count > 0).map((b) => (
                    <div key={b.key} title={`${b.label}: ${b.count} HS`} style={{ flex: b.count, background: b.color, borderRadius: 99 }} />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                  {bandCounts.map((b, i) => (
                    <div key={b.key} style={{ fontSize: '0.8rem', color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                      {bandRange(i)}: <strong style={{ color: '#1A1A2E' }}>{b.count} HS</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Nhận xét từng học sinh */}
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Nhận xét từng học sinh</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.75rem', color: '#777', marginBottom: 4 }}>
              {BANDS.map((b, i) => (
                <span key={b.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 5, borderRadius: 99, background: b.color }} />{b.label} ({bandRange(i)})
                </span>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#777', marginBottom: 10 }}>
              <strong>Nhãn lỗi:</strong> {ERROR_TAGS.map((t) => `${t.short} – ${t.label}`).join(' · ')}
            </div>

            <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
              {!isMobile && (
                <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(140px, 1.1fr) 150px minmax(0, 3fr)', gap: 12, padding: '0.6rem 1rem', background: '#FAFAFA', fontSize: '0.72rem', fontWeight: 700, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <span>STT</span><span>Họ và tên</span><span>Điểm</span><span>Nhận xét</span>
                </div>
              )}
              {rows.map(({ s, review }, i) => {
                const missing = review.kind === 'missing';
                const band = review.kind === 'graded' ? bandOf(review.score / max) : null;
                const scoreCell = review.kind === 'graded' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: '#F0F0F0', borderRadius: 99, overflow: 'hidden', maxWidth: 80 }}>
                      <div style={{ width: `${Math.min(100, (review.score / max) * 100)}%`, height: '100%', background: band!.color, borderRadius: 99 }} />
                    </div>
                    <strong style={{ fontSize: '0.88rem', minWidth: 34, textAlign: 'right' }}>{fmt(review.score)}</strong>
                  </div>
                ) : missing ? (
                  <span style={{ background: '#C62828', color: 'white', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>Chưa nộp bài</span>
                ) : (
                  <span className="badge badge-gray">{review.kind === 'pending' ? 'Chưa có điểm' : 'Chưa nộp'}</span>
                );
                const comment = (
                  <div>
                    <div style={{ fontSize: '0.84rem', lineHeight: 1.55, color: missing ? '#C62828' : review.kind === 'graded' ? '#333' : '#999' }}>{review.text}</div>
                    {review.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {review.tags.map((t) => (
                          <span key={t} style={{ fontSize: '0.68rem', fontWeight: 700, color: '#555', border: '1px solid #DDD', borderRadius: 5, padding: '0 6px', background: 'white' }}>{TAG_SHORT[t]}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
                const rowBg = missing ? '#FFF5F5' : i % 2 ? '#FCFCFC' : 'white';
                return isMobile ? (
                  <div key={s.student_id} style={{ padding: '0.75rem 0.9rem', borderTop: i ? '1px solid #F2F2F2' : 'none', background: rowBg }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.78rem', color: '#999', width: 20 }}>{i + 1}</span>
                      <strong style={{ flex: 1, fontSize: '0.9rem' }}>{s.full_name}</strong>
                      <div style={{ width: 120 }}>{scoreCell}</div>
                    </div>
                    {comment}
                  </div>
                ) : (
                  <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '48px minmax(140px, 1.1fr) 150px minmax(0, 3fr)', gap: 12, alignItems: 'center', padding: '0.7rem 1rem', borderTop: '1px solid #F2F2F2', background: rowBg }}>
                    <span style={{ fontSize: '0.85rem', color: '#999' }}>{i + 1}</span>
                    <strong style={{ fontSize: '0.9rem' }}>{s.full_name}</strong>
                    <div>{scoreCell}</div>
                    {comment}
                  </div>
                );
              })}
              {rows.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: '#999' }}>Lớp chưa có học sinh</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
