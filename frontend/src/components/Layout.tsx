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

  // MỘT cây giao diện cho cả điện thoại lẫn máy tính, <Outlet /> luôn ở cùng một chỗ. Trước đây mỗi cỡ màn hình
  // dựng một cây riêng → kéo cửa sổ qua mốc 768px là React gỡ cả trang đang mở rồi dựng lại: form đang điền
  // (vd đang tạo bài tập), bài đang làm… mất sạch. Giờ chỉ ẩn/hiện thanh bên (máy tính) và thanh tab (điện thoại).
  return (
    <div style={isMobile ? undefined : { display: 'flex' }}>
      {!isMobile && (
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      )}
      <div className={`main-content${!isMobile && collapsed ? ' sidebar-collapsed' : ''}${roleClass}`} style={isMobile ? undefined : { flex: 1 }}>
        <Topbar mobile={isMobile} onMenuClick={() => setCollapsed(!collapsed)} />
        <div className="content-area"
          style={isMobile ? { paddingBottom: `calc(${MOBILE_TABBAR_H + 16}px + env(safe-area-inset-bottom))` } : undefined}>
          <HolidayBanner />
          <Outlet />
        </div>
        {/* Điện thoại: không có thanh bên — điều hướng bằng thanh tab dưới đáy màn hình */}
        {isMobile && <MobileNav />}
      </div>
    </div>
  );
}
