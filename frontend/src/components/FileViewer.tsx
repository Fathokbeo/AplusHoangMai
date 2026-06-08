import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';

const isPdf = (url: string) => url.split('?')[0].toLowerCase().endsWith('.pdf');

// Xem 1 hoặc nhiều tài liệu (ảnh / PDF). Có điều hướng + dải thumbnail khi nhiều file.
export default function FileViewer({ files, onClose }: { files: string[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  if (!files || files.length === 0) return null;

  const i = Math.min(idx, files.length - 1);
  const url = files[i];
  const multi = files.length > 1;
  const go = (delta: number) => setIdx((p) => (p + delta + files.length) % files.length);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, width: '90vw', height: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Xem tài liệu {multi && <span style={{ color: '#888', fontWeight: 400 }}>({i + 1}/{files.length})</span>}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer"><Download size={13} /> Tải về</a>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'auto', background: '#2A2A35', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isPdf(url)
            ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} title="PDF" />
            : <img src={url} alt={`Trang ${i + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}

          {multi && (
            <>
              <button onClick={() => go(-1)} aria-label="Trước" style={navBtnStyle('left')}><ChevronLeft size={22} /></button>
              <button onClick={() => go(1)} aria-label="Sau" style={navBtnStyle('right')}><ChevronRight size={22} /></button>
            </>
          )}
        </div>

        {multi && (
          <div style={{ display: 'flex', gap: 6, padding: 8, overflowX: 'auto', borderTop: '1px solid #EEE', background: '#FAFAFA' }}>
            {files.map((f, k) => (
              <button key={k} onClick={() => setIdx(k)} title={`Trang ${k + 1}`}
                style={{
                  width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', padding: 0,
                  border: k === i ? '2px solid #C62828' : '2px solid transparent', background: '#EEE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {isPdf(f)
                  ? <FileText size={20} color="#C62828" />
                  : <img src={f} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 12,
    width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(0,0,0,0.45)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as React.CSSProperties;
}
