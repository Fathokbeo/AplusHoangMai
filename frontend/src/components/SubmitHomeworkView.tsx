// Giao diện "Nộp bài" toàn màn hình.
// Máy tính: chia đôi màn hình — trái là đề (chỉ nội dung, tự phóng to/nhỏ bằng nút +/-, kéo được thanh
// chia để đổi tỉ lệ 2 bên), phải là chỗ làm bài như cũ.
// Điện thoại: toàn màn chỉ có chỗ làm bài; bấm "Xem đề" mới hiện đề ở trên (không kéo chia được).
import { useEffect, useRef, useState } from 'react';
import { X, FileText, Upload, Plus, Minus, CheckCircle, Timer, Maximize2, Minimize2 } from 'lucide-react';
import PartsSolver, { type StudentAnswers } from './PartsSolver';
import HsaSolver from './HsaSolver';
import PdfCanvasViewer from './PdfCanvasViewer';
import type { PartsConfig, HsaConfig, ExamType } from '../lib/homeworkParts';
import useIsMobile from '../lib/useIsMobile';

const round2 = (n: number) => Math.round(n * 100) / 100;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3, ZOOM_STEP = 0.25;

// mm:ss (hoặc h:mm:ss nếu còn hơn 1 tiếng) từ số mili-giây còn lại
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
  examType: ExamType;
  hsaCfg: HsaConfig | null;
  hsaAnswers: string[];
  onHsaAnswersChange: (next: string[]) => void;
  submitFiles: File[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (idx: number) => void;
  loading: boolean;
  canDoSubmit: boolean;
  onSubmit: () => void;
  // Hạn "hết giờ" của lượt làm HSA hiện tại (epoch ms) — null = không giới hạn thời gian.
  examDeadline: number | null;
}

export default function SubmitHomeworkView({
  open, onClose, title, pdfUrl, submitObjective, submitEssay, cfg,
  studentAnswers, onAnswersChange, examType, hsaCfg, hsaAnswers, onHsaAnswersChange,
  submitFiles, onAddFiles, onRemoveFile, loading, canDoSubmit, onSubmit, examDeadline,
}: Props) {
  const isMobile = useIsMobile();
  const [showDe, setShowDe] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [splitPct, setSplitPct] = useState(50); // % chiều rộng dành cho đề (chỉ máy tính, kéo được)
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const splitRowRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) { setShowDe(false); setZoom(1); setSplitPct(50); }
    if (!open && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Theo dõi trạng thái toàn màn hình (kể cả khi học sinh bấm Esc để thoát thay vì bấm nút)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // Đồng hồ đếm ngược (chỉ bài HSA có giới hạn thời gian): cập nhật mỗi giây trong khi đang mở.
  useEffect(() => {
    if (!open) return;
    autoSubmittedRef.current = false;
    setNowTick(Date.now());
    if (examType !== 'hsa' || !examDeadline) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, examType, examDeadline]);

  const remainingMs = open && examType === 'hsa' && examDeadline ? examDeadline - nowTick : null;

  // Hết giờ mà chưa nộp → tự động nộp (kể cả khi vừa quay lại trang sau khi đã hết giờ từ trước).
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0) return;
    if (autoSubmittedRef.current || loading) return;
    autoSubmittedRef.current = true;
    onSubmit();
  }, [remainingMs, loading, onSubmit]);

  // Kéo thanh chia tỉ lệ đề/bài làm (chỉ máy tính) — theo dõi chuột trên toàn trang khi đang kéo
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitRowRef.current) return;
      const rect = splitRowRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!open) return null;

  const dePanel = pdfUrl && (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <PdfCanvasViewer url={pdfUrl} zoom={zoom} />
      <div style={{
        position: 'absolute', bottom: 14, right: 14, display: 'flex', alignItems: 'center', gap: 2,
        background: 'rgba(32,32,40,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 99, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', padding: 3,
      }}>
        <button type="button" className="zoom-pill-btn" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, round2(z - ZOOM_STEP)))} title="Thu nhỏ" disabled={zoom <= ZOOM_MIN}>
          <Minus size={15} />
        </button>
        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fff', minWidth: 40, textAlign: 'center', letterSpacing: 0.2 }}>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className="zoom-pill-btn" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, round2(z + ZOOM_STEP)))} title="Phóng to" disabled={zoom >= ZOOM_MAX}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );

  const isLowTime = remainingMs !== null && remainingMs <= 5 * 60 * 1000;
  const timerBar = examType === 'hsa' && (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5, marginBottom: '1.25rem',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.9rem', borderRadius: 10,
      background: examDeadline ? (isLowTime ? '#FFEBEE' : '#FFF3E0') : '#F5F5F5',
      color: examDeadline ? (isLowTime ? '#C62828' : '#E65100') : '#888',
      fontWeight: 700, fontSize: '0.92rem',
    }}>
      <Timer size={16} />
      {examDeadline
        ? (remainingMs !== null && remainingMs > 0
          ? <>Thời gian còn lại: {formatRemaining(remainingMs)}</>
          : <>Hết giờ — đang tự động nộp bài...</>)
        : <>Không giới hạn thời gian làm bài</>}
    </div>
  );

  const answerPanel = (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', height: '100%' }}>
      {timerBar}
      {examType === 'hsa' && hsaCfg ? (
        <div style={{ marginBottom: '1.25rem' }}>
          <HsaSolver cfg={hsaCfg} value={hsaAnswers} onChange={onHsaAnswersChange} />
        </div>
      ) : submitObjective && cfg && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PartsSolver cfg={cfg} value={studentAnswers} onChange={onAnswersChange} />
        </div>
      )}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5F5F5', borderRadius: 8, fontSize: '0.82rem', color: '#666' }}>
        {examType === 'hsa'
          ? <>Chọn/điền đáp án các câu ở trên. Hệ thống tự động chấm và cho kết quả ngay sau khi nộp.</>
          : submitObjective
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
    <div ref={rootRef} style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 1000, display: 'flex', flexDirection: 'column' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '0.7rem 0.85rem' : '0.85rem 1.5rem', borderBottom: '1px solid #EEE', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Đóng"><X size={18} /></button>
        <span style={{ fontWeight: 700, fontSize: isMobile ? '0.92rem' : '1.05rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {isMobile && pdfUrl && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDe((v) => !v)}>
            <FileText size={13} /> {showDe ? 'Ẩn đề' : 'Xem đề'}
          </button>
        )}
        {document.fullscreenEnabled && (
          <button className="btn btn-ghost btn-sm btn-icon" onClick={toggleFullscreen} title={isFullscreen ? 'Thoát toàn màn hình' : 'Phóng to toàn màn hình'}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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
        <div ref={splitRowRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {pdfUrl && (
            <>
              <div style={{ width: `${splitPct}%`, background: '#2A2A35', flexShrink: 0 }}>
                {dePanel}
              </div>
              <div onMouseDown={startDrag} title="Kéo để đổi tỉ lệ"
                style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: '#EEE', borderLeft: '1px solid #E0E0E0', borderRight: '1px solid #E0E0E0' }} />
            </>
          )}
          <div style={{ width: pdfUrl ? `${100 - splitPct}%` : '100%' }}>{answerPanel}</div>
        </div>
      )}
    </div>
  );
}
