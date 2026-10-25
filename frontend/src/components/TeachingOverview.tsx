import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Bot, CalendarCheck, CalendarClock, School } from 'lucide-react';
import api from '../lib/api';
import { formatDeadlineRemaining } from '../lib/homeworkParts';
import { SectionHeader, urgencyColor, EmptyState, SubmitProgress } from './overviewUi';
import useIsMobile from '../lib/useIsMobile';

// Phần "Tổng quát" cho giáo viên (và admin): bài đến hạn HÔM NAY, bài sắp đến hạn kèm tỉ lệ đã nộp,
// danh sách lớp kèm số liệu. Mỗi dòng bấm thẳng vào trang bài tập / lớp.
export default function TeachingOverview({ onLoad }: { onLoad?: (ov: any) => void }) {
  const isMobile = useIsMobile();
  const [ov, setOv] = useState<any>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // "Hôm nay" theo giờ máy người dùng
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setHours(23, 59, 59, 999);
    api.get('/teacher/overview', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then((r) => { setOv(r.data); onLoad?.(r.data); })
      .catch(() => setOv({ today: [], upcoming: [], classes: [], ai_pending: 0 }));
    const t = setInterval(() => setNow(Date.now()), 30000); // đồng hồ đếm ngược hạn nộp
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ov) return null;

  const today: any[] = ov.today || [];
  const upcoming: any[] = ov.upcoming || [];
  const classes: any[] = ov.classes || [];
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      {ov.ai_pending > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#E3F2FD', color: '#1565C0', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: 18, fontSize: '0.9rem' }}>
          <Bot size={18} /> AI đang chấm <strong>{ov.ai_pending}</strong> bài nộp — điểm sẽ tự cập nhật.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <section>
          <SectionHeader title="Hôm nay" count={today.length}
            action={<span style={{ fontSize: '0.82rem', color: '#999' }}>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}</span>} />
          {today.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={30} />} title="Hôm nay không có bài nào đến hạn" text="Bài có hạn nộp trong ngày sẽ hiện ở đây." />
          ) : (
            <div className="list">
              {today.map((h) => {
                const left = new Date(h.due_date).getTime() - now;
                const passed = left <= 0;
                return (
                  <Link key={h.id} to={`/teacher/homework/${h.id}`} className="list-row">
                    <span style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem', color: passed ? '#999' : urgencyColor(left) }}>{hm(h.due_date)}</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#999' }}>hạn nộp</span>
                    </span>
                    <div className="list-row-main">
                      <div className="list-row-title">{h.title}</div>
                      <div className="list-row-sub">
                        {h.class_title} · {passed
                          ? <span style={{ color: '#999' }}>đã hết hạn</span>
                          : <span style={{ color: urgencyColor(left), fontWeight: 600 }}>còn {formatDeadlineRemaining(left)}</span>}
                      </div>
                      <SubmitProgress submitted={h.submitted} total={h.total} muted={passed} />
                    </div>
                    {h.to_grade > 0 && <span className="badge badge-orange" style={{ whiteSpace: 'nowrap' }}>{h.to_grade} chờ chấm</span>}
                    <ChevronRight size={18} color="#CCC" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Sắp đến hạn" count={upcoming.length} />
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarClock size={30} />} title="Không có bài nào sắp đến hạn" text="Các bài có hạn từ ngày mai trở đi." />
          ) : (
            <div className="list">
              {upcoming.map((h) => {
                const left = new Date(h.due_date).getTime() - now;
                return (
                  <Link key={h.id} to={`/teacher/homework/${h.id}`} className="list-row">
                    <div className="list-row-main">
                      <div className="list-row-title">{h.title}</div>
                      <div className="list-row-sub">{h.class_title} · <span style={{ color: urgencyColor(left), fontWeight: 600 }}>còn {formatDeadlineRemaining(left)}</span></div>
                      <SubmitProgress submitted={h.submitted} total={h.total} />
                    </div>
                    {h.to_grade > 0 && <span className="badge badge-orange" style={{ whiteSpace: 'nowrap' }}>{h.to_grade} chờ chấm</span>}
                    <ChevronRight size={18} color="#CCC" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Lớp học: bấm để vào lớp */}
      <section style={{ marginTop: '2rem' }}>
        <SectionHeader title="Lớp học" count={classes.length} />
        {classes.length === 0 ? (
          <EmptyState icon={<School size={30} />} title="Chưa có lớp nào" text="Vào một khóa học để tạo lớp." />
        ) : (
          <div className="list">
            {classes.map((c) => {
              const left = c.next_due ? new Date(c.next_due).getTime() - now : null;
              return (
                <Link key={c.id} to={`/teacher/classes/${c.id}`} className="list-row">
                  <span style={{ width: 42, height: 42, borderRadius: 10, background: '#FFEBEE', color: '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <School size={20} />
                  </span>
                  <div className="list-row-main">
                    <div className="list-row-title">{c.title}{c.course_title && <span style={{ color: '#999', fontWeight: 500 }}> · {c.course_title}</span>}</div>
                    <div className="list-row-sub">
                      {c.student_count} học sinh · {c.homework_count} bài tập
                      {c.class_avg !== null && <> · TB tháng <strong style={{ color: '#E65100' }}>{c.class_avg}</strong></>}
                      {left !== null && <> · hạn gần nhất <span style={{ color: urgencyColor(left), fontWeight: 600 }}>còn {formatDeadlineRemaining(left)}</span></>}
                    </div>
                  </div>
                  {c.to_grade > 0 && <span className="badge badge-orange" style={{ whiteSpace: 'nowrap' }}>{c.to_grade} chờ chấm</span>}
                  <ChevronRight size={18} color="#CCC" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
