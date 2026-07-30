import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { School, Trophy } from 'lucide-react';

// Màu huy hiệu xếp hạng: top 1 vàng, 2 bạc, 3 đồng, còn lại tím
function rankStyle(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: '#FFF8E1', color: '#F9A825' };
  if (rank === 2) return { bg: '#F5F5F5', color: '#9E9E9E' };
  if (rank === 3) return { bg: '#FBE9E7', color: '#D84315' };
  return { bg: '#F3E5F5', color: '#6A1B9A' };
}

export default function StudentClasses() {
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    api.get('/student/my-classes').then((r) => setClasses(r.data));
  }, []);

  return (
    <div className="fade-in">
      <h1 className="page-title">Lớp học của tôi</h1>

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
