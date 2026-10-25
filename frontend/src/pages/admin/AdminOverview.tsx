import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Users, BookOpen, School, GraduationCap, ClipboardList, FileCheck, TrendingUp, ChevronRight } from 'lucide-react';
import TeachingOverview from '../../components/TeachingOverview';
import { greeting, todayLabel, SectionHeader, EmptyState } from '../../components/overviewUi';

// Trang "Tổng quan" của admin: số liệu toàn trung tâm, thao tác nhanh, danh sách lớp và khóa học.
export default function AdminOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [courses, setCourses] = useState<any[] | null>(null);
  const [summary, setSummary] = useState(' ');

  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
    api.get('/teacher/my-courses').then((r) => setCourses(r.data)).catch(() => setCourses([]));
  }, []);

  const onLoad = (ov: any) => {
    const toGrade = (ov.classes || []).reduce((s: number, c: any) => s + (c.to_grade || 0), 0);
    setSummary(toGrade > 0 ? `Toàn trung tâm có ${toGrade} bài nộp đang chờ chấm.` : 'Không có bài nộp nào đang chờ chấm.');
  };

  const cards = stats ? [
    { label: 'Học sinh', value: stats.totalStudents, icon: GraduationCap, color: '#C62828', bg: '#FFEBEE', link: '/admin/users?role=student' },
    { label: 'Giáo viên', value: stats.totalTeachers, icon: Users, color: '#1565C0', bg: '#E3F2FD', link: '/admin/users?role=teacher' },
    { label: 'Khóa học', value: stats.totalCourses, icon: BookOpen, color: '#2E7D32', bg: '#E8F5E9', link: '/admin/courses' },
    { label: 'Lớp học', value: stats.totalClasses, icon: School, color: '#E65100', bg: '#FFF3E0', link: '/admin/classes' },
    { label: 'Bài tập', value: stats.totalHomework, icon: ClipboardList, color: '#6A1B9A', bg: '#F3E5F5' },
    { label: 'Bài nộp', value: stats.totalSubmissions, icon: FileCheck, color: '#00695C', bg: '#E0F2F1' },
  ] : [];

  const quickActions = (
    <section>
      <SectionHeader title="Thao tác nhanh" />
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Link to="/admin/users" className="btn btn-primary">
          <Users size={16} /> Quản lý tài khoản
        </Link>
        <Link to="/admin/courses" className="btn btn-secondary">
          <BookOpen size={16} /> Quản lý khóa học
        </Link>
        <Link to="/admin/ads" className="btn btn-success">
          <TrendingUp size={16} /> Quản lý quảng cáo
        </Link>
      </div>
    </section>
  );

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#C62828', fontWeight: 600, textTransform: 'capitalize' }}>{todayLabel()}</div>
        <h1 className="page-title" style={{ margin: '2px 0 0' }}>{greeting()}, {user?.full_name}!</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.9rem' }}>{summary}</p>
      </div>

      {cards.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: '2rem' }}>
          {cards.map(({ label, value, icon: Icon, color, bg, link }) => {
            const body = (
              <>
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <div>
                  <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </>
            );
            return link ? (
              <Link key={label} to={link} className="stat-card" style={{ textDecoration: 'none', flex: '1 1 180px' }}>{body}</Link>
            ) : (
              <div key={label} className="stat-card" style={{ flex: '1 1 180px' }}>{body}</div>
            );
          })}
        </div>
      )}

      <TeachingOverview onLoad={onLoad} replaceDeadlines={quickActions} />

      {/* Khóa học: bấm để vào khóa */}
      {courses && (
        <section style={{ marginTop: '2rem' }}>
          <SectionHeader title="Khóa học của tôi" count={courses.length}
            action={<Link to="/admin/courses" style={{ fontSize: '0.85rem', color: '#C62828', fontWeight: 600, textDecoration: 'none' }}>Quản lý</Link>} />
          {courses.length === 0 ? (
            <EmptyState icon={<BookOpen size={30} />} title="Chưa có khóa học nào" text="Tạo khóa học trong mục Khóa học." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {courses.map((c) => (
                <Link key={c.id} to={`/admin/courses/${c.id}`}
                  style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', textDecoration: 'none', color: 'inherit', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.11)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; }}
                >
                  {c.thumbnail ? (
                    <img src={`/uploads/courses/${c.thumbnail}`} alt={c.title} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ height: 90, background: 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={28} color="rgba(255,255,255,0.8)" />
                    </div>
                  )}
                  <div style={{ padding: '0.9rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E', flex: 1 }}>{c.title}</h3>
                      <ChevronRight size={16} color="#CCC" />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.78rem', color: '#999', marginTop: 8 }}>
                      <span><School size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{c.class_count || 0} lớp</span>
                      <span><Users size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{c.student_count || 0} học sinh</span>
                      {c.creator_name && <span>GV: {c.creator_name}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
