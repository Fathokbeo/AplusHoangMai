import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import UserMenu from './UserMenu';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onMenuClick?: () => void;
  title?: string;
  // Điện thoại: không có nút ☰ (menu nằm ở thanh tab dưới đáy) — hiện logo + tên trung tâm thay vào
  mobile?: boolean;
}

export default function Topbar({ onMenuClick, title, mobile = false }: Props) {
  const { user } = useAuth();
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {mobile ? (
          <Link to="/" className="topbar-brand" style={{ minWidth: 0, padding: 0 }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 34, borderRadius: 7, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>APLUS Hoàng Mai</span>
          </Link>
        ) : (
          <>
            <button
              onClick={onMenuClick}
              className="btn btn-ghost btn-icon"
              title="Mở / ẩn thanh menu"
            >
              <Menu size={20} />
            </button>
            {/* Logo + tên: bấm để về trang Tổng quan (thanh menu bên trái mặc định ẩn nên cần lối về rõ ràng) */}
            {user && (
              <Link to={`/${user.role}/overview`} className="topbar-brand" title="Về Tổng quan">
                <img src="/logo.jpg" alt="" style={{ height: 32, borderRadius: 7, flexShrink: 0 }} />
                <span>APLUS Hoàng Mai</span>
              </Link>
            )}
          </>
        )}
        {title && (
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1A1A2E' }}>{title}</h1>
        )}
      </div>

      {/* Tài khoản: bấm vào để xem thông tin, về trang chủ hoặc đăng xuất */}
      <UserMenu place="app" />
    </header>
  );
}
