import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import AdManagement from './AdManagement';
import AssistantManagement from '../teacher/AssistantManagement';
import { Plus, Edit, Trash2, Eye, EyeOff, ImageIcon, X, ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react';

// Nội dung trang giới thiệu (trang chủ): các hoạt động, học sinh tiêu biểu, giáo viên & trợ giảng (kèm trợ giảng
// các lớp), quảng cáo, liên hệ & mạng xã hội. Mở thẳng 1 tab qua ?tab=<mã> (vd /admin/content?tab=ads).

type Field = { key: string; label: string; type: 'text' | 'textarea' | 'select'; required?: boolean; options?: { value: string; label: string }[]; placeholder?: string };
type Cfg = { label: string; dir: string; titleKey: string; fields: Field[]; multi?: boolean; imageHint: string };

const COLLECTIONS: Record<string, Cfg> = {
  'activities': {
    label: 'Hoạt động', dir: 'activities', titleKey: 'title', multi: true,
    imageHint: 'Chọn được nhiều ảnh cho 1 hoạt động. Ảnh đầu tiên là ảnh lớn. Khuyên dùng ảnh ngang 4:3 (1200 × 900).',
    fields: [
      { key: 'title', label: 'Tên hoạt động', type: 'text', required: true, placeholder: 'vd: Lễ tri ân 20/11, Khóa 2k8, Dã ngoại cuối kỳ…' },
      { key: 'event_date', label: 'Thời gian', type: 'text', placeholder: 'vd: 20/11/2026 hoặc 2025' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  'featured-students': {
    label: 'Học sinh tiêu biểu', dir: 'featured_students', titleKey: 'name',
    imageHint: 'Khuyên dùng ảnh dọc 3:4 (600 × 800).',
    fields: [
      { key: 'name', label: 'Họ tên', type: 'text', required: true },
      { key: 'exam', label: 'Kỳ thi', type: 'text', placeholder: 'vd: Thi vào 10, HSG Toán...' },
      { key: 'achievement', label: 'Thành tích / Điểm', type: 'text', placeholder: 'vd: 9.5 điểm, Giải Nhất...' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  'staff': {
    label: 'Giáo viên & Trợ giảng', dir: 'staff', titleKey: 'name',
    imageHint: 'Mọi ảnh giáo viên / trợ giảng hiển thị cùng khung vuông 1:1 — khuyên dùng ảnh 600 × 600 (mặt ở giữa ảnh).',
    fields: [
      { key: 'name', label: 'Họ tên', type: 'text', required: true },
      { key: 'staff_type', label: 'Loại', type: 'select', options: [{ value: 'teacher', label: 'Giáo viên' }, { value: 'assistant', label: 'Trợ giảng' }] },
      { key: 'level', label: 'Cấp dạy', type: 'select', options: [{ value: '', label: '— Chưa chọn —' }, { value: 'thcs', label: 'THCS (cấp 2)' }, { value: 'thpt', label: 'THPT (cấp 3)' }] },
      { key: 'subject', label: 'Môn', type: 'text', placeholder: 'vd: Toán, Tiếng Anh' },
      { key: 'role_title', label: 'Chức danh', type: 'text', placeholder: 'vd: Giáo viên Toán' },
      { key: 'phone', label: 'Số điện thoại', type: 'text', placeholder: 'vd: 0912 345 678' },
      { key: 'facebook_url', label: 'Link Facebook', type: 'text', placeholder: 'https://facebook.com/…' },
      { key: 'instagram_url', label: 'Link Instagram', type: 'text', placeholder: 'https://instagram.com/…' },
      { key: 'tiktok_url', label: 'Link TikTok', type: 'text', placeholder: 'https://tiktok.com/@…' },
      { key: 'threads_url', label: 'Link Threads', type: 'text', placeholder: 'https://threads.net/@…' },
      { key: 'description', label: 'Giới thiệu', type: 'textarea' },
    ],
  },
};

const LEVEL_LABEL: Record<string, string> = { thcs: 'THCS', thpt: 'THPT' };

// Ảnh của 1 mục khi soạn: ảnh cũ (tên file trên server) hoặc ảnh mới chọn (File + link xem trước)
type Pic = { old: string } | { file: File; url: string };

function CollectionManager({ collection }: { collection: string }) {
  const cfg = COLLECTIONS[collection];
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [pics, setPics] = useState<Pic[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = () => api.get(`/admin/content/${collection}`).then((r) => setItems(r.data));
  useEffect(() => { fetchItems(); }, [collection]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemImages = (it: any): string[] => {
    try { const a = JSON.parse(it.images || '[]'); if (Array.isArray(a) && a.length) return a; } catch { /* bỏ qua */ }
    return it.image ? [it.image] : [];
  };

  const openCreate = () => {
    setEditing(null);
    const init: any = { display_order: '0' };
    if (collection === 'staff') { init.staff_type = 'teacher'; init.level = ''; }
    setForm(init);
    setPics([]);
    setModal(true);
  };

  const openEdit = (it: any) => {
    setEditing(it);
    const f: any = { display_order: String(it.display_order ?? 0) };
    cfg.fields.forEach((fl) => { f[fl.key] = it[fl.key] ?? ''; });
    setForm(f);
    setPics(itemImages(it).map((name) => ({ old: name })));
    setModal(true);
  };

  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) return;
    const next = picked.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPics((prev) => (cfg.multi ? [...prev, ...next].slice(0, 30) : next.slice(0, 1)));
  };
  const movePic = (i: number, d: -1 | 1) => setPics((prev) => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const save = async () => {
    const titleField = cfg.fields.find((f) => f.required);
    if (titleField && !form[titleField.key]) { toast.error(`Cần nhập ${titleField.label}`); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      cfg.fields.forEach((f) => fd.append(f.key, form[f.key] ?? ''));
      fd.append('display_order', form.display_order || '0');
      if (cfg.multi) {
        // Server giữ ảnh cũ theo đúng thứ tự keep_images rồi nối ảnh mới vào sau
        fd.append('keep_images', JSON.stringify(pics.filter((p): p is { old: string } => 'old' in p).map((p) => p.old)));
        pics.forEach((p) => { if ('file' in p) fd.append('images', p.file); });
      } else {
        const p = pics[0];
        if (p && 'file' in p) fd.append('image', p.file);
      }
      if (editing) {
        await api.put(`/admin/content/${collection}/${editing.id}`, fd);
        toast.success('Đã cập nhật');
      } else {
        await api.post(`/admin/content/${collection}`, fd);
        toast.success('Đã thêm');
      }
      setModal(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (it: any) => {
    const fd = new FormData();
    fd.append('active', it.active ? '0' : '1');
    await api.put(`/admin/content/${collection}/${it.id}`, fd);
    fetchItems();
  };

  const remove = async (it: any) => {
    if (!confirm(`Xóa "${it[cfg.titleKey]}"?`)) return;
    await api.delete(`/admin/content/${collection}/${it.id}`);
    toast.success('Đã xóa');
    fetchItems();
  };

  // Giáo viên & trợ giảng: lọc theo nhóm (loại × cấp)
  const STAFF_FILTERS = [
    ['all', 'Tất cả'], ['teacher-thpt', 'Giáo viên THPT'], ['teacher-thcs', 'Giáo viên THCS'],
    ['assistant-thpt', 'Trợ giảng THPT'], ['assistant-thcs', 'Trợ giảng THCS'], ['none', 'Chưa chọn cấp'],
  ] as const;
  const visible = collection !== 'staff' || filter === 'all' ? items : items.filter((it) => {
    if (filter === 'none') return !LEVEL_LABEL[it.level];
    const [type, lv] = filter.split('-');
    return (type === 'assistant' ? it.staff_type === 'assistant' : it.staff_type !== 'assistant') && it.level === lv;
  });

  const picSrc = (p: Pic) => ('old' in p ? `/uploads/${cfg.dir}/${p.old}` : p.url);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {collection === 'staff' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STAFF_FILTERS.map(([k, l]) => (
              <button key={k} className="btn btn-sm" onClick={() => setFilter(k)}
                style={{ background: filter === k ? '#FFEBEE' : 'white', color: filter === k ? '#C62828' : '#666', border: `1px solid ${filter === k ? '#FFCDD2' : '#E0E0E0'}` }}>{l}</button>
            ))}
          </div>
        )}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openCreate}><Plus size={16} /> Thêm {cfg.label.toLowerCase()}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {visible.map((it) => {
          const imgs = itemImages(it);
          return (
            <div key={it.id} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', opacity: it.active ? 1 : 0.55 }}>
              {imgs.length ? (
                <div style={{ position: 'relative' }}>
                  <img src={`/uploads/${cfg.dir}/${imgs[0]}`} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                  {imgs.length > 1 && <span className="badge badge-gray" style={{ position: 'absolute', right: 8, bottom: 8 }}>{imgs.length} ảnh</span>}
                </div>
              ) : (
                <div style={{ height: 140, background: '#F0F0F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageIcon size={32} color="#bbb" />
                </div>
              )}
              <div style={{ padding: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E', flex: 1 }}>{it[cfg.titleKey]}</h4>
                  {!it.active && <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>Ẩn</span>}
                </div>
                {it.exam && <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>{it.exam}</span>}
                {collection === 'staff' && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '2px 0 4px' }}>
                    <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{it.staff_type === 'assistant' ? 'Trợ giảng' : 'Giáo viên'}{LEVEL_LABEL[it.level] ? ` ${LEVEL_LABEL[it.level]}` : ''}</span>
                    {it.subject && <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{it.subject}</span>}
                  </div>
                )}
                {it.role_title && <div style={{ fontSize: '0.8rem', color: '#1565C0', fontWeight: 600 }}>{it.role_title}</div>}
                {it.phone && <div style={{ fontSize: '0.78rem', color: '#2E7D32', fontWeight: 600 }}>SĐT: {it.phone}</div>}
                {it.event_date && <div style={{ fontSize: '0.8rem', color: '#6A1B9A', fontWeight: 700 }}>{it.event_date}</div>}
                {it.achievement && <div style={{ fontSize: '0.82rem', color: '#C62828', fontWeight: 600, marginTop: 2 }}>{it.achievement}</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEdit(it)}><Edit size={13} /> Sửa</button>
                  <button className="btn btn-ghost btn-sm btn-icon" title={it.active ? 'Ẩn' : 'Hiện'} onClick={() => toggleActive(it)}>
                    {it.active ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => remove(it)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#999', padding: '2.5rem', background: 'white', borderRadius: 12 }}>Chưa có mục nào</div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Sửa ${cfg.label.toLowerCase()}` : `Thêm ${cfg.label.toLowerCase()}`} size={cfg.multi ? 'lg' : 'default'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button><button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">{cfg.multi ? `Ảnh (${pics.length})` : 'Ảnh'}</label>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 8 }}>{cfg.imageHint}</div>
          {pics.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: cfg.multi ? 'repeat(auto-fill, minmax(110px, 1fr))' : '160px', gap: 10, marginBottom: 10 }}>
              {pics.map((p, i) => (
                <div key={i}>
                  <div style={{ position: 'relative', aspectRatio: collection === 'activities' ? '4 / 3' : collection === 'staff' ? '1 / 1' : '3 / 4', borderRadius: 8, overflow: 'hidden', border: i === 0 && cfg.multi ? '2px solid #6A1B9A' : '1px solid #E0E0E0', background: '#F5F5F5' }}>
                    <img src={picSrc(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {i === 0 && cfg.multi && <span className="badge badge-purple" style={{ position: 'absolute', left: 4, top: 4, fontSize: '0.65rem' }}>Ảnh lớn</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 3 }}>
                    {cfg.multi && <>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => movePic(i, -1)} disabled={i === 0} title="Lên trước"><ArrowLeft size={12} /></button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => movePic(i, 1)} disabled={i === pics.length - 1} title="Ra sau"><ArrowRight size={12} /></button>
                    </>}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => setPics((prev) => prev.filter((_, j) => j !== i))} title="Bỏ ảnh"><X size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(cfg.multi || pics.length === 0) && (
            <div className="dropzone" onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '0.85rem' }}>{cfg.multi ? 'Click để thêm ảnh (chọn được nhiều ảnh)' : 'Click để chọn ảnh'}</div>
            </div>
          )}
          {!cfg.multi && pics.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Đổi ảnh khác</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple={!!cfg.multi} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {cfg.fields.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="label">{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'textarea' ? (
              <textarea className="input" rows={3} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : f.type === 'select' ? (
              <select className="input" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="input" placeholder={f.placeholder} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
        <div className="form-group">
          <label className="label">Thứ tự hiển thị</label>
          <input className="input" type="number" min={0} value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

const SETTING_FIELDS = [
  { key: 'hero_title', label: 'Tiêu đề trang chủ', area: 'Trang chủ' },
  { key: 'hero_subtitle', label: 'Khẩu hiệu (subtitle)', area: 'Trang chủ' },
  { key: 'stats_students', label: 'Số liệu: Học sinh', area: 'Số liệu' },
  { key: 'stats_teachers', label: 'Số liệu: Giáo viên', area: 'Số liệu' },
  { key: 'stats_courses', label: 'Số liệu: Khóa học', area: 'Số liệu' },
  { key: 'stats_years', label: 'Số liệu: Năm kinh nghiệm', area: 'Số liệu' },
  { key: 'contact_address', label: 'Địa chỉ', area: 'Liên hệ' },
  { key: 'contact_phone', label: 'Điện thoại', area: 'Liên hệ' },
  { key: 'contact_email', label: 'Email', area: 'Liên hệ' },
  { key: 'contact_hours', label: 'Giờ học', area: 'Liên hệ' },
  { key: 'contact_facebook', label: 'Link Facebook', area: 'Mạng xã hội', placeholder: 'https://facebook.com/…' },
  { key: 'contact_instagram', label: 'Link Instagram', area: 'Mạng xã hội', placeholder: 'https://instagram.com/…' },
  { key: 'contact_tiktok', label: 'Link TikTok', area: 'Mạng xã hội', placeholder: 'https://tiktok.com/@…' },
  { key: 'contact_threads', label: 'Link Threads', area: 'Mạng xã hội', placeholder: 'https://threads.net/@…' },
];

function SettingsForm() {
  const [s, setS] = useState<any>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => { api.get('/admin/content/settings').then((r) => setS(r.data)); }, []);

  const save = async () => {
    setLoading(true);
    try {
      await api.put('/admin/content/settings', s);
      toast.success('Đã lưu thông tin');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally { setLoading(false); }
  };

  const areas = ['Trang chủ', 'Số liệu', 'Liên hệ', 'Mạng xã hội'];
  return (
    <div style={{ maxWidth: 640 }}>
      {areas.map((area) => (
        <div key={area} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>{area}</h3>
          {area === 'Mạng xã hội' && <div style={{ fontSize: '0.78rem', color: '#888', margin: '-0.5rem 0 0.75rem' }}>Hiện thành logo từng app ở phần Liên hệ cuối trang chủ (để trống = không hiện).</div>}
          {SETTING_FIELDS.filter((f) => f.area === area).map((f) => (
            <div className="form-group" key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" placeholder={(f as any).placeholder} value={s[f.key] || ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
      ))}
      <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu thông tin'}</button>
    </div>
  );
}

// Giáo viên & trợ giảng: hồ sơ trên trang chủ + trợ giảng các lớp (lịch làm việc, gán lớp)
function StaffTab() {
  const [sub, setSub] = useState<'profiles' | 'class-assistants'>('profiles');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([['profiles', 'Hồ sơ trên trang chủ'], ['class-assistants', 'Trợ giảng các lớp (lịch, gán lớp)']] as const).map(([k, l]) => (
          <button key={k} className="btn btn-sm" onClick={() => setSub(k)}
            style={{ background: sub === k ? '#1A1A2E' : 'white', color: sub === k ? 'white' : '#666', border: '1px solid #E0E0E0' }}>{l}</button>
        ))}
      </div>
      {sub === 'profiles' ? <CollectionManager collection="staff" /> : <AssistantManagement />}
    </div>
  );
}

const TABS = [
  { key: 'activities', label: 'Các hoạt động' },
  { key: 'featured-students', label: 'Học sinh tiêu biểu' },
  { key: 'staff', label: 'Giáo viên & Trợ giảng' },
  { key: 'ads', label: 'Quảng cáo' },
  { key: 'settings', label: 'Liên hệ & Trang chủ' },
];

export default function SiteContent() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'activities';
  const setTab = (k: string) => setParams({ tab: k }, { replace: true });
  return (
    <div className="fade-in">
      <Link to="/admin/overview" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#888', textDecoration: 'none', fontSize: '0.85rem', marginBottom: 6 }}>
        <ChevronLeft size={15} /> Tổng quan
      </Link>
      <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Nội dung trang giới thiệu</h1>
      <p style={{ margin: '0 0 1.25rem', color: '#888', fontSize: '0.86rem' }}>
        Mục <b>Khóa học</b> trên trang chủ lấy thẳng từ <b>Quản lý khóa học</b> (chia hàng theo danh mục của khóa).
      </p>

      <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1.5rem', flexWrap: 'wrap', width: 'fit-content' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="btn"
            style={{ background: tab === t.key ? 'white' : 'transparent', boxShadow: tab === t.key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: tab === t.key ? '#C62828' : '#888', border: 'none', fontSize: '0.85rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? <SettingsForm />
        : tab === 'ads' ? <AdManagement />
        : tab === 'staff' ? <StaffTab />
        : <CollectionManager collection={tab} key={tab} />}
    </div>
  );
}
