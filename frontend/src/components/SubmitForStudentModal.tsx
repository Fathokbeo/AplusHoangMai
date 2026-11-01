import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { toast } from './Toast';
import { Camera, ImagePlus, X, FileText, ArrowLeft, ArrowRight } from 'lucide-react';

// Giáo viên / admin nộp bài HỘ học sinh: chụp từng trang bằng camera (điện thoại) hoặc chọn ảnh / PDF
// có sẵn, sắp lại thứ tự trang rồi nộp. Bài được AI chấm như học sinh tự nộp; không tính hạn nộp.

const MAX_FILES = 20;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

type Item = { file: File; url: string | null };

export default function SubmitForStudentModal({ open, onClose, homeworkId, student, resubmit, onDone }: {
  open: boolean;
  onClose: () => void;
  homeworkId: number | string;
  student: { student_id: number; full_name: string } | null;
  resubmit: boolean; // học sinh đã có bài nộp → nộp hộ sẽ thay bài cũ
  onDone: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [sending, setSending] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  // Mở lại cho học sinh khác → xóa danh sách cũ (và giải phóng ảnh xem trước)
  useEffect(() => {
    if (!open) return;
    setItems((prev) => { prev.forEach((i) => i.url && URL.revokeObjectURL(i.url)); return []; });
  }, [open, student?.student_id]);

  const add = (list: FileList | null) => {
    // Chép ra mảng NGAY: FileList của ô chọn file bị xóa (e.target.value = '') trước khi setItems chạy
    const picked = Array.from(list || []);
    if (!picked.length) return;
    if (items.length + picked.length > MAX_FILES) toast.error(`Tối đa ${MAX_FILES} file mỗi lần nộp`);
    setItems((prev) => [
      ...prev,
      ...picked.slice(0, Math.max(0, MAX_FILES - prev.length))
        .map((f) => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })),
    ]);
  };
  const remove = (i: number) => setItems((prev) => {
    const url = prev[i]?.url;
    if (url) URL.revokeObjectURL(url);
    return prev.filter((_, j) => j !== i);
  });
  const move = (i: number, d: -1 | 1) => setItems((prev) => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const submit = async () => {
    if (!student || items.length === 0) return;
    setSending(true);
    try {
      const body = new FormData();
      items.forEach((it) => body.append('files', it.file));
      const { data } = await api.post(`/homework/${homeworkId}/submit-for/${student.student_id}`, body);
      toast.success(data.message || 'Đã nộp hộ học sinh');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Nộp hộ không thành công');
    } finally { setSending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={student ? `Nộp hộ: ${student.full_name}` : 'Nộp hộ'} size="lg"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit} disabled={sending || items.length === 0}>
          {sending ? 'Đang nộp…' : `Nộp hộ${items.length ? ` (${items.length} trang)` : ''}`}
        </button>
      </>}>
      <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: 1.6, marginBottom: 14 }}>
        Chụp lần lượt từng trang bài làm (theo đúng thứ tự) hoặc chọn ảnh / PDF có sẵn. Bài nộp hộ được AI chấm như
        bài học sinh tự nộp, không tính hạn nộp.
        {resubmit && <strong style={{ color: '#E65100' }}> Học sinh đã có bài nộp — bài nộp hộ sẽ thay bài cũ (vẫn giữ điểm cao nhất).</strong>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div className="dropzone" style={{ padding: '1.1rem 0.75rem' }} onClick={() => cameraRef.current?.click()}>
          <Camera size={26} style={{ margin: '0 auto 6px', opacity: 0.6, display: 'block' }} />
          <div style={{ fontWeight: 600 }}>Chụp ảnh</div>
          <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>Mở camera, chụp từng trang</div>
        </div>
        <div className="dropzone" style={{ padding: '1.1rem 0.75rem' }} onClick={() => pickRef.current?.click()}>
          <ImagePlus size={26} style={{ margin: '0 auto 6px', opacity: 0.6, display: 'block' }} />
          <div style={{ fontWeight: 600 }}>Chọn ảnh / PDF</div>
          <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>Từ máy hoặc thư viện ảnh</div>
        </div>
      </div>
      {/* capture="environment": điện thoại mở thẳng camera sau; máy tính thì mở hộp chọn file */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginTop: 16 }}>
          {items.map((it, i) => (
            <div key={i}>
              <div className="submit-for-thumb">
                {it.url ? <img src={it.url} alt={`Trang ${i + 1}`} /> : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#C62828', padding: 8, textAlign: 'center' }}>
                    <FileText size={26} /><span style={{ fontSize: '0.7rem', color: '#666', wordBreak: 'break-all' }}>{it.file.name}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', flex: 1 }}>Trang {i + 1}</span>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0} title="Lên trước"><ArrowLeft size={13} /></button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Ra sau"><ArrowRight size={13} /></button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => remove(i)} title="Bỏ trang này"><X size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
