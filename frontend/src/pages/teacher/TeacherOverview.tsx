import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, School, Users } from 'lucide-react';
import TeachingOverview from '../../components/TeachingOverview';
import { greeting, givenName, todayLabel } from '../../components/overviewUi';

// Trang "Tổng quát" của giáo viên: số khóa/lớp/học sinh, việc trong ngày, bài sắp đến hạn và các lớp đang dạy.
export default function TeacherOverview() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(' ');
  const [courses, setCourses] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/teacher/my-courses').then((r) => setCourses(r.data)).catch(() => setCourses([]));
  }, []);

  const onLoad = (ov: any) => {
    const parts: string[] = [];
    const today = (ov.today || []).length;
    parts.push(today ? `Hôm nay có ${today} bài đến hạn` : 'Hôm nay không có bài nào đến hạn');
    const toGrade = (ov.classes || []).reduce((s: number, c: any) => s + (c.to_grade || 0), 0);
    if (toGrade > 0) parts.push(`${toGrade} bài nộp đang chờ chấm`);
    setSummary(parts.join(' · ') + '.');
  };

  const cards = courses ? [
    { label: 'Khóa học', value: courses.length, icon: BookOpen, color: '#C62828', bg: '#FFEBEE' },
    { label: 'Lớp học', value: courses.reduce((s, c) => s + (c.class_count || 0), 0), icon: School, color: '#1565C0', bg: '#E3F2FD' },
    { label: 'Tổng học sinh', value: courses.reduce((s, c) => s + (c.student_count || 0), 0), icon: Users, color: '#2E7D32', bg: '#E8F5E9', link: '/teacher/students' },
  ] : [];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#C62828', fontWeight: 600, textTransform: 'capitalize' }}>{todayLabel()}</div>
        <h1 className="page-title" style={{ margin: '2px 0 0' }}>{greeting()}, {givenName(user?.full_name)}!</h1>
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
                  <div className="stat-value" style={{ color }}>{value}</div>
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

      <TeachingOverview onLoad={onLoad} />
    </div>
  );
}
