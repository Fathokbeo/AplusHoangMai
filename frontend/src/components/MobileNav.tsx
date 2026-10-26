import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { HOME_ITEM, navItemsFor, isNavActive, type NavItem } from '../lib/navItems';
import { Avatar, ROLE_LABEL } from './UserMenu';

// Điện thoại: thanh tab cố định dưới đáy màn hình (thay cho thanh menu trượt bên trái).
// Hiện tối đa 4 mục chính + nút "Thêm"; bấm "Thêm" mở bảng có tài khoản, đủ các mục, Trang chủ và Đăng xuất.

export const MOBILE_TABBAR_H = 62;
const MAX_TABS = 4;
const ACTIVE = '#C62828';

export default function MobileNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const items = navItemsFor(user?.role);
  const tabs = items.slice(0, MAX_TABS);

  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [more]);

  if (!user) return null;

  const handleLogout = () => { setMore(false); logout(); navigate('/login'); };

  const sheetRow = (item: NavItem) => {
    const active = isNavActive(item, pathname);
    const Icon = item.icon;
    return (
      <Link key={item.to} to={item.to} onClick={() => setMore(false)} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
        fontSize: '0.92rem', fontWeight: active ? 700 : 500, color: active ? ACTIVE : '#333', background: active ? '#FFEBEE' : 'transparent',
      }}>
        <Icon size={19} strokeWidth={1.8} /> {item.label}
      </Link>
    );
  };

  return (
    <>
      {more && (
        <>
          <div onClick={() => setMore(false)} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.25)' }} />
          <div role="dialog" aria-label="Thêm" style={{
            position: 'fixed', left: 10, right: 10, zIndex: 150,
            bottom: `calc(${MOBILE_TABBAR_H + 10}px + env(safe-area-inset-bottom))`,
            maxHeight: `calc(100vh - ${MOBILE_TABBAR_H + 40}px)`, overflowY: 'auto',
            background: 'white', borderRadius: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: 8,
          }}>
            {/* Tài khoản */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 12px', borderBottom: '1px solid #F0F0F0', marginBottom: 6 }}>
              <Avatar name={user.full_name} role={user.role} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ROLE_LABEL[user.role]} · {user.username}</div>
              </div>
            </div>
            {items.map(sheetRow)}
            <div style={{ height: 1, background: '#F0F0F0', margin: '6px 4px' }} />
            {sheetRow(HOME_ITEM)}
            <button type="button" onClick={handleLogout} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 500, color: ACTIVE, textAlign: 'left',
            }}>
              <LogOut size={19} strokeWidth={1.8} /> Đăng xuất
            </button>
          </div>
        </>
      )}

      <nav aria-label="Menu chính" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 160, background: 'white', borderTop: '1px solid #EEEEEE',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'grid', gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
      }}>
        {tabs.map((item) => {
          const active = !more && isNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} style={{
              height: MOBILE_TABBAR_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              textDecoration: 'none', color: active ? ACTIVE : '#777', fontSize: '0.7rem', fontWeight: active ? 700 : 500,
            }}>
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{item.short}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} style={{
          height: MOBILE_TABBAR_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          color: more ? ACTIVE : '#777', fontSize: '0.7rem', fontWeight: more ? 700 : 500,
        }}>
          <Menu size={22} strokeWidth={more ? 2.2 : 1.8} />
          <span>Thêm</span>
        </button>
      </nav>
    </>
  );
}
