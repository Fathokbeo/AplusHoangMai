import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdCarousel from '../components/AdCarousel';
import PublicLayout from '../components/PublicLayout';
import api from '../lib/api';
import { BookOpen, ChevronRight, Trophy, Users, GraduationCap } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();
  const [ads, setAds] = useState([]);
  const [courses, setCourses] = useState([]);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    api.get('/public/ads').then((r) => setAds(r.data));
    api.get('/public/courses').then((r) => setCourses(r.data));
    api.get('/public/settings').then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const dashLink = user ? `/${user.role}` : '/login';

  const quickLinks = [
    { to: '/hoc-sinh', icon: Trophy, label: 'Học sinh tiêu biểu', color: '#C62828', bg: '#FFEBEE' },
    { to: '/giao-vien', icon: GraduationCap, label: 'Đội ngũ giáo viên', color: '#1565C0', bg: '#E3F2FD' },
    { to: '/khoa-hoc', icon: BookOpen, label: 'Khóa học tiêu biểu', color: '#2E7D32', bg: '#E8F5E9' },
    { to: '/kinh-nghiem', icon: Users, label: 'Kinh nghiệm', color: '#E65100', bg: '#FFF3E0' },
  ];

  return (
    <PublicLayout>
      {/* Hero / Carousel */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 2rem 0' }}>
        {ads.length > 0 ? (
          <AdCarousel ads={ads} />
        ) : (
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            background: 'linear-gradient(135deg, #1A1A2E, #0F3460)',
            height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            color: 'white', textAlign: 'center', padding: '2rem'
          }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 80, borderRadius: 12, marginBottom: 20 }} />
            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 12px', color: 'white' }}>
              {settings.hero_title || 'Trung Tâm Giáo Dục APLUS Hoàng Mai'}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', maxWidth: 500 }}>
              {settings.hero_subtitle || 'Không để ai bỏ lại — Thay đổi việc học các con là thay đổi tương lai số phận'}
            </p>
          </div>
        )}
      </section>

      {/* Stats bar */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {[
            { label: 'Học sinh', value: settings.stats_students || '500+', color: '#C62828' },
            { label: 'Giáo viên', value: settings.stats_teachers || '20+', color: '#1565C0' },
            { label: 'Khóa học', value: settings.stats_courses || '15+', color: '#2E7D32' },
            { label: 'Năm kinh nghiệm', value: settings.stats_years || '10+', color: '#E65100' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links to public pages */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0.5rem 2rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {quickLinks.map(({ to, icon: Icon, label, color, bg }) => (
            <Link key={to} to={to} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12, transition: 'transform 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = '')}>
                <div style={{ width: 44, height: 44, background: bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={22} color={color} />
                </div>
                <div style={{ fontWeight: 700, color: '#1A1A2E', fontSize: '0.92rem' }}>{label}</div>
                <ChevronRight size={16} color="#bbb" style={{ marginLeft: 'auto' }} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Courses */}
      <section id="courses" style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 2rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1A1A2E' }}>
            <BookOpen size={22} style={{ verticalAlign: 'middle', marginRight: 8, color: '#C62828' }} />
            Các khóa học
          </h2>
        </div>

        {courses.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>Chưa có khóa học nào</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {courses.map((c: any) => (
              <div key={c.id} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'; }}>
                {c.thumbnail ? (
                  <img src={`/uploads/courses/${c.thumbnail}`} alt={c.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: 160, background: 'linear-gradient(135deg, #C62828, #1565C0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={40} color="rgba(255,255,255,0.7)" />
                  </div>
                )}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>{c.title}</h3>
                  {c.description && <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>{c.description}</p>}
                  {user && (
                    <Link to={dashLink} style={{ color: '#C62828', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Xem chi tiết <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section style={{ background: '#1A1A2E', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem', marginBottom: '2rem' }}>Tại sao chọn APLUS Hoàng Mai?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {[
              { icon: '🎓', title: 'Giáo viên giỏi', desc: 'Đội ngũ giáo viên giàu kinh nghiệm, nhiệt tình' },
              { icon: '🤖', title: 'Chấm bài bằng AI', desc: 'Hệ thống AI tự động chấm bài và đưa ra nhận xét' },
              { icon: '📱', title: 'Học mọi lúc', desc: 'Xem bài giảng, nộp bài online tiện lợi' },
              { icon: '📊', title: 'Theo dõi tiến độ', desc: 'Học sinh và phụ huynh dễ dàng theo dõi kết quả' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{icon}</div>
                <div style={{ color: 'white', fontWeight: 700, marginBottom: 8 }}>{title}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
