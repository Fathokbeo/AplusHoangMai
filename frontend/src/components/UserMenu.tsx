import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Home, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Nút tài khoản (ảnh đại diện + tên) — bấm vào hiện thông tin tài khoản và các lựa chọn:
//   • trong hệ thống (place="app"): Về trang chủ · Đăng xuất
//   • ở trang giới thiệu (place="public"): Vào học / Vào trang giáo viên / Vào trang quản trị · Đăng xuất
// tone="dark": dùng trên nền tối (thanh điều hướng trong suốt của trang chủ).

export const ROLE_LABEL = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh' } as const;
export const ROLE_COLOR = { admin: '#C62828', teacher: '#1565C0', student: '#2E7D32' } as const;
export const ENTER_LABEL = { admin: 'Vào trang quản trị', teacher: 'Vào trang giáo viên', student: 'Vào học' } as const;

export function Avatar({ name, role, size = 26 }: { name?: string; role?: keyof typeof ROLE_COLOR; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: role ? ROLE_COLOR[role] : '#888',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: size * 0.42,
    }}>
      {name?.trim()?.[0]?.toUpperCase() || 'U'}
    </span>
  );
}

export default function UserMenu({ place, tone = 'light' }: { place: 'app' | 'public'; tone?: 'light' | 'dark' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Đóng khi bấm ra ngoài, nhấn Esc, hoặc chuyển trang
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);

  if (!user) return null;
  const dark = tone === 'dark';

  const handleLogout = () => {
    setOpen(false);
    logout();
    if (place === 'app') navigate('/login');
  };

  const item = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 600, color: '#333', textDecoration: 'none', textAlign: 'left' as const };
  const hover = (e: React.MouseEvent<HTMLElement>, on: boolean) => { e.currentTarget.style.background = on ? '#F5F5F5' : 'transparent'; };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Tài khoản"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
          background: dark ? 'rgba(255,255,255,0.1)' : open ? '#EEEEEE' : '#F5F5F5',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.25)' : '#E0E0E0'}`,
          color: dark ? 'white' : '#333', fontSize: '0.85rem', fontWeight: 600, transition: 'background 0.15s',
        }}
      >
        <Avatar name={user.full_name} role={user.role} />
        <span className="hide-mobile" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</span>
        <ChevronDown size={15} style={{ opacity: 0.7, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 260, zIndex: 300, background: 'white',
          borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', border: '1px solid #EEE', overflow: 'hidden',
        }}>
          {/* Tài khoản */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 12px', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
            <Avatar name={user.full_name} role={user.role} size={42} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
              <div style={{ fontSize: '0.78rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{user.username}</div>
              <span style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', fontWeight: 700, color: ROLE_COLOR[user.role], background: `${ROLE_COLOR[user.role]}14`, borderRadius: 99, padding: '1px 8px' }}>
                {ROLE_LABEL[user.role]}
              </span>
            </div>
          </div>

          <div style={{ padding: 6 }}>
            {place === 'app' ? (
              <Link to="/" role="menuitem" style={item} onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <Home size={17} color="#666" /> Về trang chủ
              </Link>
            ) : (
              <Link to={`/${user.role}/overview`} role="menuitem" style={{ ...item, color: '#C62828' }} onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <LayoutDashboard size={17} /> {ENTER_LABEL[user.role]}
              </Link>
            )}
            <div style={{ height: 1, background: '#F0F0F0', margin: '4px 6px' }} />
            <button type="button" role="menuitem" onClick={handleLogout} style={{ ...item, color: '#C62828' }} onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
              <LogOut size={17} /> Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
