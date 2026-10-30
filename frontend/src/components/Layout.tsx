import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import HolidayBanner from './HolidayBanner';
import MobileNav, { MOBILE_TABBAR_H } from './MobileNav';
import useIsMobile from '../lib/useIsMobile';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  // Máy tính: thanh bên mặc định ẨN, chỉ hiện khi bấm nút ☰ trên thanh trên cùng
  const [collapsed, setCollapsed] = useState(true);
  // 768px: đúng ngưỡng giao diện điện thoại trong index.css
  const isMobile = useIsMobile(768);
  // Trang học sinh: nền chủ đề sáng giống trang chủ (xem holiday.css: .app-student)
  const { user } = useAuth();
  const roleClass = user?.role === 'student' ? ' app-student' : '';

  // Điện thoại: không có thanh bên — điều hướng bằng thanh tab dưới đáy màn hình (MobileNav)
  if (isMobile) {
    return (
      <div className={`main-content${roleClass}`}>
        <Topbar mobile />
        <div className="content-area" style={{ paddingBottom: `calc(${MOBILE_TABBAR_H + 16}px + env(safe-area-inset-bottom))` }}>
          <HolidayBanner />
          <Outlet />
        </div>
        <MobileNav />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}${roleClass}`} style={{ flex: 1 }}>
        <Topbar onMenuClick={() => setCollapsed(!collapsed)} />
        <div className="content-area">
          <HolidayBanner />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
