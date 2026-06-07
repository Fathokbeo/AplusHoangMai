import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, BookOpen, GraduationCap, Image, LogOut,
  ChevronLeft, School, LayoutTemplate
} from 'lucide-react';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const adminNav = [
    { to: '/admin', icon: LayoutDashboard, label: 'Tổng quan' },
    { to: '/admin/users', icon: Users, label: 'Quản lý tài khoản' },
    { to: '/admin/courses', icon: BookOpen, label: 'Khóa học' },
    { to: '/admin/classes', icon: School, label: 'Lớp học' },
    { to: '/admin/content', icon: LayoutTemplate, label: 'Nội dung trang' },
    { to: '/admin/ads', icon: Image, label: 'Quảng cáo' },
  ];

  const teacherNav = [
    { to: '/teacher', icon: LayoutDashboard, label: 'Khóa học của tôi' },
    { to: '/teacher/students', icon: GraduationCap, label: 'Học sinh' },
  ];

  const studentNav = [
    { to: '/student', icon: LayoutDashboard, label: 'Tổng quan' },
    { to: '/student/classes', icon: School, label: 'Lớp học của tôi' },
  ];

  const navItems = user?.role === 'admin' ? adminNav : user?.role === 'teacher' ? teacherNav : studentNav;

  const roleLabel = user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'teacher' ? 'Giáo viên' : 'Học sinh';
  const roleBadgeColor = user?.role === 'admin' ? '#C62828' : user?.role === 'teacher' ? '#1565C0' : '#2E7D32';

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-90 md:hidden" onClick={onMobileClose} />
      )}

      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        style={{ zIndex: 100 }}
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/logo.jpg" alt="Logo" style={{ height: 44, borderRadius: 8 }} />
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.2 }}>APLUS</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem' }}>HOÀNG MAI</div>
              </div>
            </div>
            <button
              onClick={onToggle}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        {/* User info */}
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: roleBadgeColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: '0.95rem', flexShrink: 0
            }}>
              {user?.full_name?.[0] || 'U'}
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2 }}>{user?.full_name}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{roleLabel}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="nav-section">Menu</div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to.split('/').length <= 2}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onMobileClose}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleLogout}
            className="nav-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,100,100,0.8)', justifyContent: 'flex-start' }}
          >
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>
    </>
  );
}
