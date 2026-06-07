import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Plus, Trash2, Edit, Eye, EyeOff, Upload, Image } from 'lucide-react';

interface Ad {
  id: number;
  image_path: string;
  title: string;
  link: string;
  ad_order: number;
  active: number;
}

export default function AdManagement() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: '', link: '', order: '0' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAds(); }, []);

  const fetchAds = async () => {
    const { data } = await api.get('/admin/ads');
    setAds(data);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', link: '', order: String(ads.length) });
    setFile(null);
    setPreview('');
    setModal(true);
  };

  const openEdit = (a: Ad) => {
    setEditing(a);
    setForm({ title: a.title || '', link: a.link || '', order: String(a.ad_order) });
    setFile(null);
    setPreview(`/uploads/ads/${a.image_path}`);
    setModal(true);
  };

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!editing && !file) { toast.error('Vui lòng chọn ảnh'); return; }
    setLoading(true);
    try {
      if (editing) {
        const body = new FormData();
        body.append('title', form.title);
        body.append('link', form.link);
        body.append('order', form.order);
        if (file) body.append('image', file);
        await api.put(`/admin/ads/${editing.id}`, { title: form.title, link: form.link, order: form.order });
        toast.success('Đã cập nhật');
      } else {
        const body = new FormData();
        body.append('image', file!);
        body.append('title', form.title);
        body.append('link', form.link);
        body.append('order', form.order);
        await api.post('/admin/ads', body);
        toast.success('Đã thêm quảng cáo');
      }
      setModal(false);
      fetchAds();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (a: Ad) => {
    await api.put(`/admin/ads/${a.id}`, { active: !a.active });
    fetchAds();
  };

  const deleteAd = async (a: Ad) => {
    if (!confirm('Xóa quảng cáo này?')) return;
    await api.delete(`/admin/ads/${a.id}`);
    toast.success('Đã xóa');
    fetchAds();
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Quản lý quảng cáo</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Thêm quảng cáo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {ads.map((a) => (
          <div key={a.id} style={{
            background: 'white', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            opacity: a.active ? 1 : 0.6,
          }}>
            <div style={{ position: 'relative' }}>
              <img
                src={`/uploads/ads/${a.image_path}`}
                alt={a.title}
                style={{ width: '100%', height: 160, objectFit: 'cover' }}
              />
              {!a.active && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="badge badge-gray">Đã ẩn</span>
                </div>
              )}
            </div>
            <div style={{ padding: '0.75rem' }}>
              {a.title && <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{a.title}</div>}
              {a.link && <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.link}</div>}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#999', flex: 1 }}>Thứ tự: {a.ad_order}</span>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleActive(a)} title={a.active ? 'Ẩn' : 'Hiện'}>
                  {a.active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(a)}><Edit size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteAd(a)}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>
            <Image size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div>Chưa có quảng cáo nào</div>
          </div>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Chỉnh sửa quảng cáo' : 'Thêm quảng cáo mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="label">Ảnh quảng cáo {!editing && '*'}</label>
          <div
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight: 180, borderRadius: 8, objectFit: 'contain' }} />
            ) : (
              <div>
                <Upload size={24} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.9rem' }}>Kéo thả hoặc click để chọn ảnh</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
        <div className="form-group">
          <label className="label">Tiêu đề</label>
          <input className="input" placeholder="Tiêu đề quảng cáo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Đường dẫn (link)</label>
          <input className="input" placeholder="https://..." value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Thứ tự hiển thị</label>
          <input className="input" type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
