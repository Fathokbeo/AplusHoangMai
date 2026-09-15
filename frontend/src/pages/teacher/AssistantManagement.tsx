import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import AssistantScheduleModal from '../../components/AssistantScheduleModal';
import FacebookIcon from '../../components/FacebookIcon';
import { sortByVietnameseName, matchesNameSearch } from '../../lib/vietnameseName';
import type { AssistantSchedule } from '../../lib/assistantSchedule';
import { UserCog, Edit, Phone, Camera, Calendar, Search, School } from 'lucide-react';

export default function AssistantManagement() {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ full_name: '', phone: '', facebook_url: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const [scheduleId, setScheduleId] = useState<number | null>(null);

  useEffect(() => { fetchAssistants(); }, []);

  const fetchAssistants = async () => {
    const { data } = await api.get('/teacher/all-assistants');
    setAssistants(data);
  };

  const openEdit = (a: any) => {
    setEditing(a);
    setForm({ full_name: a.full_name, phone: a.phone || '', facebook_url: a.facebook_url || '' });
    setPhoto(null);
    setPhotoPreview(a.photo ? `/uploads/assistants/${a.photo}` : '');
  };

  const save = async () => {
    if (!form.full_name) { toast.error('Cần họ tên trợ giảng'); return; }
    setLoading(true);
    try {
      await api.put(`/teacher/assistants/${editing.id}`, form);
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo);
        await api.post(`/teacher/assistants/${editing.id}/photo`, fd);
      }
      toast.success('Đã cập nhật, thông tin đồng bộ ở mọi lớp');
      setEditing(null);
      fetchAssistants();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const saveSchedule = async (schedule: AssistantSchedule) => {
    await api.put(`/teacher/assistants/${scheduleId}/schedule`, { schedule });
    fetchAssistants();
  };

  const visible = sortByVietnameseName(
    assistants.filter((a) => matchesNameSearch(a.full_name || '', search)),
    (a: any) => a.full_name || ''
  );
  const scheduleAssistant = assistants.find((a) => a.id === scheduleId) || null;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Trợ giảng</h1>
        <div style={{ position: 'relative', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Tìm trợ giảng..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '1rem' }}>
        Mỗi trợ giảng chỉ có một hồ sơ dùng chung cho mọi lớp họ dạy — sửa thông tin hay lịch làm việc ở đây
        sẽ tự động đồng bộ sang tất cả các lớp đó. Thêm hoặc gỡ trợ giảng khỏi một lớp thì làm trong trang lớp học.
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>
          <UserCog size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>{assistants.length === 0 ? 'Chưa có trợ giảng nào. Vào một lớp học, tab "Trợ giảng" để thêm.' : 'Không tìm thấy trợ giảng phù hợp'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {visible.map((a: any) => (
            <div key={a.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center', position: 'relative' }}>
              <button onClick={() => openEdit(a)} title="Sửa thông tin"
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                <Edit size={13} color="#555" />
              </button>
              {a.photo ? (
                <img src={`/uploads/assistants/${a.photo}`} alt={a.full_name} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
              ) : (
                <div style={{ height: 220, background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCog size={56} color="#6A1B9A" />
                </div>
              )}
              <div style={{ padding: '1rem' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{a.full_name}</h3>
                <div style={{ color: '#6A1B9A', fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>Trợ giảng</div>
                {(a.phone || a.facebook_url) && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                    {a.phone && (
                      <a href={`tel:${String(a.phone).replace(/[^+\d]/g, '')}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                        <Phone size={13} /> {a.phone}
                      </a>
                    )}
                    {a.facebook_url && (
                      <a href={a.facebook_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                        <FacebookIcon size={13} /> Facebook
                      </a>
                    )}
                  </div>
                )}
                <div style={{ fontSize: '0.76rem', color: '#999', marginBottom: 10, lineHeight: 1.4 }}>
                  <School size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {a.class_count > 0 ? `${a.class_count} lớp: ${a.class_titles}` : 'Chưa dạy lớp nào'}
                </div>
                <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setScheduleId(a.id)}>
                  <Calendar size={13} /> Xem lịch làm việc
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Sửa trợ giảng"
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Hủy</button><button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        {editing && editing.class_count > 1 && (
          <div style={{ background: '#E3F2FD', color: '#1565C0', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Trợ giảng này đang dạy {editing.class_count} lớp. Thay đổi sẽ áp dụng cho tất cả các lớp đó.
          </div>
        )}
        <div className="form-group">
          <label className="label">Họ và tên *</label>
          <input className="input" placeholder="Nguyễn Văn A" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Số điện thoại</label>
          <input className="input" type="tel" placeholder="vd: 0912 345 678" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Link Facebook</label>
          <input className="input" placeholder="https://facebook.com/..." value={form.facebook_url}
            onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Ảnh đại diện</label>
          <div className="dropzone" onClick={() => photoRef.current?.click()}>
            {photoPreview ? (
              <img src={photoPreview} alt="preview" style={{ maxHeight: 120, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ fontSize: '0.88rem' }}><Camera size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Click để chọn ảnh</div>
            )}
          </div>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)); }
          }} />
        </div>
      </Modal>

      <AssistantScheduleModal
        open={scheduleId !== null}
        onClose={() => setScheduleId(null)}
        assistant={scheduleAssistant}
        editable
        onSave={saveSchedule}
      />
    </div>
  );
}
