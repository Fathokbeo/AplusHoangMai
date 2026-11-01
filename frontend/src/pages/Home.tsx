import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdCarousel from '../components/AdCarousel';
import PublicLayout from '../components/PublicLayout';
import MonthlyHonorBoard from '../components/MonthlyHonorBoard';
import { SocialLinks } from '../components/SocialIcons';
import api from '../lib/api';
import { PAGE_MAX } from '../lib/layout';
import { BookOpen, ChevronRight, ChevronLeft, Trophy, Users, GraduationCap, Award, Calendar, UserCircle, Phone, Sparkles, X, Images } from 'lucide-react';

/* Mỗi mục = 1 ô số liệu ở dải trên + 1 khối nội dung ngay trên trang chủ.
   Bấm vào ô số liệu sẽ cuộn xuống đúng khối đó (không mở trang khác). */
const SECTIONS = [
  { id: 'hoc-sinh', statLabel: 'Học sinh', statKey: 'stats_students', statFallback: '500+', icon: Trophy, color: '#C62828', bg: '#FFEBEE' },
  { id: 'giao-vien', statLabel: 'Giáo viên', statKey: 'stats_teachers', statFallback: '20+', icon: GraduationCap, color: '#1565C0', bg: '#E3F2FD' },
  { id: 'khoa-hoc', statLabel: 'Khóa học', statKey: 'stats_courses', statFallback: '15+', icon: BookOpen, color: '#2E7D32', bg: '#E8F5E9' },
  { id: 'hoat-dong', statLabel: 'Năm kinh nghiệm', statKey: 'stats_years', statFallback: '10+', icon: Sparkles, color: '#6A1B9A', bg: '#F3E5F5' },
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
    <section id={id} className={alt ? 'home-section-alt' : undefined} style={{ background: alt ? 'white' : 'transparent', scrollMarginTop: SCROLL_OFFSET, padding: '2.25rem 2rem' }}>
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

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E', margin: '0 0 1rem' }}>{children}</h3>;
}

// ── Giáo viên & trợ giảng: ảnh cùng khung vuông 1:1 (khuyên dùng ảnh 600 × 600) ─────────────────
const LEVEL_LABEL: Record<string, string> = { thpt: 'THPT', thcs: 'THCS' };

function StaffGrid({ list }: { list: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
      {list.map((s) => (
        <div key={s.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
          {s.image ? (
            <img src={`/uploads/staff/${s.image}`} alt={s.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ aspectRatio: '1 / 1', background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCircle size={56} color="#1565C0" />
            </div>
          )}
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{s.name}</h3>
            {s.role_title && <div style={{ color: '#1565C0', fontWeight: 600, fontSize: '0.88rem' }}>{s.role_title}</div>}
            {(s.subject || s.level) && (
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                {s.subject && <span className="badge badge-blue">{s.subject}</span>}
                {s.level && LEVEL_LABEL[s.level] && <span className="badge badge-gray">{LEVEL_LABEL[s.level]}</span>}
              </div>
            )}
            {s.description && <p style={{ margin: '8px 0 0', fontSize: '0.83rem', color: '#777', lineHeight: 1.5 }}>{s.description}</p>}
            <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {s.phone && (
                <a href={`tel:${String(s.phone).replace(/[^+\d]/g, '')}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                  <Phone size={13} /> {s.phone}
                </a>
              )}
              <SocialLinks size={30} links={{ facebook: s.facebook_url, instagram: s.instagram_url, tiktok: s.tiktok_url, threads: s.threads_url }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Chia đội ngũ theo loại (giáo viên / trợ giảng) × cấp (THPT / THCS); người chưa chọn cấp vào nhóm chung
function staffGroups(staff: any[]) {
  const groups: { key: string; title: string; list: any[] }[] = [];
  for (const [type, typeLabel] of [['teacher', 'Giáo viên'], ['assistant', 'Trợ giảng']] as const) {
    const ofType = staff.filter((s) => (type === 'assistant' ? s.staff_type === 'assistant' : s.staff_type !== 'assistant'));
    for (const lv of ['thpt', 'thcs']) {
      const list = ofType.filter((s) => s.level === lv);
      if (list.length) groups.push({ key: `${type}-${lv}`, title: `${typeLabel} ${LEVEL_LABEL[lv]}`, list });
    }
    const rest = ofType.filter((s) => !LEVEL_LABEL[s.level]);
    if (rest.length) groups.push({ key: `${type}-other`, title: typeLabel, list: rest });
  }
  return groups;
}

// ── Khóa học: mỗi danh mục 1 hàng ngang, nút mũi tên trượt sang xem thêm ─────────────────
const CATEGORY_ORDER = ['THCS', 'THPT', 'HSA', 'TSA'];

function courseGroups(courses: any[]) {
  const map = new Map<string, any[]>();
  courses.forEach((c) => {
    const k = String(c.category || '').trim() || 'Khóa học khác';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  });
  const rank = (k: string) => { const i = CATEGORY_ORDER.indexOf(k.toUpperCase()); return k === 'Khóa học khác' ? 999 : i === -1 ? 100 : i; };
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'vi'));
}

function CourseCard({ c }: { c: any }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {c.thumbnail ? (
        <img src={`/uploads/courses/${c.thumbnail}`} alt={c.title} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #C62828, #1565C0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BookOpen size={40} color="rgba(255,255,255,0.7)" />
        </div>
      )}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>{c.title}</h3>
        {c.student_count > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2E7D32', fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>
            <Users size={15} /> {c.student_count} học sinh
          </div>
        )}
        {c.description && <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#888', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</p>}
        <Link to={`/courses/${c.id}`} style={{ color: '#C62828', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
          Xem chi tiết <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function CourseRow({ title, list }: { title: string; list: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: true, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft <= 4, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [list.length]);
  const slide = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  const arrow = (dir: 1 | -1, disabled: boolean) => (
    <button type="button" onClick={() => slide(dir)} disabled={disabled} aria-label={dir === 1 ? 'Xem thêm' : 'Quay lại'}
      style={{
        width: 34, height: 34, borderRadius: '50%', border: '1px solid #E0E0E0', background: 'white', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}>
      {dir === 1 ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
    </button>
  );
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E', flex: 1 }}>
          {title} <span style={{ color: '#999', fontWeight: 500, fontSize: '0.9rem' }}>({list.length})</span>
        </h3>
        {!(edge.left && edge.right) && <>{arrow(-1, edge.left)}{arrow(1, edge.right)}</>}
      </div>
      <div ref={ref} onScroll={update} className="hscroll"
        style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'min(280px, 82%)', gap: 18, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 6 }}>
        {list.map((c) => <div key={c.id} style={{ scrollSnapAlign: 'start' }}><CourseCard c={c} /></div>)}
      </div>
    </div>
  );
}

// ── Các hoạt động: hàng xen kẽ ảnh / chữ (như mục Kinh nghiệm cũ), mỗi hoạt động nhiều ảnh ─────
function Lightbox({ images, start, title, onClose }: { images: string[]; start: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % images.length);
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [images.length, onClose]);
  const nav = (d: 1 | -1) => setI((v) => (v + d + images.length) % images.length);
  const btn = { position: 'absolute' as const, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ color: 'white', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>{title} <span style={{ opacity: 0.6, fontWeight: 500 }}>· {i + 1}/{images.length}</span></div>
      <img src={`/uploads/activities/${images[i]}`} alt={title} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, objectFit: 'contain' }} />
      {images.length > 1 && (
        <>
          <button style={{ ...btn, left: 16 }} onClick={(e) => { e.stopPropagation(); nav(-1); }} aria-label="Ảnh trước"><ChevronLeft size={22} /></button>
          <button style={{ ...btn, right: 16 }} onClick={(e) => { e.stopPropagation(); nav(1); }} aria-label="Ảnh sau"><ChevronRight size={22} /></button>
        </>
      )}
      <button onClick={onClose} aria-label="Đóng" style={{ position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
    </div>
  );
}

// Bộ ảnh của 1 hoạt động — khung LUÔN cùng kích thước (class .activity-gallery), chỉ đổi cách chia theo số ảnh:
//   1 ảnh: kín khung · 2 ảnh: chia đôi · 3 ảnh: 1 lớn trái + 2 nhỏ phải · 4 ảnh: 1 lớn trái + 3 nhỏ phải
//   5+ ảnh: 1 lớn trên + 4 nhỏ dưới, ô nhỏ cuối ghi "+N" nếu còn nhiều hơn
function Gallery({ images, title, onOpen }: { images: string[]; title: string; onOpen: (i: number) => void }) {
  const n = images.length;
  const shown = images.slice(0, 5);
  const more = n - 5;
  const layout: React.CSSProperties =
    n === 1 ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
    : n === 2 ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
    : n === 3 ? { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' }
    : n === 4 ? { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr 1fr' }
    : { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'minmax(0, 3fr) minmax(0, 1fr)' };
  // Vị trí ô ảnh lớn (ảnh đầu tiên) trong lưới
  const bigArea: React.CSSProperties =
    n === 3 ? { gridRow: '1 / 3' } : n === 4 ? { gridRow: '1 / 4' } : n >= 5 ? { gridColumn: '1 / -1' } : {};
  return (
    <div className="activity-gallery" style={layout}>
      {shown.map((f, k) => (
        <button type="button" key={f} onClick={() => onOpen(k)} aria-label={k === 0 ? `Xem ảnh ${title}` : `Ảnh ${k + 1}`}
          style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', border: 'none', padding: 0, background: '#EEE', minHeight: 0, ...(k === 0 ? bigArea : {}) }}>
          <img src={`/uploads/activities/${f}`} alt={k === 0 ? title : ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {k === shown.length - 1 && more > 0 && (
            <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', color: 'white', fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+{more}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function Activities({ list }: { list: any[] }) {
  const [box, setBox] = useState<{ images: string[]; start: number; title: string } | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {list.map((a, i) => {
        const images: string[] = a.images || [];
        return (
          <div key={a.id} style={{
            background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #F0F0F0',
            display: 'flex', flexDirection: i % 2 === 0 ? 'row' : 'row-reverse', flexWrap: 'wrap',
          }}>
            {images.length > 0 && (
              <div style={{ flex: '1.3 1 320px', minWidth: 0 }}>
                <Gallery images={images} title={a.title} onOpen={(start) => setBox({ images, start, title: a.title })} />
              </div>
            )}
            <div style={{ padding: '1.5rem', flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {a.event_date && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6A1B9A', fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>
                  <Calendar size={18} /> {a.event_date}
                </div>
              )}
              <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#1A1A2E' }}>{a.title}</h3>
              {a.description && <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{a.description}</p>}
              {images.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 14 }} onClick={() => setBox({ images, start: 0, title: a.title })}>
                  <Images size={14} /> Xem {images.length} ảnh
                </button>
              )}
            </div>
          </div>
        );
      })}
      {box && <Lightbox {...box} onClose={() => setBox(null)} />}
    </div>
  );
}

export default function Home() {
  const { hash } = useLocation();
  const [ads, setAds] = useState([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [topMonthly, setTopMonthly] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/public/ads').then((r) => setAds(r.data)).catch(() => {});
    api.get('/public/settings').then((r) => setSettings(r.data)).catch(() => {});
    Promise.all([
      api.get('/public/courses').then((r) => setCourses(r.data)).catch(() => {}),
      api.get('/public/featured-students').then((r) => setStudents(r.data)).catch(() => {}),
      api.get('/public/top-students').then((r) => setTopMonthly(r.data)).catch(() => {}),
      api.get('/public/staff').then((r) => setStaff(r.data)).catch(() => {}),
      api.get('/public/activities').then((r) => setActivities(r.data)).catch(() => {}),
    ]).finally(() => setReady(true));
  }, []);

  // Vào trang kèm #hoc-sinh, #giao-vien... thì cuộn tới đúng mục sau khi nội dung đã tải
  useEffect(() => {
    if (!ready || !hash) return;
    const id = hash.slice(1) === 'kinh-nghiem' ? 'hoat-dong' : hash.slice(1); // link cũ #kinh-nghiem
    const t = setTimeout(() => scrollToSection(id), 80);
    return () => clearTimeout(t);
  }, [ready, hash]);

  const groups = staffGroups(staff);
  const courseRows = courseGroups(courses);

  return (
    <PublicLayout>
      {/* Banner quảng cáo — tỉ lệ 12:5 (khuyên dùng ảnh 1920 × 800) */}
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '2rem 2rem 0' }}>
        {ads.length > 0 ? (
          <AdCarousel ads={ads} />
        ) : (
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            background: 'linear-gradient(135deg, #1A1A2E, #0F3460)',
            aspectRatio: '12 / 5', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
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

      {/* Số liệu: 1 dải gọn, mỗi ô bấm để cuộn xuống mục tương ứng */}
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '1.25rem 2rem 0.5rem' }}>
        <div className="stats-band">
          {SECTIONS.map(({ id, statLabel, statKey, statFallback, icon: Icon, color, bg }) => (
            <a key={id} href={`#${id}`} className="stats-item" onClick={(e) => { e.preventDefault(); scrollToSection(id); }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={22} color={color} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '1.55rem', fontWeight: 800, color, lineHeight: 1.1 }}>{settings[statKey] || statFallback}</span>
                <span style={{ display: 'block', fontSize: '0.82rem', color: '#888', marginTop: 2 }}>{statLabel}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* 1. Học sinh tiêu biểu */}
      <Section id="hoc-sinh" title="Học sinh tiêu biểu" subtitle="Bảng vàng điểm trung bình theo tháng và những gương mặt xuất sắc đạt điểm cao trong các kỳ thi" icon={Trophy} color="#C62828">
        <MonthlyHonorBoard data={topMonthly} />
        {students.length === 0 ? (topMonthly.length === 0 && <Empty text="Chưa có thông tin học sinh tiêu biểu" />) : (
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

      {/* 2. Đội ngũ giáo viên & trợ giảng — chia theo cấp THPT / THCS */}
      <Section id="giao-vien" title="Đội ngũ Giáo viên & Trợ giảng" subtitle="Tận tâm, giàu kinh nghiệm, đồng hành cùng học sinh" icon={GraduationCap} color="#1565C0" alt>
        {groups.length === 0 ? <Empty text="Chưa có thông tin đội ngũ" /> : groups.map((g, i) => (
          <div key={g.key} style={{ marginTop: i ? '2rem' : 0 }}>
            <SubHeading>{g.title}</SubHeading>
            <StaffGrid list={g.list} />
          </div>
        ))}
      </Section>

      {/* 3. Khóa học — mỗi danh mục (THCS, THPT, HSA, TSA…) 1 hàng ngang, trượt để xem thêm */}
      <Section id="khoa-hoc" title="Các khóa học" subtitle="Các khóa học đang mở tại trung tâm" icon={BookOpen} color="#2E7D32">
        {courseRows.length === 0 ? <Empty text="Chưa có khóa học nào" /> : courseRows.map(([cat, list]) => (
          <CourseRow key={cat} title={cat} list={list} />
        ))}
      </Section>

      {/* 4. Các hoạt động (gộp cả Kinh nghiệm & Thành tích cũ) */}
      <Section id="hoat-dong" title="Các hoạt động" subtitle="Hành trình phát triển và những khoảnh khắc đáng nhớ của trung tâm" icon={Sparkles} color="#6A1B9A" alt>
        {activities.length === 0 ? <Empty text="Chưa có hoạt động nào" /> : <Activities list={activities} />}
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
