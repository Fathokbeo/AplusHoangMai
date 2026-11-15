import { useEffect, useRef, useState } from 'react';
import { Camera, Crown, Loader2, Trash2, UserRound } from 'lucide-react';
import api from '../../lib/api';
import { toast } from '../../components/Toast';
import { shrinkImage } from '../../lib/shrinkImage';

// Ảnh cho "Bảng vàng" tháng ở trang chủ (tab Học sinh tiêu biểu của admin). Danh sách các tháng tự tính theo điểm;
// ảnh chụp / chọn ở đây lưu CỐ ĐỊNH làm ảnh đại diện của học sinh → tháng sau bạn đó lại lên bảng vàng thì trang chủ
// tự hiện ảnh, không phải chụp lại. Chụp ảnh mới sẽ thay ảnh cũ.

const MEDAL = ['🥇', '🥈', '🥉'];

function monthText(ym: string) {
  const [y, m] = ym.split('-');
  return `T${parseInt(m)}/${y}`;
}

export default function HonorBoardPhotos() {
  const [months, setMonths] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<any>(null);

  useEffect(() => {
    api.get('/admin/content/honor-board').then((r) => setMonths(r.data)).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // 1 học sinh có thể có mặt ở nhiều tháng → cập nhật ảnh ở mọi tháng
  const setAvatar = (id: number, avatar: string | null) => setMonths((ms) => ms.map((m) => ({
    ...m, students: m.students.map((s: any) => (s.id === id ? { ...s, avatar } : s)),
  })));

  const pick = (s: any) => { targetRef.current = s; fileRef.current?.click(); };

  const upload = async (file: File | undefined) => {
    const s = targetRef.current;
    if (!file || !s) return;
    setBusyId(s.id);
    try {
      const blob = await shrinkImage(file);
      const fd = new FormData();
      fd.append('photo', blob, blob === file ? file.name : 'avatar.jpg');
      const r = await api.post(`/admin/content/honor-board/students/${s.id}/avatar`, fd);
      setAvatar(s.id, r.data.avatar);
      toast.success(`Đã lưu ảnh cho ${s.full_name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không lưu được ảnh');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: any) => {
    if (!confirm(`Xóa ảnh đại diện của ${s.full_name}? Các tháng có bạn này trên Bảng vàng sẽ không còn ảnh.`)) return;
    setBusyId(s.id);
    try {
      await api.delete(`/admin/content/honor-board/students/${s.id}/avatar`);
      setAvatar(s.id, null);
      toast.success('Đã xóa ảnh');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không xóa được ảnh');
    } finally {
      setBusyId(null);
    }
  };

  const cur = months[Math.min(idx, months.length - 1)];

  return (
    <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '1rem 1.1rem', marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1A1A2E', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Crown size={18} color="#F9A825" /> Ảnh Bảng vàng tháng
          </div>
          <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2, maxWidth: 620 }}>
            Danh sách tự tính theo điểm trung bình tháng. Ảnh chụp ở đây được lưu làm <b>ảnh đại diện</b> của học sinh:
            tháng sau bạn đó lại lên Bảng vàng thì trang chủ tự hiện ảnh, không cần chụp lại.
          </div>
        </div>
        {months.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {months.map((m, i) => (
              <button key={m.month} type="button" onClick={() => setIdx(i)}
                className={`btn btn-sm ${i === idx ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0.25rem 0.7rem' }}>
                {monthText(m.month)}
              </button>
            ))}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />

      {!loaded ? (
        <div style={{ color: '#999', fontSize: '0.85rem', padding: '0.5rem 0' }}>Đang tải…</div>
      ) : !cur ? (
        <div style={{ color: '#999', fontSize: '0.85rem', padding: '0.5rem 0' }}>Chưa có tháng nào có điểm để xếp Bảng vàng.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {cur.students.map((s: any) => {
            const busy = busyId === s.id;
            return (
              <div key={`${cur.month}-${s.id}`} style={{ border: '1px solid #EEE', borderRadius: 12, padding: '0.75rem 0.6rem', textAlign: 'center', background: '#FCFCFC' }}>
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 6px' }}>
                  {s.avatar ? (
                    <img src={`/uploads/avatars/${s.avatar}`} alt={s.full_name}
                      style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid #FFD54F', boxSizing: 'border-box' }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0F0F3', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #D0D0D8', boxSizing: 'border-box' }}>
                      <UserRound size={30} color="#B0B0BC" />
                    </div>
                  )}
                  <span style={{ position: 'absolute', left: -4, bottom: -2, lineHeight: 1, ...(s.rank <= 3 ? { fontSize: '1.2rem' } : { fontSize: '0.7rem', fontWeight: 800, color: '#666', background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: '2px 4px' }) }}>
                    {s.rank <= 3 ? MEDAL[s.rank - 1] : `#${s.rank}`}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1A2E', lineHeight: 1.3 }}>{s.full_name}</div>
                <div style={{ fontSize: '0.74rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.classes ? `Lớp ${s.classes} · ` : ''}ĐTB {s.avg}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'center' }}>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => pick(s)} style={{ flex: 1, justifyContent: 'center' }}>
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} {s.avatar ? 'Đổi ảnh' : 'Chụp / chọn'}
                  </button>
                  {s.avatar && (
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Xóa ảnh" disabled={busy} onClick={() => remove(s)}>
                      <Trash2 size={13} color="#C62828" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
