import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronRight, Timer, Trophy, PartyPopper, School, Play, CheckCircle } from 'lucide-react';
import { formatDeadlineRemaining } from '../../lib/homeworkParts';
import { SectionHeader, greeting, givenName, todayLabel, urgencyColor, scoreTone, EmptyState } from '../../components/overviewUi';
import useIsMobile from '../../lib/useIsMobile';

// Trang "Tổng quát" của học sinh: việc cần làm ở mọi lớp (hạn gần nhất trước, đếm ngược),
// điểm vừa có, tình hình từng lớp; bấm là tới đúng chỗ.
export default function StudentOverview() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [ov, setOv] = useState<any>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api.get('/student/overview').then((r) => setOv(r.data)).catch(() => setOv({ todo: [], recent: [], classes: [] }));
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const todo: any[] = ov?.todo || [];
  const recent: any[] = ov?.recent || [];
  const classes: any[] = ov?.classes || [];
  const next = todo[0];
  const subtitle = !ov ? ' ' : todo.length === 0
    ? 'Bạn đã nộp hết bài tập đang mở. Tuyệt vời!'
    : `Bạn có ${todo.length} bài cần nộp — bài gần nhất còn ${formatDeadlineRemaining(new Date(next.due_date).getTime() - now)}.`;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#C62828', fontWeight: 600, textTransform: 'capitalize' }}>{todayLabel()}</div>
        <h1 className="page-title" style={{ margin: '2px 0 0' }}>{greeting()}, {givenName(user?.full_name)}!</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.9rem' }}>{subtitle}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* Việc cần làm */}
        <section>
          <SectionHeader title="Việc cần làm" count={todo.length} />
          {ov && todo.length === 0 ? (
            <EmptyState icon={<PartyPopper size={32} />} title="Không còn bài nào cần nộp" text="Bài tập mới sẽ tự hiện ở đây khi thầy cô giao." />
          ) : (
            <div className="list">
              {todo.map((h) => {
                const left = new Date(h.due_date).getTime() - now;
                const tone = urgencyColor(left);
                return (
                  <Link key={h.id} to={`/student/classes/${h.class_id}?tab=todo`} className="list-row">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: tone, flexShrink: 0 }} />
                    <div className="list-row-main">
                      <div className="list-row-title">{h.title}</div>
                      <div className="list-row-sub">
                        {h.class_title} · Hạn {new Date(h.due_date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        {h.exam_type === 'hsa' && h.time_limit_minutes ? ` · ${h.time_limit_minutes} phút` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: tone, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <Timer size={14} /> {formatDeadlineRemaining(left)}
                    </span>
                    <ChevronRight size={18} color="#CCC" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Kết quả mới */}
        <section>
          <SectionHeader title="Kết quả mới" />
          {ov && recent.length === 0 ? (
            <EmptyState icon={<CheckCircle size={30} />} title="Chưa có bài nào được chấm" text="Điểm sẽ hiện ở đây ngay khi bài được chấm." />
          ) : (
            <div className="list">
              {recent.map((r) => {
                const tone = scoreTone(r.score, r.max_score);
                return (
                  <Link key={r.homework_id} to={`/student/classes/${r.class_id}`} className="list-row">
                    <div className="list-row-main">
                      <div className="list-row-title">{r.title}</div>
                      <div className="list-row-sub">{r.class_title}</div>
                    </div>
                    <span style={{ background: tone.bg, color: tone.color, fontWeight: 700, fontSize: '0.88rem', padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                      {r.score}/{r.max_score}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Lớp của tôi */}
      <section style={{ marginTop: '2rem' }}>
        <SectionHeader title="Lớp của tôi" count={classes.length}
          action={<Link to="/student/classes" style={{ color: '#C62828', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Tất cả <ChevronRight size={15} /></Link>} />
        {ov && classes.length === 0 ? (
          <EmptyState icon={<School size={32} />} title="Bạn chưa được thêm vào lớp nào" text="Hãy liên hệ thầy cô để được thêm vào lớp." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 14 }}>
            {classes.map((c) => (
              <div key={c.id} className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column' }}>
                {c.course_title && <div style={{ fontSize: '0.78rem', color: '#999', fontWeight: 500 }}>{c.course_title}</div>}
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1A1A2E', margin: '2px 0 12px' }}>{c.title}</div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: '#999' }}>Điểm TB tháng</div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#E65100' }}>{c.my_avg ?? '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: '#999' }}>Xếp hạng</div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1565C0', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {c.my_rank ? <><Trophy size={15} /> {c.my_rank}<span style={{ color: '#BBB', fontSize: '0.85rem', fontWeight: 500 }}>/{c.rank_total}</span></> : '—'}
                    </div>
                  </div>
                </div>
                <Link to={`/student/classes/${c.id}`} className="btn btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
                  <Play size={15} /> Vào học
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
