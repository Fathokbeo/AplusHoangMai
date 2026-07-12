import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { School, ClipboardList, CheckCircle, Star, Trophy } from 'lucide-react';

// Màu huy hiệu xếp hạng: top 1 vàng, 2 bạc, 3 đồng, còn lại tím
function rankStyle(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: '#FFF8E1', color: '#F9A825' };
  if (rank === 2) return { bg: '#F5F5F5', color: '#9E9E9E' };
  if (rank === 3) return { bg: '#FBE9E7', color: '#D84315' };
  return { bg: '#F3E5F5', color: '#6A1B9A' };
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/student/my-classes').then((r) => setClasses(r.data));
    api.get('/student/stats').then((r) => setStats(r.data));
  }, []);

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Xin chào, {user?.full_name}!</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.88rem' }}>Chào mừng bạn đến với hệ thống học tập APLUS Hoàng Mai</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stat-grid" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Lớp học', value: stats.classCount, icon: School, color: '#C62828', bg: '#FFEBEE' },
            { label: 'Bài đã nộp', value: stats.submittedCount, icon: ClipboardList, color: '#1565C0', bg: '#E3F2FD' },
            { label: 'Bài đã chấm', value: stats.gradedCount, icon: CheckCircle, color: '#2E7D32', bg: '#E8F5E9' },
            { label: 'Điểm TB tháng', value: stats.avgScore ?? '—', icon: Star, color: '#E65100', bg: '#FFF3E0' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="stat-card">
              <div className="stat-icon" style={{ background: bg }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div>
                <div className="stat-value" style={{ color }}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Lớp học của tôi</h2>
      {classes.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#999' }}>
          <School size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>Bạn chưa được thêm vào lớp học nào</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {classes.map((c) => (
            <Link key={c.id} to={`/student/classes/${c.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'all 0.2s', padding: '1.25rem' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, background: '#FFEBEE', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <School size={20} color="#C62828" />
                  </div>
                  {c.course_title && <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{c.course_title}</span>}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E' }}>{c.title}</h3>
                <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#888' }}>GV: {c.teacher_name}</p>
                {/* Điểm TB + xếp hạng tháng này trong lớp (reset theo tháng; quá hạn chưa nộp tính 0 điểm) */}
                {c.my_rank ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, ...rankStyle(c.my_rank) }}>
                      <Trophy size={12} /> Hạng {c.my_rank}/{c.rank_total}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#E65100', fontWeight: 700 }}>Điểm TB: {c.my_avg ?? '—'}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.74rem', color: '#bbb', marginBottom: 10 }}>Chưa có điểm tháng này</div>
                )}
                <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: '#888', borderTop: '1px solid #F5F5F5', paddingTop: 10 }}>
                  <span>{c.lesson_count} bài giảng</span>
                  <span>{c.submitted_count}/{c.homework_count} bài đã nộp</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
