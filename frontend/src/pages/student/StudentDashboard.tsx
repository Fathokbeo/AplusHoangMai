import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { School, ClipboardList, CheckCircle, Star, BookOpen, ChevronRight } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/student/my-courses').then((r) => setCourses(r.data));
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

      <h2 className="section-title">Khóa học của tôi</h2>
      {courses.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#999' }}>
          <BookOpen size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>Bạn chưa được thêm vào lớp học nào</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {courses.map((co) => (
            <div key={co.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.11)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; }}
            >
              {co.thumbnail ? (
                <img src={`/uploads/courses/${co.thumbnail}`} alt={co.title} style={{ width: '100%', height: 130, objectFit: 'cover' }} />
              ) : (
                <div style={{ height: 100, background: 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={30} color="rgba(255,255,255,0.8)" />
                </div>
              )}
              <div style={{ padding: '1rem' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E' }}>{co.title}</h3>
                {co.description && <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#888', lineHeight: 1.4 }}>{co.description}</p>}
                <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: '#999', borderTop: '1px solid #F5F5F5', paddingTop: 10, marginTop: 10, marginBottom: 10 }}>
                  <span><School size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{co.class_count || 0} lớp của bạn</span>
                </div>
                <Link to={`/student/courses/${co.id}`} style={{ textDecoration: 'none' }}>
                  <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                    Vào khóa học <ChevronRight size={13} />
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
