import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          if (window.innerWidth < 768) setMobileOpen(!mobileOpen);
          else setCollapsed(!collapsed);
        }} />
        <div className="content-area">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
