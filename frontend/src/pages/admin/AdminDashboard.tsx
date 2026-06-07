import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Users, BookOpen, School, ClipboardList, TrendingUp, FileCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data));
  }, []);

  const cards = stats ? [
    { label: 'Học sinh', value: stats.totalStudents, icon: Users, color: '#C62828', bg: '#FFEBEE', link: '/admin/users?role=student' },
    { label: 'Giáo viên', value: stats.totalTeachers, icon: Users, color: '#1565C0', bg: '#E3F2FD', link: '/admin/users?role=teacher' },
    { label: 'Khóa học', value: stats.totalCourses, icon: BookOpen, color: '#2E7D32', bg: '#E8F5E9', link: '/admin/courses' },
    { label: 'Lớp học', value: stats.totalClasses, icon: School, color: '#E65100', bg: '#FFF3E0', link: '/admin/classes' },
    { label: 'Bài tập', value: stats.totalHomework, icon: ClipboardList, color: '#6A1B9A', bg: '#F3E5F5', link: '#' },
    { label: 'Bài nộp', value: stats.totalSubmissions, icon: FileCheck, color: '#00695C', bg: '#E0F2F1', link: '#' },
  ] : [];

  return (
    <div className="fade-in">
      <h1 className="page-title">Tổng quan</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: '2rem' }}>
        {cards.map(({ label, value, icon: Icon, color, bg, link }) => (
          <Link key={label} to={link} style={{ textDecoration: 'none' }}>
            <div className="stat-card" style={{ transition: 'transform 0.2s', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
            >
              <div className="stat-icon" style={{ background: bg }}>
                <Icon size={22} style={{ color }} />
              </div>
              <div>
                <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
                <div className="stat-label">{label}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2 className="section-title">Thao tác nhanh</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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
      </div>
    </div>
  );
}
