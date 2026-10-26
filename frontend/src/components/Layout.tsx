import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import HolidayBanner from './HolidayBanner';
import useIsMobile from '../lib/useIsMobile';
import useEdgeSwipe from '../lib/useEdgeSwipe';

export default function Layout() {
  // Máy tính: thanh bên mặc định ẨN, chỉ hiện khi bấm nút ☰ trên thanh trên cùng
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  // 768px: đúng ngưỡng thanh bên chuyển sang kiểu điện thoại trong index.css
  const isMobile = useIsMobile(768);

  // Trên điện thoại còn mở/đóng được thanh bên bằng cách vuốt từ mép trái màn hình ra,
  // dùng được cả khi đang thu phóng hay đã kéo trang sang phải (lúc đó nút 3 gạch trôi khỏi tầm nhìn).
  useEdgeSwipe({
    enabled: isMobile,
    isOpen: mobileOpen,
    onOpen: () => setMobileOpen(true),
    onClose: () => setMobileOpen(false),
  });

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`} style={{ flex: 1 }}>
        <Topbar onMenuClick={() => {
          if (isMobile) setMobileOpen(!mobileOpen);
          else setCollapsed(!collapsed);
        }} />
        <div className="content-area">
          <HolidayBanner />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
