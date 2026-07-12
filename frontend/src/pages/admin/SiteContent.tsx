import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Plus, Edit, Trash2, Eye, EyeOff, ImageIcon } from 'lucide-react';

type Field = { key: string; label: string; type: 'text' | 'textarea' | 'select'; required?: boolean; options?: { value: string; label: string }[]; placeholder?: string };

const COLLECTIONS: Record<string, { label: string; dir: string; titleKey: string; fields: Field[] }> = {
  'featured-students': {
    label: 'Học sinh tiêu biểu', dir: 'featured_students', titleKey: 'name',
    fields: [
      { key: 'name', label: 'Họ tên', type: 'text', required: true },
      { key: 'exam', label: 'Kỳ thi', type: 'text', placeholder: 'vd: Thi vào 10, HSG Toán...' },
      { key: 'achievement', label: 'Thành tích / Điểm', type: 'text', placeholder: 'vd: 9.5 điểm, Giải Nhất...' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  'staff': {
    label: 'Giáo viên & Trợ giảng', dir: 'staff', titleKey: 'name',
    fields: [
      { key: 'name', label: 'Họ tên', type: 'text', required: true },
      { key: 'role_title', label: 'Chức danh', type: 'text', placeholder: 'vd: Giáo viên Toán' },
      { key: 'staff_type', label: 'Loại', type: 'select', options: [{ value: 'teacher', label: 'Giáo viên' }, { value: 'assistant', label: 'Trợ giảng' }] },
      { key: 'phone', label: 'Số điện thoại', type: 'text', placeholder: 'vd: 0912 345 678' },
      { key: 'facebook_url', label: 'Link Facebook', type: 'text', placeholder: 'vd: https://facebook.com/ten.giao.vien' },
      { key: 'description', label: 'Giới thiệu', type: 'textarea' },
    ],
  },
  'featured-courses': {
    label: 'Khóa học tiêu biểu', dir: 'featured_courses', titleKey: 'title',
    fields: [
      { key: 'title', label: 'Tên khóa học', type: 'text', required: true },
      { key: 'student_count', label: 'Số học sinh', type: 'text', placeholder: 'vd: 120 học sinh' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  'achievements': {
    label: 'Kinh nghiệm & Thành tích', dir: 'achievements', titleKey: 'title',
    fields: [
      { key: 'year', label: 'Năm', type: 'text', placeholder: 'vd: 2024' },
      { key: 'title', label: 'Tiêu đề', type: 'text', required: true },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
};

function CollectionManager({ collection }: { collection: string }) {
  const cfg = COLLECTIONS[collection];
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = () => api.get(`/admin/content/${collection}`).then((r) => setItems(r.data));
  useEffect(() => { fetchItems(); }, [collection]);

  const openCreate = () => {
    setEditing(null);
    const init: any = { display_order: '0' };
    if (collection === 'staff') init.staff_type = 'teacher';
    setForm(init);
    setFile(null); setPreview('');
    setModal(true);
  };

  const openEdit = (it: any) => {
    setEditing(it);
    const f: any = { display_order: String(it.display_order ?? 0) };
    cfg.fields.forEach((fl) => { f[fl.key] = it[fl.key] ?? ''; });
    setForm(f);
    setFile(null);
    setPreview(it.image ? `/uploads/${cfg.dir}/${it.image}` : '');
    setModal(true);
  };

  const save = async () => {
    const titleField = cfg.fields.find((f) => f.required);
    if (titleField && !form[titleField.key]) { toast.error(`Cần nhập ${titleField.label}`); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      cfg.fields.forEach((f) => fd.append(f.key, form[f.key] ?? ''));
      fd.append('display_order', form.display_order || '0');
      if (file) fd.append('image', file);
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm {cfg.label.toLowerCase()}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {items.map((it) => (
          <div key={it.id} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', opacity: it.active ? 1 : 0.55 }}>
            {it.image ? (
              <img src={`/uploads/${cfg.dir}/${it.image}`} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
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
              {it.role_title && <div style={{ fontSize: '0.8rem', color: '#1565C0', fontWeight: 600 }}>{it.role_title}{it.staff_type === 'assistant' ? ' · Trợ giảng' : ''}</div>}
              {it.phone && <div style={{ fontSize: '0.78rem', color: '#2E7D32', fontWeight: 600 }}>SĐT: {it.phone}</div>}
              {it.facebook_url && <div style={{ fontSize: '0.75rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>FB: {it.facebook_url}</div>}
              {it.student_count && <div style={{ fontSize: '0.8rem', color: '#2E7D32', fontWeight: 600 }}>{it.student_count}</div>}
              {it.year && <div style={{ fontSize: '0.8rem', color: '#E65100', fontWeight: 700 }}>{it.year}</div>}
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
        ))}
        {items.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#999', padding: '2.5rem', background: 'white', borderRadius: 12 }}>Chưa có mục nào</div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Sửa ${cfg.label.toLowerCase()}` : `Thêm ${cfg.label.toLowerCase()}`}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button><button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">Ảnh</label>
          <div className="dropzone" onClick={() => fileRef.current?.click()}>
            {preview ? <img src={preview} alt="preview" style={{ maxHeight: 140, borderRadius: 6, objectFit: 'contain' }} /> : <div style={{ fontSize: '0.85rem' }}>Click để chọn ảnh</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
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
  { key: 'contact_facebook', label: 'Link Facebook', area: 'Liên hệ' },
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

  const areas = ['Trang chủ', 'Số liệu', 'Liên hệ'];
  return (
    <div style={{ maxWidth: 640 }}>
      {areas.map((area) => (
        <div key={area} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>{area}</h3>
          {SETTING_FIELDS.filter((f) => f.area === area).map((f) => (
            <div className="form-group" key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" value={s[f.key] || ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
      ))}
      <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu thông tin'}</button>
    </div>
  );
}

const TABS = [
  { key: 'featured-students', label: 'Học sinh tiêu biểu' },
  { key: 'staff', label: 'Giáo viên & Trợ giảng' },
  { key: 'featured-courses', label: 'Khóa học tiêu biểu' },
  { key: 'achievements', label: 'Kinh nghiệm' },
  { key: 'settings', label: 'Liên hệ & Trang chủ' },
];

export default function SiteContent() {
  const [tab, setTab] = useState('featured-students');
  return (
    <div className="fade-in">
      <h1 className="page-title" style={{ marginBottom: '1.25rem' }}>Nội dung trang giới thiệu</h1>

      <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1.5rem', flexWrap: 'wrap', width: 'fit-content' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="btn"
            style={{ background: tab === t.key ? 'white' : 'transparent', boxShadow: tab === t.key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: tab === t.key ? '#C62828' : '#888', border: 'none', fontSize: '0.85rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? <SettingsForm /> : <CollectionManager collection={tab} key={tab} />}
    </div>
  );
}
