import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import FileViewer from '../../components/FileViewer';
import GradingDetails from '../../components/GradingDetails';
import PartsEditor from '../../components/PartsEditor';
import HsaEditor from '../../components/HsaEditor';
import { toast } from '../../components/Toast';
import useIsMobile from '../../lib/useIsMobile';
import { matchesNameSearch } from '../../lib/vietnameseName';
import {
  emptyPartsConfig, normalizePartsConfig, computeMaxScore, anyPartEnabled, emptyHsaConfig, parseHsaConfig, hsaMaxScore,
  PART_LABELS, PART_ORDER, type PartsConfig, type HsaConfig, type ExamType,
} from '../../lib/homeworkParts';
import { Plus, Edit, Trash2, Eye, EyeOff, FileText, Upload, RefreshCw, Download, Bot, ClipboardCheck, Search, X, ChevronLeft } from 'lucide-react';

// Trang "Thi thử" của admin:
//  - Bài làm: danh sách khách vãng lai đã thi (thông tin học sinh + điểm), xem bài, chấm lại, xuất Excel.
//  - Đề thi: soạn đề bằng đúng bộ công cụ của bài tập (đề PDF, đáp án, các phần / HSA, thời gian làm bài).

type Tab = 'attempts' | 'exams';
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

function scoreTone(score: number, max: number) {
  const r = max > 0 ? score / max : 0;
  return r >= 0.8 ? { c: '#2E7D32', b: '#E8F5E9' } : r >= 0.5 ? { c: '#E65100', b: '#FFF3E0' } : { c: '#C62828', b: '#FFEBEE' };
}

function StatusCell({ a }: { a: any }) {
  if (a.score !== null && a.score !== undefined) {
    const t = scoreTone(a.score, a.max_score);
    return <span style={{ fontWeight: 800, color: t.c, background: t.b, borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>{a.score}/{a.max_score}</span>;
  }
  if (a.grading_status === 'pending' || a.grading_status === 'grading') {
    return <span className="badge badge-blue" style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bot size={11} /> Đang chấm</span>;
  }
  if (a.grading_status === 'failed') return <span className="badge badge-red" style={{ whiteSpace: 'nowrap' }}>Chấm lỗi</span>;
  return <span className="badge badge-gray" style={{ whiteSpace: 'nowrap' }}>Chưa chấm</span>;
}

// ── Bài làm ──────────────────────────────────────────────────────────────────
function AttemptsTab({ exams }: { exams: any[] }) {
  const isMobile = useIsMobile(1000);
  const [rows, setRows] = useState<any[] | null>(null);
  const [examId, setExamId] = useState('');
  const [q, setQ] = useState('');
  const [viewFiles, setViewFiles] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [regrading, setRegrading] = useState<number | null>(null);

  const load = () => api.get('/admin/mock-exams/attempts/list', { params: examId ? { exam_id: examId } : {} })
    .then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Còn bài đang chấm → tự làm mới để cập nhật điểm
  useEffect(() => {
    if (!rows?.some((a) => a.grading_status === 'pending' || a.grading_status === 'grading')) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => (rows || []).filter((a) => !q.trim()
    || matchesNameSearch(a.full_name || '', q) || String(a.parent_phone || '').includes(q.replace(/\s/g, ''))
    || matchesNameSearch(a.school || '', q)), [rows, q]);

  const regrade = async (a: any) => {
    setRegrading(a.id);
    try { await api.post(`/admin/mock-exams/attempts/${a.id}/regrade`); toast.success('Đã chấm lại'); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Chấm lại lỗi'); }
    finally { setRegrading(null); }
  };
  const remove = async (a: any) => {
    if (!confirm(`Xóa bài làm của "${a.full_name}"? Không thể khôi phục.`)) return;
    await api.delete(`/admin/mock-exams/attempts/${a.id}`);
    toast.success('Đã xóa'); load();
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = visible.map((a, i) => ({
      'STT': i + 1, 'Thời gian nộp': fmtTime(a.submitted_at), 'Họ tên': a.full_name, 'Khối': a.grade ?? '', 'Lớp': a.class_name, 'Trường': a.school,
      'ĐTB kì gần nhất': a.gpa, 'SĐT phụ huynh': a.parent_phone, 'Đề thi': a.exam_title,
      'Điểm': a.score ?? '', 'Thang điểm': a.max_score, 'Nhận xét': a.feedback || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 24 }, { wch: 6 }, { wch: 8 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thi thử');
    XLSX.writeFile(wb, `Danh sách thi thử ${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`);
  };

  const fileUrls = (a: any) => (a.files || []).map((f: string) => `/uploads/mock_submissions/${f}`);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <select className="input" style={{ maxWidth: 280 }} value={examId} onChange={(e) => setExamId(e.target.value)}>
          <option value="">Tất cả đề thi</option>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Tìm tên, trường, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Làm mới</button>
          <button className="btn btn-success btn-sm" onClick={exportExcel} disabled={visible.length === 0}><Download size={14} /> Xuất Excel</button>
        </div>
      </div>

      {rows === null ? <div style={{ color: '#999', padding: '2rem', textAlign: 'center' }}>Đang tải…</div>
        : visible.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: '2.5rem' }}>
            <ClipboardCheck size={34} style={{ opacity: 0.35, margin: '0 auto 8px', display: 'block' }} />
            Chưa có bài làm nào{q ? ' khớp tìm kiếm' : ''}.
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((a) => (
              <div key={a.id} className="card" style={{ padding: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{a.full_name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#777' }}>Lớp {a.class_name}{a.grade ? ` (khối ${a.grade})` : ''} · {a.school}</div>
                    <div style={{ fontSize: '0.8rem', color: '#777' }}>ĐTB {a.gpa} · PH {a.parent_phone}</div>
                    <div style={{ fontSize: '0.78rem', color: '#999', marginTop: 2 }}>{a.exam_title} · {fmtTime(a.submitted_at)}</div>
                  </div>
                  <StatusCell a={a} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(a)}><Eye size={13} /> Chi tiết</button>
                  {a.files.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles(fileUrls(a))}><FileText size={13} /> Bài làm ({a.files.length})</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => regrade(a)} disabled={regrading === a.id}><RefreshCw size={13} /> Chấm lại</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#C62828' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Học sinh</th><th style={{ whiteSpace: 'nowrap' }}>ĐTB</th><th style={{ whiteSpace: 'nowrap' }}>SĐT phụ huynh</th><th>Đề thi</th><th>Điểm</th><th style={{ whiteSpace: 'nowrap' }}>Nộp lúc</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id}>
                    {/* Họ tên + lớp/khối/trường gộp 1 ô cho gọn */}
                    <td style={{ minWidth: 180 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{a.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#888' }}>Lớp {a.class_name}{a.grade ? ` · khối ${a.grade}` : ''} · {a.school}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.gpa}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><a href={`tel:${a.parent_phone}`} style={{ color: '#1565C0' }}>{a.parent_phone}</a></td>
                    <td style={{ minWidth: 160, maxWidth: 260 }}>
                      <div title={a.exam_title} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.85rem' }}>{a.exam_title}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}><StatusCell a={a} /></td>
                    <td style={{ whiteSpace: 'nowrap', color: '#888', fontSize: '0.8rem' }}>{fmtTime(a.submitted_at)}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Chi tiết" onClick={() => setDetail(a)}><Eye size={15} /></button>
                      {a.files.length > 0 && <button className="btn btn-ghost btn-sm btn-icon" title="Xem bài làm" onClick={() => setViewFiles(fileUrls(a))}><FileText size={15} /></button>}
                      <button className="btn btn-ghost btn-sm btn-icon" title="Chấm lại" onClick={() => regrade(a)} disabled={regrading === a.id}><RefreshCw size={15} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Xóa" style={{ color: '#C62828' }} onClick={() => remove(a)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Bài làm: ${detail.full_name}` : ''} size="lg">
        {detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                ['Lớp', detail.class_name], ['Trường', detail.school], ['ĐTB kì gần nhất', detail.gpa],
                ['SĐT phụ huynh', detail.parent_phone], ['Đề thi', detail.exam_title], ['Nộp lúc', fmtTime(detail.submitted_at)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: '#FAFAFA', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#999' }}>{k}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <StatusCell a={detail} />
              {detail.files.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles(fileUrls(detail))}><FileText size={13} /> Xem bài làm ({detail.files.length})</button>}
            </div>
            {detail.feedback && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#444', marginBottom: 8 }}><strong>Nhận xét:</strong> {detail.feedback}</div>}
            <GradingDetails details={detail.grading_details} />
          </div>
        )}
      </Modal>
      {viewFiles && <FileViewer files={viewFiles} onClose={() => setViewFiles(null)} />}
    </div>
  );
}

// ── Đề thi ───────────────────────────────────────────────────────────────────
const emptyForm = { title: '', description: '', grade: '', max_score: '10', grading_note: '', exam_type: 'thpt' as ExamType, time_limit_minutes: '', display_order: '0', active: true };
const GRADE_OPTIONS = [6, 7, 8, 9, 10, 11, 12];

function ExamsTab({ exams, reload }: { exams: any[]; reload: () => void }) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [parts, setParts] = useState<PartsConfig>(emptyPartsConfig());
  const [hsa, setHsa] = useState<HsaConfig>(emptyHsaConfig());
  const [files, setFiles] = useState<{ pdf?: File; answer?: File }>({});
  const [saving, setSaving] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditing(null); setForm(emptyForm); setParts(emptyPartsConfig()); setHsa(emptyHsaConfig()); setFiles({}); setModal(true);
  };
  const openEdit = (e: any) => {
    setEditing(e);
    setForm({
      title: e.title, description: e.description || '', grade: e.grade ? String(e.grade) : '', max_score: String(e.max_score ?? 10), grading_note: e.grading_note || '',
      exam_type: e.exam_type === 'hsa' ? 'hsa' : 'thpt', time_limit_minutes: e.time_limit_minutes ? String(e.time_limit_minutes) : '',
      display_order: String(e.display_order ?? 0), active: !!e.active,
    });
    setParts(normalizePartsConfig(e.parts_config));
    setHsa(parseHsaConfig(e.hsa_config) || emptyHsaConfig());
    setFiles({});
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Cần tiêu đề đề thi'); return; }
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, k === 'active' ? (v ? '1' : '0') : String(v)));
      body.append('parts_config', JSON.stringify(parts));
      body.append('hsa_config', JSON.stringify(hsa));
      if (files.pdf) body.append('pdf_file', files.pdf);
      if (files.answer) body.append('answer_file', files.answer);
      if (editing) await api.put(`/admin/mock-exams/${editing.id}`, body);
      else await api.post('/admin/mock-exams', body);
      toast.success(editing ? 'Đã cập nhật đề thi' : 'Đã thêm đề thi');
      setModal(false); reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi lưu đề thi');
    } finally { setSaving(false); }
  };

  const toggleActive = async (e: any) => {
    const body = new FormData(); body.append('active', e.active ? '0' : '1');
    await api.put(`/admin/mock-exams/${e.id}`, body); reload();
  };
  const remove = async (e: any) => {
    if (!confirm(`Xóa đề "${e.title}"?\n\nToàn bộ ${e.attempt_count || 0} bài làm của đề này cũng bị xóa. Không thể khôi phục.`)) return;
    await api.delete(`/admin/mock-exams/${e.id}`); toast.success('Đã xóa đề thi'); reload();
  };
  const removeFile = async (kind: 'pdf' | 'answer') => {
    if (!editing || !confirm(kind === 'pdf' ? 'Xóa file đề?' : 'Xóa file đáp án?')) return;
    await api.delete(`/admin/mock-exams/${editing.id}/files/${kind}`);
    setEditing({ ...editing, ...(kind === 'pdf' ? { pdf_file: null, pdf_name: null } : { answer_file: null, answer_name: null }) });
    reload();
  };

  const partSummary = (e: any) => {
    if (e.exam_type === 'hsa') { const c = parseHsaConfig(e.hsa_config); return c ? `HSA · ${c.questions.length} câu` : 'HSA'; }
    const c = normalizePartsConfig(e.parts_config);
    const on = PART_ORDER.filter((k) => (k === 'essay' ? c.essay.enabled : (c as any)[k].enabled));
    return on.length ? on.map((k) => PART_LABELS[k]).join(' · ') : 'Chưa chọn phần';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm đề thi thử</button>
      </div>
      {exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#999', padding: '2.5rem' }}>Chưa có đề thi thử nào. Bấm “Thêm đề thi thử” để tạo.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
          {exams.map((e) => (
            <div key={e.id} className="card" style={{ padding: '1rem 1.1rem', opacity: e.active ? 1 : 0.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '1rem', color: '#1A1A2E' }}>{e.title}</div>
                <span className="badge badge-blue">{e.grade ? `Lớp ${e.grade}` : 'Mọi khối'}</span>
                {!e.active && <span className="badge badge-gray">Đang ẩn</span>}
              </div>
              {e.description && <div style={{ fontSize: '0.82rem', color: '#777', lineHeight: 1.5 }}>{e.description}</div>}
              <div style={{ fontSize: '0.78rem', color: '#6A1B9A', fontWeight: 600 }}>{partSummary(e)}</div>
              <div style={{ fontSize: '0.78rem', color: '#888' }}>
                Thang {e.max_score} điểm{e.time_limit_minutes ? ` · ${e.time_limit_minutes} phút` : ''} · {e.pdf_file ? 'có đề PDF' : 'chưa có đề PDF'} · {e.answer_file ? 'có đáp án' : 'chưa có đáp án'}
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1565C0' }}>{e.attempt_count || 0} bài làm</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <a className="btn btn-ghost btn-sm" href={`/thi-thu/${e.id}`} target="_blank" rel="noreferrer"><Eye size={13} /> Xem trang thi</a>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm btn-icon" title={e.active ? 'Ẩn khỏi trang chủ' : 'Hiện trên trang chủ'} onClick={() => toggleActive(e)}>{e.active ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Sửa" onClick={() => openEdit(e)}><Edit size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Xóa" style={{ color: '#C62828' }} onClick={() => remove(e)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Sửa đề thi thử' : 'Thêm đề thi thử'} size="xl"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu' : 'Thêm đề'}</button>
        </>}>
        <div className="form-group">
          <label className="label">Tiêu đề *</label>
          <input className="input" placeholder="vd: Đề thi thử vào 10 — Toán — Số 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Dành cho khối lớp</label>
          <select className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
            <option value="">Mọi khối lớp</option>
            {GRADE_OPTIONS.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
          <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Khách chọn khối lớp khi điền thông tin → chỉ thấy đề của khối đó (và đề “Mọi khối lớp”).</div>
        </div>
        <div className="form-group">
          <label className="label">Mô tả (hiện cho khách)</label>
          <textarea className="input" rows={2} placeholder="vd: Thời gian 90 phút, dành cho học sinh lớp 9" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Kiểu đề</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {([['thpt', 'THPT (mặc định)', 'Trắc nghiệm / Đúng-Sai / Trả lời ngắn / Tự luận, quy đổi về thang điểm.'], ['hsa', 'HSA', 'Mỗi câu Trắc nghiệm hoặc Trả lời ngắn, 1 điểm/câu, không quy đổi.']] as const).map(([k, t, d]) => {
              const on = form.exam_type === k;
              return (
                <button key={k} type="button" onClick={() => setForm({ ...form, exam_type: k })} style={{
                  textAlign: 'left', flex: '1 1 240px', cursor: 'pointer', borderRadius: 10, padding: '8px 12px',
                  border: `1.5px solid ${on ? '#C62828' : '#DDD'}`, background: on ? '#FFF4F4' : 'white',
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t}</div>
                  <div style={{ fontSize: '0.74rem', color: '#777', marginTop: 3, lineHeight: 1.5 }}>{d}</div>
                </button>
              );
            })}
          </div>
        </div>
        {form.exam_type === 'hsa' ? (
          <div className="form-group">
            <label className="label">Cấu hình câu hỏi (HSA)</label>
            <HsaEditor value={hsa} onChange={setHsa} />
          </div>
        ) : (
          <div className="form-group">
            <label className="label">Các phần của đề</label>
            <div style={{ fontSize: '0.75rem', color: '#888', margin: '2px 0 10px', lineHeight: 1.6 }}>
              Chỉ bật <strong>Tự luận</strong> → khách thấy <strong>2 trang đề song song</strong> và nộp ảnh bài làm bên dưới. Câu nào để trống đáp án → AI đọc từ File đáp án.
            </div>
            <PartsEditor value={parts} onChange={setParts} gradingNote={form.grading_note} onGradingNoteChange={(v) => setForm({ ...form, grading_note: v })} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div className="form-group">
            <label className="label">Thang điểm</label>
            {form.exam_type === 'hsa'
              ? <div className="input" style={{ background: '#F5F5F5', color: '#666' }}>{hsaMaxScore(hsa)} điểm (= số câu)</div>
              : <input className="input" type="number" min={1} step={0.5} value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} />}
            {form.exam_type === 'thpt' && anyPartEnabled(parts) && (
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Tổng điểm các câu: <strong>{computeMaxScore(parts)}</strong></div>
            )}
          </div>
          <div className="form-group">
            <label className="label">Thời gian làm bài (phút)</label>
            <input className="input" type="number" min={1} placeholder="Không giới hạn" value={form.time_limit_minutes} onChange={(e) => setForm({ ...form, time_limit_minutes: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="label">Thứ tự hiển thị</label>
            <input className="input" type="number" min={0} value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          {([['pdf', 'File đề (PDF) — khách xem khi làm bài', pdfRef], ['answer', 'File đáp án (PDF) — chỉ để AI chấm, không lộ ra ngoài', answerRef]] as const).map(([kind, label, ref]) => {
            const picked = files[kind];
            const saved = editing && (kind === 'pdf' ? editing.pdf_file : editing.answer_file);
            const savedName = editing && (kind === 'pdf' ? editing.pdf_name : editing.answer_name);
            return (
              <div key={kind} className="form-group">
                <label className="label">{label}</label>
                <div className="dropzone" style={{ padding: '1rem' }} onClick={() => ref.current?.click()}>
                  {picked ? <span style={{ color: '#2E7D32', fontSize: '0.85rem' }}>✓ {picked.name}</span>
                    : <span style={{ fontSize: '0.82rem' }}><Upload size={16} style={{ verticalAlign: 'middle' }} /> {saved ? 'Chọn file mới để thay' : 'Chọn PDF'}</span>}
                </div>
                <input ref={ref} type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles({ ...files, [kind]: f }); e.target.value = ''; }} />
                {saved && !picked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', marginTop: 6, color: '#555' }}>
                    <FileText size={13} color="#C62828" />
                    <a href={`/uploads/mock/${saved}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1565C0' }}>{savedName || 'Đã có file'}</a>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Xóa file" onClick={() => removeFile(kind)}><X size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Hiện đề này trên trang chủ cho khách thi thử
        </label>
      </Modal>
    </div>
  );
}

export default function MockExamManagement() {
  const [tab, setTab] = useState<Tab>('attempts');
  const [exams, setExams] = useState<any[]>([]);
  const loadExams = () => api.get('/admin/mock-exams').then((r) => setExams(r.data)).catch(() => {});
  useEffect(() => { loadExams(); }, []);
  const totalAttempts = exams.reduce((s, e) => s + (e.attempt_count || 0), 0);

  return (
    <div className="fade-in">
      <Link to="/admin/overview" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#888', textDecoration: 'none', fontSize: '0.85rem', marginBottom: 6 }}>
        <ChevronLeft size={15} /> Tổng quan
      </Link>
      <h1 className="page-title">Thi thử</h1>
      <p style={{ color: '#888', margin: '-0.5rem 0 1.25rem', fontSize: '0.9rem' }}>
        Khách vãng lai làm đề ở trang chủ (mục “Thi thử”), điền thông tin học sinh trước khi làm; kết quả gửi về đây.
      </p>
      <div style={{ display: 'inline-flex', gap: 4, background: '#F0F0F0', borderRadius: 10, padding: 4, marginBottom: 16 }}>
        {([['attempts', `Bài làm (${totalAttempts})`], ['exams', `Đề thi (${exams.length})`]] as const).map(([k, l]) => (
          <button key={k} className="btn btn-sm" onClick={() => setTab(k)} style={{
            background: tab === k ? 'white' : 'transparent', color: tab === k ? '#C62828' : '#777', border: 'none',
            boxShadow: tab === k ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
          }}>{l}</button>
        ))}
      </div>
      {tab === 'attempts' ? <AttemptsTab exams={exams} /> : <ExamsTab exams={exams} reload={loadExams} />}
    </div>
  );
}
