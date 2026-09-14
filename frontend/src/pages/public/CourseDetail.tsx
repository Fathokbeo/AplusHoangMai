import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PublicLayout from '../../components/PublicLayout';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/Toast';
import { BookOpen, Users, GraduationCap, LogIn, Lock } from 'lucide-react';

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotEnrolled(false);

    const loadPublic = () => {
      api.get(`/public/courses/${id}`)
        .then((r) => { if (!cancelled) setCourse(r.data); })
        .catch(() => { if (!cancelled) { toast.error('Không tìm thấy khóa học'); navigate('/'); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    if (user?.role === 'student') {
      // Học sinh đã có trong khóa học thì vào thẳng khóa học, không cần xem bản công khai
      api.get(`/student/my-courses/${id}`)
        .then(() => { if (!cancelled) navigate(`/student/courses/${id}`, { replace: true }); })
        .catch(() => { if (!cancelled) { setNotEnrolled(true); loadPublic(); } });
    } else {
      loadPublic();
    }

    return () => { cancelled = true; };
  }, [id, user?.role]);

  if (loading) return (
    <PublicLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#999' }}>Đang tải...</div>
    </PublicLayout>
  );

  if (!course) return null;

  const classes: any[] = course.classes || [];

  return (
    <PublicLayout>
      <div style={{ background: 'linear-gradient(135deg, #1A1A2E, #0F3460)', padding: '3rem 2rem', textAlign: 'center', color: 'white' }}>
        <BookOpen size={40} style={{ marginBottom: 12 }} />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>{course.title}</h1>
        {course.description && <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.85)' }}>{course.description}</p>}
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {notEnrolled && (
          <div style={{ background: '#FFF3E0', border: '1px solid #FFE0B2', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', color: '#E65100', fontSize: '0.9rem' }}>
            Bạn chưa có trong lớp học nào của khóa này. Vui lòng liên hệ trung tâm để được đăng ký.
          </div>
        )}
        {!user && (
          <div style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#1565C0', fontSize: '0.9rem' }}>Đăng nhập để vào học nếu bạn đã có tài khoản trong khóa này.</span>
            <Link to="/login" className="btn btn-primary btn-sm" style={{ gap: 6, whiteSpace: 'nowrap' }}><LogIn size={14} /> Đăng nhập</Link>
          </div>
        )}

        {classes.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>Chưa có lớp học nào cho khóa này</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {classes.map((cls) => (
              <div key={cls.id} style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '1.25rem 1.5rem' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{cls.title}</h3>
                <div style={{ display: 'flex', gap: 20, fontSize: '0.85rem', color: '#666', marginBottom: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GraduationCap size={15} color="#1565C0" /> GV phụ trách: <strong>{cls.teacher_name || 'Chưa cập nhật'}</strong>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={15} color="#2E7D32" /> {cls.student_count} học sinh
                  </span>
                </div>
                <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 12 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#888', marginBottom: 8 }}>Nội dung học</div>
                  {cls.chapters.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#bbb' }}>Chưa cập nhật nội dung</div>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cls.chapters.map((ch: any) => (
                        <li key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', color: '#444' }}>
                          <Lock size={12} color="#ccc" /> {ch.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
