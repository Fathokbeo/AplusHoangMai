import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import GradingDetails from '../../components/GradingDetails';
import StructuredAnswerReview from '../../components/StructuredAnswerReview';
import FileViewer from '../../components/FileViewer';
import { toast } from '../../components/Toast';
import { sortByVietnameseName } from '../../lib/vietnameseName';
import { parsePartsConfig, hasObjectiveParts } from '../../lib/homeworkParts';
import { ChevronLeft, Users, CheckCircle, XCircle, Clock, Bot, Star, Eye, Download } from 'lucide-react';

// Danh sách URL file của một bài nộp (hỗ trợ cũ: 1 file, mới: nhiều file dạng JSON)
function submissionFileUrls(s: any): string[] {
  let names: string[] = [];
  if (s.files) { try { const a = JSON.parse(s.files); if (Array.isArray(a)) names = a; } catch { /* ignore */ } }
  if (names.length === 0 && s.file_path) names = [s.file_path];
  return names.map((n: string) => `/uploads/submissions/${n}`);
}

export default function HomeworkDetail() {
  const { id } = useParams();
  const [hw, setHw] = useState<any>(null);
  const [gradeModal, setGradeModal] = useState(false);
  const [grading, setGrading] = useState<any>(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });
  const [loading, setLoading] = useState(false);
  const [regrading, setRegrading] = useState<number | null>(null);
  const [viewFiles, setViewFiles] = useState<string[] | null>(null);
  // Bộ lọc danh sách cả lớp: tất cả / đã nộp / chưa nộp
  const [filter, setFilter] = useState<'all' | 'submitted' | 'missing'>('all');

  useEffect(() => { fetchHw(); }, [id]);

  // Tự làm mới khi còn bài đang được AI chấm nền, để cập nhật điểm
  useEffect(() => {
    const pending = hw?.submissions?.some((s: any) => s.grading_status === 'pending' || s.grading_status === 'grading');
    if (!pending) return;
    const t = setInterval(fetchHw, 8000);
    return () => clearInterval(t);
  }, [hw]);

  const fetchHw = async () => {
    const { data } = await api.get(`/homework/${id}`);
    setHw(data);
  };

  const openGrade = (sub: any) => {
    setGrading(sub);
    setGradeForm({ score: sub.score ?? '', feedback: sub.feedback ?? '' });
    setGradeModal(true);
  };

  const saveGrade = async () => {
    if (gradeForm.score === '') { toast.error('Nhập điểm'); return; }
    setLoading(true);
    try {
      await api.put(`/submissions/${grading.id}/grade`, { score: parseFloat(gradeForm.score), feedback: gradeForm.feedback });
      toast.success('Đã lưu điểm');
      setGradeModal(false);
      fetchHw();
    } catch {
      toast.error('Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const regrade = async (subId: number) => {
    setRegrading(subId);
    try {
      await api.post(`/submissions/${subId}/regrade`);
      toast.success('Đã chấm lại bằng AI');
      fetchHw();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi chấm bài');
    } finally {
      setRegrading(null);
    }
  };

  const scoreColor = (score: number, max: number) => {
    const ratio = score / max;
    if (ratio >= 0.8) return { bg: '#E8F5E9', color: '#2E7D32' };
    if (ratio >= 0.5) return { bg: '#FFF3E0', color: '#E65100' };
    return { bg: '#FFEBEE', color: '#C62828' };
  };

  // Xuất bảng điểm CẢ LỚP ra file Excel (.xlsx): STT, Họ và tên, Trạng thái, Điểm, Nhận xét
  const exportExcel = async () => {
    const rowsSrc = sortByVietnameseName((hw.roster || []) as any[], (s: any) => s.full_name || '');
    if (rowsSrc.length === 0) { toast.error('Lớp chưa có học sinh'); return; }
    const XLSX = await import('xlsx');
    const overdue = hw.due_date ? new Date() > new Date(hw.due_date) : false;

    const header = ['STT', 'Họ và tên', 'Trạng thái', 'Điểm', 'Nhận xét'];
    const rows = rowsSrc.map((s: any, i: number) => [
      i + 1,
      s.full_name || '',
      s.submission_id ? 'Đã nộp' : 'Chưa nộp',
      s.submission_id
        ? (s.score !== null && s.score !== undefined ? s.score : 'Chưa chấm')
        : (overdue ? 0 : ''),
      s.feedback || '',
    ]);
    const aoa = [
      [hw.title],
      [`Lớp: ${hw.class_title || ''}    Thang điểm: ${hw.max_score}`],
      [],
      header,
      ...rows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 60 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bảng điểm');
    const safeTitle = (hw.title || 'bai-tap').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80);
    XLSX.writeFile(wb, `Bang diem - ${safeTitle}.xlsx`);
    toast.success('Đã xuất file Excel');
  };

  if (!hw) return <div style={{ padding: '2rem', color: '#999', textAlign: 'center' }}>Đang tải...</div>;

  // Danh sách CẢ LỚP (kèm bài nộp nếu có); quá hạn mà chưa nộp → "Chưa nộp bài" + 0 điểm
  const roster = sortByVietnameseName((hw.roster || []) as any[], (s: any) => s.full_name || '');
  const isOverdue = hw.due_date ? new Date() > new Date(hw.due_date) : false;
  const submittedCount = roster.filter((s: any) => s.submission_id).length;
  const missingCount = roster.length - submittedCount;
  const graded = hw.submissions?.filter((s: any) => s.score !== null).length || 0;
  const visibleRoster = roster.filter((s: any) =>
    filter === 'all' ? true : filter === 'submitted' ? !!s.submission_id : !s.submission_id);
  // Bài có thể AI chấm: có file đáp án tự luận hoặc có phần objective (có key)
  const aiGradable = !!hw.answer_file || hasObjectiveParts(parsePartsConfig(hw.parts_config));

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem' }}>
        <Link to={`/teacher/classes/${hw.class_id}`} style={{ color: '#888', textDecoration: 'none', display: 'flex', alignItems: 'center', marginTop: 4 }}>
          <ChevronLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.82rem', color: '#888', marginBottom: 4 }}>{hw.class_title}</div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{hw.title}</h1>
          {hw.description && <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.88rem' }}>{hw.description}</p>}
          {hw.grading_note && (
            <div style={{ marginTop: 8, padding: '0.6rem 0.8rem', background: '#F3E9FF', borderRadius: 8, fontSize: '0.8rem', color: '#6A1B9A', display: 'flex', gap: 6 }}>
              <Bot size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>Ghi chú cho AI:</strong> {hw.grading_note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD' }}><Users size={18} color="#1565C0" /></div>
          <div><div className="stat-value" style={{ color: '#1565C0' }}>{submittedCount}/{roster.length}</div><div className="stat-label">Đã nộp</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE' }}><XCircle size={18} color="#C62828" /></div>
          <div><div className="stat-value" style={{ color: '#C62828' }}>{missingCount}</div><div className="stat-label">Chưa nộp</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E8F5E9' }}><CheckCircle size={18} color="#2E7D32" /></div>
          <div><div className="stat-value" style={{ color: '#2E7D32' }}>{graded}</div><div className="stat-label">Đã chấm</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0' }}><Star size={18} color="#E65100" /></div>
          <div>
            <div className="stat-value" style={{ color: '#E65100' }}>
              {graded > 0 ? (hw.submissions.filter((s: any) => s.score !== null).reduce((a: number, s: any) => a + s.score, 0) / graded).toFixed(1) : '—'}
            </div>
            <div className="stat-label">Điểm TB</div>
          </div>
        </div>
        {hw.due_date && (
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#F3E5F5' }}><Clock size={18} color="#6A1B9A" /></div>
            <div><div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6A1B9A' }}>{new Date(hw.due_date).toLocaleDateString('vi-VN')}</div><div className="stat-label">Hạn nộp</div></div>
          </div>
        )}
      </div>

      {/* PDF buttons */}
      {(hw.pdf_file || hw.answer_file) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem' }}>
          {hw.pdf_file && (
            <button className="btn btn-secondary" onClick={() => setViewFiles([`/uploads/homework/${hw.pdf_file}`])}>
              <Eye size={15} /> Xem đề bài
            </button>
          )}
          {hw.answer_file && (
            <button className="btn btn-success" onClick={() => setViewFiles([`/uploads/homework/${hw.answer_file}`])}>
              <Eye size={15} /> Xem đáp án
            </button>
          )}
        </div>
      )}

      {/* Danh sách cả lớp + bộ lọc đã nộp / chưa nộp */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Danh sách lớp</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Bộ lọc trạng thái nộp */}
          <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10 }}>
            {([
              { key: 'all', label: `Tất cả (${roster.length})` },
              { key: 'submitted', label: `Đã nộp (${submittedCount})` },
              { key: 'missing', label: `Chưa nộp (${missingCount})` },
            ] as const).map(({ key, label }) => (
              <button key={key} className="btn btn-sm" onClick={() => setFilter(key)}
                style={{ background: filter === key ? 'white' : 'transparent', boxShadow: filter === key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: filter === key ? '#C62828' : '#888', border: 'none' }}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn btn-success btn-sm" onClick={exportExcel} disabled={roster.length === 0} title="Xuất bảng điểm cả lớp ra Excel">
            <Download size={14} /> Xuất Excel
          </button>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Trạng thái</th>
              <th>Thời gian nộp</th>
              <th>File bài</th>
              <th>Điểm</th>
              <th>Chấm bởi</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visibleRoster.map((s: any) => {
              const submitted = !!s.submission_id;
              const sc = submitted && s.score !== null ? scoreColor(s.score, hw.max_score) : null;
              const fileUrls = submitted ? submissionFileUrls(s) : [];
              return (
                <tr key={s.student_id}>
                  <td><strong>{s.full_name}</strong><div style={{ fontSize: '0.78rem', color: '#999' }}>{s.username}</div></td>
                  <td>
                    {submitted
                      ? <span className="badge badge-green"><CheckCircle size={10} style={{ marginRight: 4 }} />Đã nộp</span>
                      : isOverdue
                        ? <span className="badge badge-red"><XCircle size={10} style={{ marginRight: 4 }} />Chưa nộp bài</span>
                        : <span className="badge badge-gray">Chưa nộp</span>}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#888' }}>{submitted ? new Date(s.submitted_at).toLocaleString('vi-VN') : '—'}</td>
                  <td>
                    {fileUrls.length > 0 ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles(fileUrls)}>
                        <Eye size={13} /> Xem{fileUrls.length > 1 ? ` (${fileUrls.length})` : ''}
                      </button>
                    ) : submitted && s.structured_answers ? (
                      <span style={{ fontSize: '0.78rem', color: '#6A1B9A' }}>Đã làm bài</span>
                    ) : '—'}
                  </td>
                  <td>
                    {submitted ? (
                      s.score !== null ? (
                        <span style={{ background: sc?.bg, color: sc?.color, padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: '0.88rem' }}>
                          {s.score}/{hw.max_score}
                        </span>
                      ) : (s.grading_status === 'pending' || s.grading_status === 'grading') ? (
                        <span style={{ color: '#1565C0', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Bot size={12} /> Đang chấm...
                        </span>
                      ) : s.grading_status === 'failed' ? (
                        <span style={{ color: '#C62828', fontSize: '0.82rem' }}>Chấm lỗi</span>
                      ) : <span style={{ color: '#ccc' }}>Chưa chấm</span>
                    ) : isOverdue ? (
                      // Quá hạn không nộp → 0 điểm (khớp cách tính điểm TB & xếp hạng)
                      <span style={{ background: '#FFEBEE', color: '#C62828', padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: '0.88rem' }}>
                        0/{hw.max_score}
                      </span>
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td>
                    {submitted
                      ? (s.graded_by_ai ? <span className="badge badge-purple"><Bot size={10} style={{ marginRight: 4 }} />AI</span> : s.score !== null ? <span className="badge badge-blue">Thủ công</span> : '—')
                      : '—'}
                  </td>
                  <td>
                    {submitted ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openGrade({ ...s, id: s.submission_id })}>
                          <Star size={13} /> {s.score !== null ? 'Sửa điểm' : 'Chấm'}
                        </button>
                        {aiGradable && (fileUrls.length > 0 || s.structured_answers) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => regrade(s.submission_id)} disabled={regrading === s.submission_id} title="Chấm lại bằng AI">
                            <Bot size={13} style={{ color: '#6A1B9A' }} />
                            {regrading === s.submission_id ? '...' : 'AI'}
                          </button>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {roster.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Lớp chưa có học sinh</td></tr>
            )}
            {roster.length > 0 && visibleRoster.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Không có học sinh nào trong nhóm lọc này</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Grade Modal */}
      <Modal open={gradeModal} onClose={() => setGradeModal(false)} title={`Chấm điểm: ${grading?.full_name}`}
        footer={<><button className="btn btn-ghost" onClick={() => setGradeModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveGrade} disabled={loading}>Lưu điểm</button></>}>
        <div className="form-group">
          <label className="label">Điểm (tối đa {hw.max_score})</label>
          <input className="input" type="number" min={0} max={hw.max_score} step={0.5} value={gradeForm.score} onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Nhận xét</label>
          <textarea className="input" rows={4} placeholder="Nhận xét về bài làm..." value={gradeForm.feedback} onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })} />
        </div>
        {grading && submissionFileUrls(grading).length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles(submissionFileUrls(grading))}>
            <Eye size={13} /> Xem bài nộp{submissionFileUrls(grading).length > 1 ? ` (${submissionFileUrls(grading).length})` : ''}
          </button>
        )}
        {grading?.structured_answers && <StructuredAnswerReview partsConfig={hw.parts_config} structuredAnswers={grading.structured_answers} />}
        {grading?.grading_details && <GradingDetails details={grading.grading_details} />}
      </Modal>

      {/* File Viewer Modal */}
      {viewFiles && <FileViewer files={viewFiles} onClose={() => setViewFiles(null)} />}
    </div>
  );
}
