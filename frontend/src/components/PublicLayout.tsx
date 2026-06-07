import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Phone, MapPin, Clock, Mail, ExternalLink, Menu, X, LogIn, LogOut, User } from 'lucide-react';

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

  const handleLogout = () => { logout(); setNavOpen(false); };
  const dashLink = user ? `/${user.role}` : '/login';
  // Trang chủ trong suốt khi chưa cuộn; các trang con luôn nền trắng
  const solid = scrolled || pathname !== '/';

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', display: 'flex', flexDirection: 'column' }}>
      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: solid ? 'white' : 'linear-gradient(180deg, rgba(26,26,46,0.95) 0%, rgba(26,26,46,0.85) 100%)',
        backdropFilter: 'blur(12px)',
        boxShadow: solid ? '0 2px 12px rgba(0,0,0,0.1)' : 'none',
        transition: 'all 0.3s', padding: '0 2rem',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 44, borderRadius: 8 }} />
            <div>
              <div style={{ color: solid ? '#C62828' : 'white', fontWeight: 800, fontSize: '1rem', lineHeight: 1.1 }}>APLUS HOÀNG MAI</div>
              <div style={{ color: solid ? '#888' : 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>Trung Tâm Giáo Dục</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
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

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                <Link to={dashLink} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                  <User size={14} />{user.role === 'admin' ? 'Quản trị' : user.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </Link>
                <button className="btn btn-ghost btn-sm" style={{ color: solid ? '#555' : 'white', borderColor: solid ? '#DDD' : 'rgba(255,255,255,0.3)' }} onClick={handleLogout}>
                  <LogOut size={14} /> Đăng xuất
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}><LogIn size={14} /> Đăng nhập</Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setNavOpen(!navOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: solid ? '#333' : 'white', display: 'none' }} className="mobile-menu-btn">
            {navOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {navOpen && (
          <div style={{ background: 'white', borderTop: '1px solid #EEE', padding: '1rem 2rem' }}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: n.to === pathname ? '#C62828' : '#333', textDecoration: 'none', fontWeight: 600 }}>{n.label}</Link>
            ))}
            <a href="#contact" onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: '#333', textDecoration: 'none', fontWeight: 500 }}>Liên hệ</a>
            {user ? (
              <>
                <Link to={dashLink} onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: '#C62828', fontWeight: 600 }}>Vào hệ thống</Link>
                <button onClick={handleLogout} style={{ background: 'none', border: 'none', padding: '0.6rem 0', color: '#666', fontWeight: 500, cursor: 'pointer', width: '100%', textAlign: 'left' }}>Đăng xuất</button>
              </>
            ) : (
              <Link to="/login" onClick={() => setNavOpen(false)} style={{ display: 'block', padding: '0.6rem 0', color: '#C62828', fontWeight: 600 }}>Đăng nhập</Link>
            )}
          </div>
        )}
      </nav>

      {/* Page content */}
      <div style={{ flex: 1 }}>{children}</div>

      {/* Contact */}
      <section id="contact" style={{ background: '#F0F0F3', padding: '2.5rem 2rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
