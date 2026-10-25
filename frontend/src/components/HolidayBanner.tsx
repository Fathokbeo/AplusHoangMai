import { useState } from 'react';
import { X } from 'lucide-react';
import { useHoliday } from '../lib/holiday/store';

// Dải lời chúc theo dịp lễ (đầu vùng nội dung / dưới thanh điều hướng trang công khai).
// Bấm × để ẩn — ẩn cho tới hết dịp đó trong năm (lưu trên trình duyệt).
export default function HolidayBanner({ style }: { style?: React.CSSProperties }) {
  const occ = useHoliday();
  const key = occ ? `aplus-holiday-banner-${occ.id}-${new Date().getFullYear()}` : '';
  const [hidden, setHidden] = useState<string | null>(() => {
    try { return key && localStorage.getItem(key) ? key : null; } catch { return null; }
  });
  if (!occ || hidden === key) return null;

  const close = () => {
    try { localStorage.setItem(key, '1'); } catch { /* bỏ qua */ }
    setHidden(key);
  };

  return (
    <div className="hd-banner" role="note" style={style}>
      <span className="hd-banner-art" aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="hd-banner-label">{occ.label}</div>
        <div className="hd-banner-text">{occ.message}</div>
      </div>
      <button type="button" className="hd-banner-close" onClick={close} title="Ẩn lời chúc" aria-label="Ẩn lời chúc"><X size={16} /></button>
    </div>
  );
}
