import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import UserMenu from './UserMenu';

interface Props {
  onMenuClick?: () => void;
  title?: string;
  // Điện thoại: không có nút ☰ (menu nằm ở thanh tab dưới đáy) — hiện logo + tên trung tâm thay vào
  mobile?: boolean;
}

export default function Topbar({ onMenuClick, title, mobile = false }: Props) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {mobile ? (
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', minWidth: 0 }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 34, borderRadius: 7, flexShrink: 0 }} />
            <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#1A1A2E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>APLUS Hoàng Mai</span>
          </Link>
        ) : (
          <button
            onClick={onMenuClick}
            className="btn btn-ghost btn-icon"
            title="Toggle menu"
          >
            <Menu size={20} />
          </button>
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
