import { Menu, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onMenuClick: () => void;
  title?: string;
}

export default function Topbar({ onMenuClick, title }: Props) {
  const { user } = useAuth();

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link to="/" className="btn btn-ghost btn-sm" title="Trang chủ">
          <Home size={16} />
        </Link>
        <div style={{
          background: '#F5F5F5',
          border: '1px solid #E0E0E0',
          borderRadius: 99,
          padding: '4px 12px',
          fontSize: '0.82rem',
          color: '#555',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: user?.role === 'admin' ? '#C62828' : user?.role === 'teacher' ? '#1565C0' : '#2E7D32',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '0.72rem', fontWeight: 700
          }}>
            {user?.full_name?.[0] || 'U'}
          </div>
          {user?.full_name}
        </div>
      </div>
    </header>
  );
}
