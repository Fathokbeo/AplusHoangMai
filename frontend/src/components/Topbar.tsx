import { Menu } from 'lucide-react';
import UserMenu from './UserMenu';

interface Props {
  onMenuClick: () => void;
  title?: string;
}

export default function Topbar({ onMenuClick, title }: Props) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onMenuClick}
          className="btn btn-ghost btn-icon"
          title="Toggle menu"
        >
          <Menu size={20} />
        </button>
        {title && (
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1A1A2E' }}>{title}</h1>
        )}
      </div>

      {/* Tài khoản: bấm vào để xem thông tin, về trang chủ hoặc đăng xuất */}
      <UserMenu place="app" />
    </header>
  );
}
