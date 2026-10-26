import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { PAGE_MAX } from '../lib/layout';
import HolidayBanner from './HolidayBanner';
import UserMenu, { Avatar, ROLE_LABEL, ENTER_LABEL } from './UserMenu';
import { Phone, MapPin, Clock, Mail, ExternalLink, Menu, X, LogIn, LogOut, LayoutDashboard } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Trang chủ' },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    api.get('/public/settings').then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Trang chủ trong suốt khi chưa cuộn; các trang con luôn nền trắng
  const solid = scrolled || pathname !== '/';

  return (
    <div className="public-root" style={{ minHeight: '100vh', background: '#F5F5F5', display: 'flex', flexDirection: 'column' }}>
      {/* Navbar */}
      <nav className="public-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: solid ? 'white' : 'linear-gradient(180deg, rgba(26,26,46,0.95) 0%, rgba(26,26,46,0.85) 100%)',
        backdropFilter: 'blur(12px)',
        boxShadow: solid ? '0 2px 12px rgba(0,0,0,0.1)' : 'none',
        transition: 'all 0.3s', padding: '0 2rem',
      }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 44, borderRadius: 8 }} />
            <div>
              <div style={{ color: solid ? '#C62828' : 'white', fontWeight: 800, fontSize: '1rem', lineHeight: 1.1 }}>APLUS HOÀNG MAI</div>
              <div style={{ color: solid ? '#888' : 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>Trung Tâm Giáo Dục</div>
            </div>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Desktop nav */}
          <div className="desktop-nav">
            {NAV.map((n) => {
              const active = n.to === pathname;
              return (
                <Link key={n.to} to={n.to} style={{
                  color: active ? '#C62828' : solid ? '#444' : 'rgba(255,255,255,0.85)',
                  textDecoration: 'none', fontWeight: active ? 700 : 500, fontSize: '0.9rem',
                  padding: '6px 12px', borderRadius: 8, transition: 'all 0.15s',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = solid ? '#F5F5F5' : 'rgba(255,255,255,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >{n.label}</Link>
              );
            })}
            <a href="#contact" style={{ color: solid ? '#444' : 'rgba(255,255,255,0.85)', textDecoration: 'none', fontWeight: 500, fontSize: '0.9rem', padding: '6px 12px', borderRadius: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = solid ? '#F5F5F5' : 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >Liên hệ</a>

            {!user && (
              <Link to="/login" className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}><LogIn size={14} /> Đăng nhập</Link>
            )}
          </div>

          {/* Đã đăng nhập (máy tính): nút tài khoản — bấm để vào học / đăng xuất.
              Trên điện thoại các lựa chọn này nằm trong menu ☰ */}
          {user && <div className="desktop-nav"><UserMenu place="public" tone={solid ? 'light' : 'dark'} /></div>}

          {/* Điện thoại: "Liên hệ" để ngoài, cạnh nút ☰ */}
          <a href="#contact" className="mobile-only" onClick={() => setNavOpen(false)} style={{ color: solid ? '#444' : 'rgba(255,255,255,0.9)', textDecoration: 'none', fontWeight: 600, fontSize: '0.88rem', padding: '6px 8px' }}>Liên hệ</a>

          {/* Mobile hamburger */}
          <button onClick={() => setNavOpen(!navOpen)} style={{ color: solid ? '#333' : 'white' }} className="mobile-menu-btn">
            {navOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          </div>
        </div>

        {/* Mobile menu */}
        {navOpen && (
          <div style={{ background: 'white', borderTop: '1px solid #EEE', padding: '1rem 2rem' }}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: n.to === pathname ? '#C62828' : '#333', textDecoration: 'none', fontWeight: 600 }}>{n.label}</Link>
            ))}
            {user ? (
              <div style={{ borderTop: '1px solid #EEE', marginTop: 6, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.25rem 0 0.5rem' }}>
                  <Avatar name={user.full_name} role={user.role} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#888' }}>{ROLE_LABEL[user.role]} · {user.username}</div>
                  </div>
                </div>
                <Link to={`/${user.role}/overview`} onClick={() => setNavOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0', color: '#C62828', textDecoration: 'none', fontWeight: 700 }}>
                  <LayoutDashboard size={17} /> {ENTER_LABEL[user.role]}
                </Link>
                <button onClick={() => { logout(); setNavOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '0.6rem 0', color: '#666', fontWeight: 500, fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                  <LogOut size={17} /> Đăng xuất
                </button>
              </div>
            ) : (
              <Link to="/login" onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: '#C62828', fontWeight: 600 }}>Đăng nhập</Link>
            )}
          </div>
        )}
      </nav>
      <div className="hd-banner-public"><HolidayBanner style={{ margin: 0 }} /></div>

      {/* Page content */}
      <div style={{ flex: 1 }}>{children}</div>

      {/* Contact */}
      <section id="contact" style={{ background: '#F0F0F3', padding: '2.5rem 2rem' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1.25rem', color: '#1A1A2E' }}>
            <Phone size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: '#C62828' }} />
            Liên hệ
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { icon: MapPin, label: 'Địa chỉ', value: settings.contact_address },
              { icon: Phone, label: 'Điện thoại', value: settings.contact_phone },
              { icon: Mail, label: 'Email', value: settings.contact_email },
              { icon: Clock, label: 'Giờ học', value: settings.contact_hours },
            ].filter(c => c.value).map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: '#FFF5F5', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} color="#C62828" />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 600, color: '#1A1A2E', fontSize: '0.9rem' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
          {settings.contact_facebook && (
            <a href={settings.contact_facebook} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 16, gap: 6 }}>
              <ExternalLink size={15} /> Fanpage Facebook
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#1A1A2E', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1.5rem', fontSize: '0.82rem' }}>
        © {new Date().getFullYear()} Trung Tâm Giáo Dục APLUS Hoàng Mai. All rights reserved.
      </footer>
    </div>
  );
}
