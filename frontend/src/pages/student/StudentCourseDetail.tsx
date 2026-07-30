import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../lib/api';
import { toast } from '../../components/Toast';
import { ArrowLeft, School, BookOpen, ChevronRight, Trophy } from 'lucide-react';

// Màu huy hiệu xếp hạng: top 1 vàng, 2 bạc, 3 đồng, còn lại tím
function rankStyle(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: '#FFF8E1', color: '#F9A825' };
  if (rank === 2) return { bg: '#F5F5F5', color: '#9E9E9E' };
  if (rank === 3) return { bg: '#FBE9E7', color: '#D84315' };
  return { bg: '#F3E5F5', color: '#6A1B9A' };
}

export default function StudentCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);

  useEffect(() => {
    api.get(`/student/my-courses/${courseId}`)
      .then((r) => setCourse(r.data))
      .catch(() => { toast.error('Không thể tải khóa học'); navigate('/student'); });
  }, [courseId]);

  if (!course) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#999' }}>Đang tải...</div>
  );

  const classes: any[] = course.classes || [];

  return (
    <div className="fade-in">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/student')} style={{ marginBottom: '1rem', gap: 6 }}>
        <ArrowLeft size={15} /> Quay lại
      </button>

      {/* Course header */}
      <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '1.5rem' }}>
        {course.thumbnail ? (
          <img src={`/uploads/courses/${course.thumbnail}`} alt={course.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
        ) : (
          <div style={{ height: 140, background: 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={40} color="rgba(255,255,255,0.8)" />
          </div>
        )}
        <div style={{ padding: '1.25rem' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: '#1A1A2E' }}>{course.title}</h1>
          {course.description && <p style={{ margin: '0 0 12px', color: '#666', fontSize: '0.9rem' }}>{course.description}</p>}
          <div style={{ display: 'flex', gap: 16, fontSize: '0.83rem', color: '#888' }}>
            <span><School size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{classes.length} lớp học của bạn</span>
          </div>
        </div>
      </div>

      <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>Lớp học của bạn trong khóa này</h2>

      {classes.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#999' }}>
          <School size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>Bạn chưa có lớp nào trong khóa học này</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {classes.map((cls: any) => (
            <div key={cls.id} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 38, height: 38, background: '#FFEBEE', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <School size={18} color="#C62828" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E' }}>{cls.title}</h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#888' }}>GV: {cls.teacher_name}</p>
                </div>
              </div>
              {cls.my_rank ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, ...rankStyle(cls.my_rank) }}>
                    <Trophy size={12} /> Hạng {cls.my_rank}/{cls.rank_total}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#E65100', fontWeight: 700 }}>Điểm TB: {cls.my_avg ?? '—'}</span>
                </div>
              ) : (
                <div style={{ fontSize: '0.74rem', color: '#bbb', marginBottom: 10 }}>Chưa có điểm tháng này</div>
              )}
              <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: '#888', borderTop: '1px solid #F5F5F5', paddingTop: 10, marginBottom: 12 }}>
                <span>{cls.lesson_count} bài giảng</span>
                <span>{cls.submitted_count}/{cls.homework_count} bài đã nộp</span>
              </div>
              <Link to={`/student/classes/${cls.id}`} style={{ textDecoration: 'none' }}>
                <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                  Vào lớp học <ChevronRight size={13} />
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
