import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Download, Loader2 } from 'lucide-react';
import { buildStudentReview, summarizeEssayFeedback, homeworkHasEssay, ERROR_TAGS, type ErrorTag } from '../lib/feedbackSummary';
import useIsMobile from '../lib/useIsMobile';
import { toast } from './Toast';

// Mục "Nhận xét" trên thanh chọn ở trang chi tiết bài tập (giáo viên): tổng quan điểm cả lớp + phổ điểm
// + nhận xét từng học sinh (đầy đủ như file Excel: nhận xét chi tiết + nhận xét tự luận ngắn gọn) kèm
// nhãn lỗi. Mức điểm tính theo tỉ lệ trên thang của bài (quy về thang 10). Tải được ra file PDF.

const BANDS = [
  { key: 'good', label: 'Tốt', min: 0.85, color: '#2E7D32', bg: '#E8F5E9' },
  { key: 'fair', label: 'Khá', min: 0.75, color: '#1565C0', bg: '#E3F2FD' },
  { key: 'avg', label: 'Trung bình', min: 0.65, color: '#E65100', bg: '#FFF3E0' },
  { key: 'weak', label: 'Cần cố gắng', min: 0, color: '#C62828', bg: '#FFEBEE' },
] as const;

const bandOf = (ratio: number) => BANDS.find((b) => ratio >= b.min)!;
const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
// Ngưỡng hiển thị theo thang của bài, làm tròn 0,25 cho dễ đọc
const at = (ratio: number, max: number) => Math.round(ratio * max * 4) / 4;

const TAG_SHORT: Record<ErrorTag, string> = Object.fromEntries(ERROR_TAGS.map((t) => [t.key, t.short])) as Record<ErrorTag, string>;

// Bản PDF luôn dựng ở bố cục máy tính với bề rộng cố định (không phụ thuộc màn hình đang dùng)
const PDF_WIDTH = 900;

// "Nhận xét 12A1 18-10-2026.pdf" — ngày là ngày tải file
function pdfFileName(classTitle: string | undefined) {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const cls = String(classTitle || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `Nhận xét ${cls ? `${cls} ` : ''}${date}.pdf`;
}

// Chụp khối nhận xét thành ảnh rồi chia trang A4; chỉ ngắt trang ở ranh giới các khối/dòng
// (đánh dấu data-pdf-break) để không cắt đôi một dòng học sinh.
async function exportPdf(node: HTMLElement, filename: string) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const margin = 8;
  const imgW = 210 - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pageHpx = Math.floor((297 - margin * 2) * pxPerMm);
  const ratio = canvas.width / node.offsetWidth;
  const top = node.getBoundingClientRect().top;
  const cuts = Array.from(node.querySelectorAll('[data-pdf-break]'))
    .map((el) => Math.round((el.getBoundingClientRect().bottom - top) * ratio));

  let y = 0;
  let first = true;
  while (y < canvas.height - 2) {
    let end = Math.min(y + pageHpx, canvas.height);
    if (end < canvas.height) {
      const fit = cuts.filter((c) => c > y + 20 && c <= end);
      if (fit.length) end = fit[fit.length - 1];
    }
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = end - y;
    slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, (end - y) / pxPerMm);
    first = false;
    y = end;
  }
  pdf.save(filename);
}

type CardProps = {
  hw: any;
  roster: any[];
  isMobile: boolean;
  forPdf?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
};

function ReportCard({ hw, roster, isMobile, forPdf = false, downloading = false, onDownload }: CardProps) {
  const max = hw.max_score > 0 ? hw.max_score : 10;
  const essayOn = homeworkHasEssay(hw);

  const rows = roster.map((s) => ({ s, review: buildStudentReview(s, hw) }));
  const scores = rows.flatMap(({ review }) => (review.kind === 'graded' ? [review.score] : []));
  const graded = scores.length;
  const avg = graded ? scores.reduce((a, b) => a + b, 0) / graded : null;
  const top = graded ? Math.max(...scores) : null;
  const topCount = top === null ? 0 : scores.filter((x) => x === top).length;
  const fairUp = scores.filter((x) => x / max >= 0.75).length;
  const bandCounts = BANDS.map((b, i) => ({
    ...b,
    count: scores.filter((x) => { const r = x / max; return r >= b.min && (i === 0 || r < BANDS[i - 1].min); }).length,
  }));
  const bandRange = (i: number) => {
    const b = BANDS[i];
    if (i === 0) return `${fmt(at(b.min, max))} – ${fmt(max)}`;
    if (b.min === 0) return `Dưới ${fmt(at(BANDS[i - 1].min, max))}`;
    return `${fmt(at(b.min, max))} – <${fmt(at(BANDS[i - 1].min, max))}`;
  };

  const stats = [
    { label: 'Có kết quả', value: `${graded}/${roster.length}`, sub: `${roster.length - graded} HS chưa có điểm` },
    { label: 'Điểm trung bình', value: avg === null ? '—' : fmt(Math.round(avg * 100) / 100), sub: `trên thang ${fmt(max)} điểm` },
    { label: 'Điểm cao nhất', value: top === null ? '—' : fmt(top), sub: top === null ? 'chưa có điểm' : `${topCount} HS đạt mức này` },
    { label: `Từ ${fmt(at(0.75, max))} điểm trở lên`, value: `${fairUp} HS`, sub: graded ? `${Math.round((fairUp / graded) * 100)}% HS có điểm` : '—' },
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', ...(forPdf ? { boxShadow: 'none', borderRadius: 0 } : {}) }}>
      {/* Dải tiêu đề */}
      <div data-pdf-break style={{ background: 'linear-gradient(135deg, #C62828, #8E0000)', color: 'white', padding: isMobile ? '1rem 1.1rem' : '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.8, fontWeight: 700 }}>
            Bài tập về nhà{hw.due_date ? ` · hạn ${new Date(hw.due_date).toLocaleDateString('vi-VN')}` : ''}
          </div>
          <div style={{ fontSize: isMobile ? '1.25rem' : '1.55rem', fontWeight: 800, margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquareText size={isMobile ? 20 : 24} /> Nhận xét
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: forPdf ? 'normal' : 'nowrap' }}>
            {hw.title} · điểm tối đa {fmt(max)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '40%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {hw.class_title && !isMobile && (
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Lớp</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hw.class_title}</div>
            </div>
          )}
          {!forPdf && onDownload && (
            <button className="btn btn-sm" onClick={onDownload} disabled={downloading} title="Tải phần nhận xét ra file PDF"
              style={{ background: 'white', color: '#C62828', border: 'none', fontWeight: 700 }}>
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {downloading ? 'Đang tạo...' : 'Tải PDF'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: isMobile ? '1rem' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* 4 ô tổng quan */}
        <div data-pdf-break style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {stats.map((st) => (
            <div key={st.label} style={{ border: '1px solid #EEE', borderRadius: 12, padding: '0.85rem 1rem', background: '#FCFCFC' }}>
              <div style={{ fontSize: '0.78rem', color: '#888' }}>{st.label}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#C62828', lineHeight: 1.3 }}>{st.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#999' }}>{st.sub}</div>
            </div>
          ))}
        </div>

        {/* Phổ điểm */}
        <div data-pdf-break>
          <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 10 }}>Phổ điểm</div>
          {graded === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>Chưa có học sinh nào có điểm</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 4, height: 14 }}>
                {bandCounts.filter((b) => b.count > 0).map((b) => (
                  <div key={b.key} title={`${b.label}: ${b.count} HS`} style={{ flex: b.count, background: b.color, borderRadius: 99 }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                {bandCounts.map((b, i) => (
                  <div key={b.key} style={{ fontSize: '0.8rem', color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                    {bandRange(i)}: <strong style={{ color: '#1A1A2E' }}>{b.count} HS</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Nhận xét từng học sinh */}
        <div>
          <div data-pdf-break>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Nhận xét từng học sinh</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.75rem', color: '#777', marginBottom: 4 }}>
              {BANDS.map((b, i) => (
                <span key={b.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 5, borderRadius: 99, background: b.color }} />{b.label} ({bandRange(i)})
                </span>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#777', marginBottom: 10 }}>
              <strong>Nhãn lỗi:</strong> {ERROR_TAGS.map((t) => `${t.short} – ${t.label}`).join(' · ')}
            </div>
          </div>

          <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
            {!isMobile && (
              <div data-pdf-break style={{ display: 'grid', gridTemplateColumns: '44px minmax(130px, 1fr) 140px minmax(0, 3.2fr)', gap: 12, padding: '0.6rem 1rem', background: '#FAFAFA', fontSize: '0.72rem', fontWeight: 700, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <span>STT</span><span>Họ và tên</span><span>Điểm</span><span>Nhận xét</span>
              </div>
            )}
            {rows.map(({ s, review }, i) => {
              const missing = review.kind === 'missing';
              const band = review.kind === 'graded' ? bandOf(review.score / max) : null;
              const scoreCell = review.kind === 'graded' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: '#F0F0F0', borderRadius: 99, overflow: 'hidden', maxWidth: 80 }}>
                    <div style={{ width: `${Math.min(100, (review.score / max) * 100)}%`, height: '100%', background: band!.color, borderRadius: 99 }} />
                  </div>
                  <strong style={{ fontSize: '0.88rem', minWidth: 34, textAlign: 'right' }}>{fmt(review.score)}</strong>
                </div>
              ) : missing ? (
                <span style={{ background: '#C62828', color: 'white', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>Chưa nộp bài</span>
              ) : (
                <span className="badge badge-gray">{review.kind === 'pending' ? 'Chưa có điểm' : 'Chưa nộp'}</span>
              );
              // Nội dung như file Excel: cột "Nhận xét" (chi tiết) + cột "Nhận xét tự luận" (ngắn gọn)
              const detailed = review.kind === 'graded' ? (String(s.feedback || '').trim() || review.text) : review.text;
              const essayLine = essayOn && review.kind === 'graded' ? summarizeEssayFeedback(s, hw) : '';
              const comment = (
                <div>
                  <div style={{ fontSize: '0.84rem', lineHeight: 1.55, whiteSpace: 'pre-line', color: missing ? '#C62828' : review.kind === 'graded' ? '#333' : '#999' }}>{detailed}</div>
                  {essayLine && (
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#333', marginTop: 4, paddingLeft: 8, borderLeft: '3px solid #C62828' }}>
                      <strong style={{ color: '#C62828' }}>Tự luận:</strong> {essayLine}
                    </div>
                  )}
                  {review.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                      {review.tags.map((t) => (
                        <span key={t} style={{ fontSize: '0.68rem', fontWeight: 700, color: '#555', border: '1px solid #DDD', borderRadius: 5, padding: '0 6px', background: 'white' }}>{TAG_SHORT[t]}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
              const rowBg = missing ? '#FFF5F5' : i % 2 ? '#FCFCFC' : 'white';
              return isMobile ? (
                <div key={s.student_id} data-pdf-break style={{ padding: '0.75rem 0.9rem', borderTop: i ? '1px solid #F2F2F2' : 'none', background: rowBg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: '0.78rem', color: '#999', width: 20 }}>{i + 1}</span>
                    <strong style={{ flex: 1, fontSize: '0.9rem' }}>{s.full_name}</strong>
                    <div style={{ width: 120 }}>{scoreCell}</div>
                  </div>
                  {comment}
                </div>
              ) : (
                <div key={s.student_id} data-pdf-break style={{ display: 'grid', gridTemplateColumns: '44px minmax(130px, 1fr) 140px minmax(0, 3.2fr)', gap: 12, alignItems: 'center', padding: '0.7rem 1rem', borderTop: '1px solid #F2F2F2', background: rowBg }}>
                  <span style={{ fontSize: '0.85rem', color: '#999' }}>{i + 1}</span>
                  <strong style={{ fontSize: '0.9rem' }}>{s.full_name}</strong>
                  <div>{scoreCell}</div>
                  {comment}
                </div>
              );
            })}
            {rows.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: '#999' }}>Lớp chưa có học sinh</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeworkReport({ hw, roster }: { hw: any; roster: any[] }) {
  const isMobile = useIsMobile();
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Bấm "Tải PDF" → dựng 1 bản ẩn ngoài màn hình (bố cục máy tính, rộng cố định) rồi chụp bản đó
  useEffect(() => {
    if (!exporting) return;
    let cancelled = false;
    // Hủy khung hình đã hẹn nếu effect bị dọn trước khi chạy (StrictMode chạy effect 2 lần ở bản dev)
    const frame = requestAnimationFrame(async () => {
      try {
        if (!pdfRef.current) throw new Error('no node');
        await exportPdf(pdfRef.current, pdfFileName(hw.class_title));
        if (!cancelled) toast.success('Đã tải file PDF');
      } catch {
        if (!cancelled) toast.error('Không tạo được file PDF');
      } finally {
        if (!cancelled) setExporting(false);
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [exporting]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ReportCard hw={hw} roster={roster} isMobile={isMobile} downloading={exporting} onDownload={() => setExporting(true)} />
      {exporting && (
        <div style={{ position: 'fixed', left: -100000, top: 0, width: PDF_WIDTH, pointerEvents: 'none' }} aria-hidden>
          <div ref={pdfRef} style={{ width: PDF_WIDTH, background: 'white' }}>
            <ReportCard hw={hw} roster={roster} isMobile={false} forPdf />
          </div>
        </div>
      )}
    </>
  );
}
