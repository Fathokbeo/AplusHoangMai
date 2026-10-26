import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { School, BookOpen, ChevronRight } from 'lucide-react';

// Trang "Khóa học của tôi" của học sinh: các khóa học có lớp mình đang học, bấm để vào khóa.
export default function StudentDashboard() {
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    api.get('/student/my-courses').then((r) => setCourses(r.data));
  }, []);

  return (
    <div className="fade-in">
      <h1 className="page-title">Khóa học của tôi</h1>
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
