// Giao diện "Nộp bài" toàn màn hình.
// Máy tính: chia đôi màn hình — trái là đề, phải là chỗ làm bài.
// Điện thoại: toàn màn chỉ có chỗ làm bài; bấm "Xem đề" mới hiện đề ở trên.
import { useEffect, useRef, useState } from 'react';
import { X, FileText, Upload, Plus, CheckCircle } from 'lucide-react';
import PartsSolver, { type StudentAnswers } from './PartsSolver';
import type { PartsConfig } from '../lib/homeworkParts';
import useIsMobile from '../lib/useIsMobile';

const isPdfUrl = (url: string) => url.split('?')[0].toLowerCase().endsWith('.pdf');

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  pdfUrl: string | null;
  submitObjective: boolean;
  submitEssay: boolean;
  cfg: PartsConfig | null;
  studentAnswers: StudentAnswers;
  onAnswersChange: (next: StudentAnswers) => void;
  submitFiles: File[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (idx: number) => void;
  loading: boolean;
  canDoSubmit: boolean;
  onSubmit: () => void;
}

export default function SubmitHomeworkView({
  open, onClose, title, pdfUrl, submitObjective, submitEssay, cfg,
  studentAnswers, onAnswersChange, submitFiles, onAddFiles, onRemoveFile,
  loading, canDoSubmit, onSubmit,
}: Props) {
  const isMobile = useIsMobile();
  const [showDe, setShowDe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) setShowDe(false);
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const dePanel = pdfUrl && (
    isPdfUrl(pdfUrl)
      ? <iframe src={pdfUrl} title="Đề bài" style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} />
      : <img src={pdfUrl} alt="Đề bài" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  );

  const answerPanel = (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', height: '100%' }}>
      {submitObjective && cfg && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PartsSolver cfg={cfg} value={studentAnswers} onChange={onAnswersChange} />
        </div>
      )}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5F5F5', borderRadius: 8, fontSize: '0.82rem', color: '#666' }}>
        {submitObjective
          ? <>Chọn/điền đáp án các phần ở trên{submitEssay ? ', rồi chụp ảnh phần TỰ LUẬN nộp bên dưới' : ''}. Hệ thống AI sẽ tự động chấm và cho kết quả ngay sau khi nộp.</>
          : <>Nộp bài dạng ảnh chụp (JPG, PNG) hoặc file PDF. Có thể chọn <strong>nhiều ảnh</strong> cho một bài. Hệ thống AI sẽ tự động chấm điểm và cho kết quả ngay sau khi nộp.</>}
      </div>
      {submitEssay && (
        <div className="form-group">
          <label className="label">{submitObjective ? 'Phần IV — Tự luận: ảnh bài làm (PDF hoặc ảnh) *' : 'File bài làm (PDF hoặc ảnh) *'}</label>
          <div className="dropzone" onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); if (e.dataTransfer.files?.length) onAddFiles(e.dataTransfer.files); }}>
            <div>
              <Upload size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <div style={{ fontWeight: 500 }}>Kéo thả hoặc click để chọn file</div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 4 }}>PDF, JPG, PNG · chọn được nhiều ảnh · tối đa 20MB/file</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple hidden
            onChange={(e) => { if (e.target.files?.length) onAddFiles(e.target.files); e.target.value = ''; }} />

          {submitFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {submitFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.7rem', background: '#F1F8E9', borderRadius: 8 }}>
                  {f.type === 'application/pdf'
                    ? <FileText size={16} color="#C62828" style={{ flexShrink: 0 }} />
                    : <CheckCircle size={16} color="#2E7D32" style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 600, color: '#2E7D32', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#888' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => onRemoveFile(i)} title="Xóa">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => fileRef.current?.click()}>
                <Plus size={14} /> Thêm file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 1000, display: 'flex', flexDirection: 'column' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '0.7rem 0.85rem' : '0.85rem 1.5rem', borderBottom: '1px solid #EEE', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Đóng"><X size={18} /></button>
        <span style={{ fontWeight: 700, fontSize: isMobile ? '0.92rem' : '1.05rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {isMobile && pdfUrl && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDe((v) => !v)}>
            <FileText size={13} /> {showDe ? 'Ẩn đề' : 'Xem đề'}
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={onSubmit} disabled={loading || !canDoSubmit}>
          {loading ? 'Đang nộp...' : `Nộp bài${submitFiles.length > 0 ? ` (${submitFiles.length} file)` : ''}`}
        </button>
      </div>

      {isMobile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showDe && pdfUrl && (
            <div style={{ height: '42vh', flexShrink: 0, borderBottom: '1px solid #EEE', background: '#2A2A35' }}>
              {dePanel}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>{answerPanel}</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {pdfUrl && (
            <div style={{ width: '50%', borderRight: '1px solid #EEE', background: '#2A2A35', flexShrink: 0 }}>
              {dePanel}
            </div>
          )}
          <div style={{ width: pdfUrl ? '50%' : '100%' }}>{answerPanel}</div>
        </div>
      )}
    </div>
  );
}
