import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Users, BookOpen, School, GraduationCap } from 'lucide-react';
import TeachingOverview from '../../components/TeachingOverview';
import { greeting, todayLabel } from '../../components/overviewUi';

// Trang "Tổng quát" của admin: số liệu toàn trung tâm + việc trong ngày, bài sắp đến hạn của MỌI lớp.
export default function AdminOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [summary, setSummary] = useState(' ');

  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const onLoad = (ov: any) => {
    const parts: string[] = [];
    const today = (ov.today || []).length;
    parts.push(today ? `Toàn trung tâm hôm nay có ${today} bài đến hạn` : 'Hôm nay không có bài nào đến hạn');
    const toGrade = (ov.classes || []).reduce((s: number, c: any) => s + (c.to_grade || 0), 0);
    if (toGrade > 0) parts.push(`${toGrade} bài nộp đang chờ chấm`);
    setSummary(parts.join(' · ') + '.');
  };

  const cards = stats ? [
    { label: 'Học sinh', value: stats.totalStudents, icon: GraduationCap, color: '#C62828', bg: '#FFEBEE', link: '/admin/users?role=student' },
    { label: 'Giáo viên', value: stats.totalTeachers, icon: Users, color: '#1565C0', bg: '#E3F2FD', link: '/admin/users?role=teacher' },
    { label: 'Khóa học', value: stats.totalCourses, icon: BookOpen, color: '#2E7D32', bg: '#E8F5E9', link: '/admin/courses' },
    { label: 'Lớp học', value: stats.totalClasses, icon: School, color: '#E65100', bg: '#FFF3E0', link: '/admin/classes' },
  ] : [];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#C62828', fontWeight: 600, textTransform: 'capitalize' }}>{todayLabel()}</div>
        <h1 className="page-title" style={{ margin: '2px 0 0' }}>{greeting()}, {user?.full_name}!</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.9rem' }}>{summary}</p>
      </div>

      {cards.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: '2rem' }}>
          {cards.map(({ label, value, icon: Icon, color, bg, link }) => (
            <Link key={label} to={link} className="stat-card" style={{ textDecoration: 'none', flex: '1 1 180px' }}>
              <div className="stat-icon" style={{ background: bg }}>
                <Icon size={22} style={{ color }} />
              </div>
              <div>
                <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
                <div className="stat-label">{label}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <TeachingOverview onLoad={onLoad} />
    </div>
  );
}
