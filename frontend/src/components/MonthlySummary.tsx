import { Fragment, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { toast } from './Toast';
import useIsMobile from '../lib/useIsMobile';
import { CalendarRange, Download, Loader2 } from 'lucide-react';

// Tab "Tổng kết tháng" của lớp (giáo viên / admin): mỗi BTVN tạo trong tháng là 1 buổi, mỗi buổi 2 cột điểm
// (BTVN + 10 phút — cùng số liệu với mục Nhận xét), cột cuối "Kiểm tra cuối tháng" (hệ số 2) giáo viên tự điền,
// rồi điểm TB + hạng (đây cũng là điểm dùng cho bảng xếp hạng tháng). Bảng trải ngang: thiếu chỗ thì kéo ngang để
// xem (không thu nhỏ chữ); xuất PDF khổ A4 NGANG, các cột tự chia vừa khít bề ngang trang.

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));
const monthLabel = (ym: string) => { const [y, m] = (ym || '').split('-'); return y && m ? `${parseInt(m)}/${y}` : ym; };
// Ngày (giờ VN) của mốc tạo bài: "dd/mm"
function dayLabel(v: string) {
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? v.replace(' ', 'T') + 'Z' : v;
  const t = new Date(s).getTime();
  if (isNaN(t)) return '';
  const d = new Date(t + 7 * 3600e3); // giờ Việt Nam
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function tone(v: number | null | undefined) {
  if (v === null || v === undefined) return { c: '#BBB', b: 'transparent' };
  return v >= 8 ? { c: '#2E7D32', b: '#E8F5E9' } : v >= 6.5 ? { c: '#1565C0', b: '#E3F2FD' } : v >= 5 ? { c: '#E65100', b: '#FFF3E0' } : { c: '#C62828', b: '#FFEBEE' };
}
const MEDAL = ['🥇', '🥈', '🥉'];

// Ô nhập điểm kiểm tra cuối tháng (0–10, nhận dấu phẩy); lưu khi rời ô / Enter
function TestInput({ value, onSave }: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const shown = value === null || value === undefined ? '' : String(value).replace('.', ',');
  const [text, setText] = useState(shown);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { setText(shown); }, [shown]);
  const commit = async () => {
    const t = text.trim();
    if (t === shown) return;
    const v = t === '' ? null : Number(t.replace(',', '.'));
    if (v !== null && !(Number.isFinite(v) && v >= 0 && v <= 10)) { toast.error('Điểm kiểm tra phải từ 0 đến 10'); setText(shown); return; }
    setState('saving');
    try { await onSave(v); setState('saved'); setTimeout(() => setState('idle'), 1200); }
    catch { setState('error'); setText(shown); }
  };
  const border = state === 'saved' ? '#2E7D32' : state === 'error' ? '#C62828' : '#D0D0D0';
  return (
    <input value={text} inputMode="decimal" placeholder="—" aria-label="Điểm kiểm tra cuối tháng"
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(shown); (e.target as HTMLInputElement).blur(); } }}
      style={{ width: 54, padding: '4px 6px', border: `1.5px solid ${border}`, borderRadius: 7, textAlign: 'center', fontSize: '0.88rem', fontWeight: 700, color: '#6A1B9A', background: state === 'saving' ? '#FAFAFA' : 'white', outline: 'none' }} />
  );
}

// Bảng điểm — dùng cho cả màn hình (forPdf=false: cột có bề rộng tối thiểu, kéo ngang) và bản PDF
// (forPdf=true: table-layout cố định, các cột điểm chia đều phần bề ngang còn lại → vừa khít trang A4 ngang)
function ScoreTable({ data, forPdf, onSaveTest }: { data: any; forPdf: boolean; onSaveTest?: (sid: number, v: number | null) => Promise<void> }) {
  const sessions: any[] = data.sessions;
  const fs = forPdf ? (sessions.length > 10 ? 11 : 12.5) : 14;
  const th = { padding: forPdf ? '6px 3px' : '8px 6px', fontSize: fs * 0.82, fontWeight: 700, color: '#666', background: '#FAFAFA', borderBottom: '1px solid #EEE', borderLeft: '1px solid #F0F0F0', textAlign: 'center' as const, whiteSpace: 'nowrap' as const, textTransform: 'none' as const, letterSpacing: 0 };
  const td = { padding: forPdf ? '6px 3px' : '7px 6px', fontSize: fs, borderTop: '1px solid #F2F2F2', borderLeft: '1px solid #F5F5F5', textAlign: 'center' as const, whiteSpace: 'nowrap' as const };
  // Màn hình: cột STT + Họ tên dính bên trái khi kéo ngang
  const stick = (left: number, bg: string) => (forPdf ? {} : { position: 'sticky' as const, left, zIndex: 1, background: bg });
  const NAME_W = forPdf ? 190 : 180;

  return (
    <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: forPdf ? '100%' : undefined, minWidth: forPdf ? undefined : '100%', tableLayout: forPdf ? 'fixed' : 'auto' }}>
      {forPdf && (
        <colgroup>
          <col style={{ width: 32 }} /><col style={{ width: NAME_W }} />
          {sessions.map((s) => <Fragment key={s.id}><col /><col /></Fragment>)}
          <col style={{ width: 74 }} /><col style={{ width: 58 }} /><col style={{ width: 52 }} />
        </colgroup>
      )}
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...th, ...stick(0, '#FAFAFA'), width: 34, minWidth: 34, maxWidth: 34, boxSizing: 'border-box', borderLeft: 'none' }}>STT</th>
          <th rowSpan={2} style={{ ...th, ...stick(34, '#FAFAFA'), textAlign: 'left', minWidth: forPdf ? undefined : NAME_W }}>Họ và tên</th>
          {sessions.map((s, i) => (
            <th key={s.id} colSpan={2} title={s.title} style={{ ...th, color: '#1A1A2E' }}>
              Buổi {i + 1}<div style={{ fontWeight: 500, color: '#999', fontSize: fs * 0.72 }}>{dayLabel(s.created_at)}</div>
            </th>
          ))}
          <th rowSpan={2} style={{ ...th, color: '#6A1B9A', whiteSpace: 'normal', minWidth: forPdf ? undefined : 82 }}>KT cuối tháng<div style={{ fontWeight: 500, fontSize: fs * 0.72 }}>hệ số 2</div></th>
          <th rowSpan={2} style={{ ...th, color: '#C62828', minWidth: forPdf ? undefined : 58 }}>ĐTB</th>
          <th rowSpan={2} style={{ ...th, minWidth: forPdf ? undefined : 52 }}>Hạng</th>
        </tr>
        <tr>
          {sessions.map((s) => (
            <Fragment key={s.id}>
              <th style={{ ...th, fontWeight: 600, minWidth: forPdf ? undefined : 52 }}>BTVN</th>
              <th style={{ ...th, fontWeight: 600, color: '#1565C0', minWidth: forPdf ? undefined : 46 }}>10p</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.students.map((st: any, i: number) => {
          const bg = i % 2 ? '#FCFCFC' : '#FFFFFF';
          const t = tone(st.avg);
          return (
            <tr key={st.id} data-pdf-break style={{ background: bg }}>
              <td style={{ ...td, ...stick(0, bg), width: 34, minWidth: 34, maxWidth: 34, boxSizing: 'border-box', color: '#999', borderLeft: 'none' }}>{i + 1}</td>
              <td style={{ ...td, ...stick(34, bg), textAlign: 'left', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }} title={st.full_name}>{st.full_name}</td>
              {st.cells.map((c: any, k: number) => (
                <Fragment key={k}>
                  <td style={{ ...td, fontWeight: 600, color: c.missing ? '#C62828' : c.btvn === null ? '#BBB' : '#1A1A2E' }} title={c.missing ? 'Quá hạn, chưa nộp bài' : undefined}>{fmt(c.btvn)}</td>
                  <td style={{ ...td, color: c.quiz === null ? '#CCC' : '#1565C0', fontWeight: 600 }}>{fmt(c.quiz)}</td>
                </Fragment>
              ))}
              <td style={{ ...td }}>
                {onSaveTest && !forPdf
                  ? <TestInput value={st.test} onSave={(v) => onSaveTest(st.id, v)} />
                  : <span style={{ fontWeight: 700, color: st.test === null ? '#BBB' : '#6A1B9A' }}>{fmt(st.test)}</span>}
              </td>
              <td style={{ ...td }}>
                <span style={{ fontWeight: 800, color: t.c, background: t.b, borderRadius: 99, padding: '2px 9px' }}>{fmt(st.avg)}</span>
              </td>
              <td style={{ ...td, fontWeight: 800 }}>{st.rank ? (st.rank <= 3 ? `${MEDAL[st.rank - 1]} ${st.rank}` : st.rank) : '—'}</td>
            </tr>
          );
        })}
        {data.students.length === 0 && (
          <tr><td colSpan={5 + sessions.length * 2} style={{ ...td, padding: '1.5rem', color: '#999' }}>Lớp chưa có học sinh</td></tr>
        )}
      </tbody>
    </table>
  );
}

function Card({ data, isMobile, forPdf = false, months, onMonth, onDownload, downloading, onSaveTest }: any) {
  const scored = data.students.filter((s: any) => s.avg !== null);
  const classAvg = scored.length ? scored.reduce((a: number, s: any) => a + s.avg, 0) / scored.length : null;
  const top = scored.length ? Math.max(...scored.map((s: any) => s.avg)) : null;
  const testsIn = data.students.filter((s: any) => s.test !== null).length;
  const stats = [
    { label: 'Số buổi trong tháng', value: String(data.sessions.length), sub: 'tính theo ngày tạo BTVN' },
    { label: 'Điểm TB cả lớp', value: fmt(classAvg === null ? null : Math.round(classAvg * 100) / 100), sub: `${scored.length}/${data.students.length} HS có điểm` },
    { label: 'Điểm TB cao nhất', value: fmt(top), sub: top === null ? 'chưa có điểm' : `${scored.filter((s: any) => s.avg === top).length} HS đạt mức này` },
    { label: 'Kiểm tra cuối tháng', value: `${testsIn}/${data.students.length}`, sub: data.test_counted ? 'thiếu điểm tính 0' : 'chưa tính (chưa nhập điểm)' },
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', ...(forPdf ? { boxShadow: 'none', borderRadius: 0 } : {}) }}>
      {/* Dải tiêu đề */}
      <div data-pdf-break style={{ background: 'linear-gradient(135deg, #C62828, #8E0000)', color: 'white', padding: isMobile ? '1rem 1.1rem' : '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CalendarRange size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 800, lineHeight: 1.2 }}>Tổng kết tháng {monthLabel(data.month)}</div>
            <div style={{ fontSize: '0.88rem', opacity: 0.9, marginTop: 2 }}>Lớp {data.class_title}{data.course_title ? ` · ${data.course_title}` : ''}</div>
          </div>
          {!forPdf && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="input" value={data.month} onChange={(e) => onMonth(e.target.value)} style={{ width: 'auto', minWidth: 140, background: 'white', color: '#1A1A2E', fontWeight: 600 }}>
                {months.map((m: string) => <option key={m} value={m}>Tháng {monthLabel(m)}</option>)}
              </select>
              <button className="btn btn-sm" onClick={onDownload} disabled={downloading} style={{ background: 'white', color: '#C62828', border: 'none', fontWeight: 700 }}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {downloading ? 'Đang tạo...' : 'Tải PDF'}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {[`Sĩ số ${data.students.length}`, `${data.sessions.length} buổi`, 'BTVN + điểm 10 phút mỗi buổi', 'KT cuối tháng hệ số 2'].map((t) => (
            <span key={t} style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 99, padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? '1rem' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div data-pdf-break style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ border: '1px solid #EEE', borderRadius: 12, padding: '0.8rem 1rem', background: '#FCFCFC' }}>
              <div style={{ fontSize: '0.78rem', color: '#888' }}>{s.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#C62828', lineHeight: 1.3 }}>{s.value}</div>
              <div style={{ fontSize: '0.74rem', color: '#999' }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div data-pdf-break style={{ fontSize: '0.78rem', color: '#777', lineHeight: 1.6 }}>
          <strong>Cách tính:</strong> ĐTB = (tổng điểm BTVN + tổng điểm 10 phút + 2 × điểm kiểm tra cuối tháng) ÷ (số điểm BTVN + số điểm 10 phút + 2).
          BTVN quá hạn chưa nộp tính <span style={{ color: '#C62828', fontWeight: 700 }}>0</span>; buổi không có điểm 10 phút thì bỏ qua;
          thiếu điểm kiểm tra cuối tháng tính 0 (khi tháng đã kết thúc hoặc lớp đã nhập điểm kiểm tra).
          {!forPdf && <> Kéo ngang bảng để xem đủ các buổi.</>}
        </div>
        <div style={{ border: '1px solid #EEE', borderRadius: 12, overflowX: forPdf ? 'visible' : 'auto', WebkitOverflowScrolling: 'touch' }}>
          <ScoreTable data={data} forPdf={forPdf} onSaveTest={onSaveTest} />
        </div>
      </div>
    </div>
  );
}

// Ảnh chụp bảng → PDF A4 NGANG, chỉ ngắt trang ở ranh giới dòng (data-pdf-break)
async function exportLandscapePdf(node: HTMLElement, filename: string) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const margin = 7;
  const imgW = 297 - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pageHpx = Math.floor((210 - margin * 2) * pxPerMm);
  const ratio = canvas.width / node.offsetWidth;
  const top = node.getBoundingClientRect().top;
  const cuts = Array.from(node.querySelectorAll('[data-pdf-break]')).map((el) => Math.round((el.getBoundingClientRect().bottom - top) * ratio));
  let y = 0; let first = true;
  while (y < canvas.height - 2) {
    let end = Math.min(y + pageHpx, canvas.height);
    if (end < canvas.height) { const fit = cuts.filter((c) => c > y + 20 && c <= end); if (fit.length) end = fit[fit.length - 1]; }
    const slice = document.createElement('canvas');
    slice.width = canvas.width; slice.height = end - y;
    slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, (end - y) / pxPerMm);
    first = false; y = end;
  }
  pdf.save(filename);
}

// Bề rộng khung dựng bản PDF (px) — tỉ lệ đúng khổ A4 ngang trừ lề, chữ vẫn đủ lớn khi in
const PDF_WIDTH = 1400;

export default function MonthlySummary({ classId }: { classId: string | number }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState('');
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const load = (m = month) => api.get(`/teacher/classes/${classId}/monthly-summary`, { params: m ? { month: m } : {} })
    .then((r) => { setData(r.data); setMonth(r.data.month); })
    .catch((err) => toast.error(err.response?.data?.message || 'Không tải được tổng kết tháng'));
  useEffect(() => { load(''); }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTest = async (sid: number, v: number | null) => {
    try {
      await api.put(`/teacher/classes/${classId}/month-tests`, { month: data.month, scores: [{ student_id: sid, score: v }] });
      await load(data.month); // ĐTB + hạng tính lại ở server
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không lưu được điểm kiểm tra');
      throw err;
    }
  };

  useEffect(() => {
    if (!exporting) return;
    let cancelled = false;
    const frame = requestAnimationFrame(async () => {
      try {
        if (!pdfRef.current) throw new Error('no node');
        const cls = String(data.class_title || '').replace(/[\\/:*?"<>|]/g, '').trim();
        await exportLandscapePdf(pdfRef.current, `Tổng kết tháng ${monthLabel(data.month).replace('/', '-')} ${cls}.pdf`);
        if (!cancelled) toast.success('Đã tải file PDF');
      } catch {
        if (!cancelled) toast.error('Không tạo được file PDF');
      } finally {
        if (!cancelled) setExporting(false);
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [exporting]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Đang tải tổng kết tháng…</div>;

  return (
    <>
      <Card data={data} isMobile={isMobile} months={data.months} onMonth={(m: string) => { setMonth(m); load(m); }}
        onDownload={() => setExporting(true)} downloading={exporting} onSaveTest={saveTest} />
      {exporting && (
        <div style={{ position: 'fixed', left: -100000, top: 0, width: PDF_WIDTH, pointerEvents: 'none' }} aria-hidden>
          <div ref={pdfRef} style={{ width: PDF_WIDTH, background: 'white' }}>
            <Card data={data} isMobile={false} forPdf />
          </div>
        </div>
      )}
    </>
  );
}
