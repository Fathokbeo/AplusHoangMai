import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdCarousel from '../components/AdCarousel';
import PublicLayout from '../components/PublicLayout';
import FacebookIcon from '../components/FacebookIcon';
import api from '../lib/api';
import { PAGE_MAX } from '../lib/layout';
import { BookOpen, ChevronRight, ChevronDown, Trophy, Users, GraduationCap, Award, Calendar, UserCircle, Phone } from 'lucide-react';

/* Mỗi mục = 1 ô thống kê ở trên + 1 khối nội dung ngay trên trang chủ.
   Bấm vào ô thống kê sẽ cuộn xuống đúng khối đó (không mở trang khác). */
const SECTIONS = [
  { id: 'hoc-sinh', nav: 'Học sinh tiêu biểu', statLabel: 'Học sinh', statKey: 'stats_students', statFallback: '500+', icon: Trophy, color: '#C62828', bg: '#FFEBEE' },
  { id: 'giao-vien', nav: 'Đội ngũ giáo viên', statLabel: 'Giáo viên', statKey: 'stats_teachers', statFallback: '20+', icon: GraduationCap, color: '#1565C0', bg: '#E3F2FD' },
  { id: 'khoa-hoc', nav: 'Khóa học tiêu biểu', statLabel: 'Khóa học', statKey: 'stats_courses', statFallback: '15+', icon: BookOpen, color: '#2E7D32', bg: '#E8F5E9' },
  { id: 'kinh-nghiem', nav: 'Kinh nghiệm', statLabel: 'Năm kinh nghiệm', statKey: 'stats_years', statFallback: '10+', icon: Users, color: '#E65100', bg: '#FFF3E0' },
];

const SCROLL_OFFSET = 86; // chừa chỗ cho thanh điều hướng dính ở trên

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
  window.scrollTo({ top, behavior: 'smooth' });
  history.replaceState(null, '', `#${id}`);
}

function Section({ id, title, subtitle, icon: Icon, color, alt, children }: any) {
  return (
    <section id={id} style={{ background: alt ? 'white' : 'transparent', scrollMarginTop: SCROLL_OFFSET, padding: '2.25rem 2rem' }}>
      <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={22} color={color} /> {title}
          </h2>
          {subtitle && <p style={{ margin: '6px 0 0', color: '#888', fontSize: '0.9rem' }}>{subtitle}</p>}
          <div style={{ width: 52, height: 3, background: color, borderRadius: 2, marginTop: 12 }} />
        </div>
        {children}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', color: '#999', padding: '2.5rem', background: '#FAFAFA', border: '1px dashed #E0E0E0', borderRadius: 12 }}>{text}</div>;
}

function StaffGrid({ list }: { list: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
      {list.map((s) => (
        <div key={s.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
          {s.image ? (
            <img src={`/uploads/staff/${s.image}`} alt={s.name} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
          ) : (
            <div style={{ height: 220, background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCircle size={56} color="#1565C0" />
            </div>
          )}
          <div style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{s.name}</h3>
            {s.role_title && <div style={{ color: '#1565C0', fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>{s.role_title}</div>}
            {s.description && <p style={{ margin: 0, fontSize: '0.83rem', color: '#777', lineHeight: 1.5 }}>{s.description}</p>}
            {(s.phone || s.facebook_url) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {s.phone && (
                  <a href={`tel:${String(s.phone).replace(/[^+\d]/g, '')}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                    <Phone size={13} /> {s.phone}
                  </a>
                )}
                {s.facebook_url && (
                  <a href={s.facebook_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                    <FacebookIcon size={13} /> Facebook
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { hash } = useLocation();
  const [ads, setAds] = useState([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/public/ads').then((r) => setAds(r.data)).catch(() => {});
    api.get('/public/settings').then((r) => setSettings(r.data)).catch(() => {});
    Promise.all([
      api.get('/public/courses').then((r) => setCourses(r.data)).catch(() => {}),
      api.get('/public/featured-students').then((r) => setStudents(r.data)).catch(() => {}),
      api.get('/public/staff').then((r) => setStaff(r.data)).catch(() => {}),
      api.get('/public/achievements').then((r) => setAchievements(r.data)).catch(() => {}),
    ]).finally(() => setReady(true));
  }, []);

  // Vào trang kèm #hoc-sinh, #giao-vien... thì cuộn tới đúng mục sau khi nội dung đã tải
  useEffect(() => {
    if (!ready || !hash) return;
    const id = hash.slice(1);
    const t = setTimeout(() => scrollToSection(id), 80);
    return () => clearTimeout(t);
  }, [ready, hash]);

  const teachers = staff.filter((s) => s.staff_type !== 'assistant');
  const assistants = staff.filter((s) => s.staff_type === 'assistant');

  return (
    <PublicLayout>
      {/* Hero / Carousel */}
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '2rem 2rem 0' }}>
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

      {/* Thống kê — mỗi ô là lối tắt cuộn xuống mục tương ứng bên dưới */}
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '1.5rem 2rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          {SECTIONS.map(({ id, nav, statLabel, statKey, statFallback, icon: Icon, color, bg }) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToSection(id); }}
              style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: `3px solid ${color}`,
                height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}>
                <div style={{ padding: '1.15rem 1rem 0.9rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{settings[statKey] || statFallback}</div>
                  <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 4 }}>{statLabel}</div>
                </div>
                <div style={{ borderTop: '1px solid #F0F0F0', padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                  <div style={{ width: 32, height: 32, background: bg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={17} color={color} />
                  </div>
                  <div style={{ fontWeight: 700, color: '#1A1A2E', fontSize: '0.83rem' }}>{nav}</div>
                  <ChevronDown size={16} color="#bbb" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* 1. Học sinh tiêu biểu */}
      <Section id="hoc-sinh" title="Học sinh tiêu biểu" subtitle="Những gương mặt xuất sắc đạt điểm cao trong các kỳ thi" icon={Trophy} color="#C62828">
        {students.length === 0 ? <Empty text="Chưa có thông tin học sinh tiêu biểu" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {students.map((s) => (
              <div key={s.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                {s.image ? (
                  <img src={`/uploads/featured_students/${s.image}`} alt={s.name} style={{ width: '100%', height: 240, objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: 240, background: 'linear-gradient(135deg, #FFEBEE, #FFCDD2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trophy size={48} color="#C62828" />
                  </div>
                )}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{s.name}</h3>
                  {s.exam && <span className="badge badge-red" style={{ marginBottom: 8 }}>{s.exam}</span>}
                  {s.achievement && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#C62828', fontWeight: 700, fontSize: '0.95rem', margin: '8px 0' }}>
                      <Award size={16} /> {s.achievement}
                    </div>
                  )}
                  {s.description && <p style={{ margin: 0, fontSize: '0.85rem', color: '#777', lineHeight: 1.5 }}>{s.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 2. Đội ngũ giáo viên & trợ giảng */}
      <Section id="giao-vien" title="Đội ngũ Giáo viên & Trợ giảng" subtitle="Tận tâm, giàu kinh nghiệm, đồng hành cùng học sinh" icon={GraduationCap} color="#1565C0" alt>
        {staff.length === 0 ? <Empty text="Chưa có thông tin đội ngũ" /> : (
          <>
            {teachers.length > 0 && (
              <>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E', margin: '0 0 1rem' }}>Giáo viên</h3>
                <StaffGrid list={teachers} />
              </>
            )}
            {assistants.length > 0 && (
              <>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E', margin: '2rem 0 1rem' }}>Trợ giảng</h3>
                <StaffGrid list={assistants} />
              </>
            )}
          </>
        )}
      </Section>

      {/* 3. Khóa học tiêu biểu = chính danh sách khóa học của trung tâm */}
      <Section id="khoa-hoc" title="Các khóa học" subtitle="Các khóa học đang mở tại trung tâm" icon={BookOpen} color="#2E7D32">
        {courses.length === 0 ? <Empty text="Chưa có khóa học nào" /> : (
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
                  {c.student_count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2E7D32', fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>
                      <Users size={15} /> {c.student_count} học sinh
                    </div>
                  )}
                  {c.description && <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>{c.description}</p>}
                  <Link to={`/courses/${c.id}`} style={{ color: '#C62828', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Xem chi tiết <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 4. Kinh nghiệm & Thành tích */}
      <Section id="kinh-nghiem" title="Kinh nghiệm & Thành tích" subtitle="Hành trình phát triển của trung tâm qua các năm" icon={Award} color="#E65100" alt>
        {achievements.length === 0 ? <Empty text="Chưa có thông tin thành tích" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {achievements.map((a, i) => (
              <div key={a.id} style={{
                background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                border: '1px solid #F0F0F0',
                display: 'flex', flexDirection: i % 2 === 0 ? 'row' : 'row-reverse', flexWrap: 'wrap',
              }}>
                {a.image && (
                  <img src={`/uploads/achievements/${a.image}`} alt={a.title} style={{ width: 320, maxWidth: '100%', height: 220, objectFit: 'cover', flex: '1 1 280px' }} />
                )}
                <div style={{ padding: '1.5rem', flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {a.year && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#E65100', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>
                      <Calendar size={18} /> {a.year}
                    </div>
                  )}
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#1A1A2E' }}>{a.title}</h3>
                  {a.description && <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.6 }}>{a.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Features */}
      <section style={{ background: '#1A1A2E', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', textAlign: 'center' }}>
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
