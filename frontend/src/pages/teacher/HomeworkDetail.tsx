import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { ChevronLeft, Users, CheckCircle, Clock, Bot, Star, Eye } from 'lucide-react';

export default function HomeworkDetail() {
  const { id } = useParams();
  const [hw, setHw] = useState<any>(null);
  const [gradeModal, setGradeModal] = useState(false);
  const [grading, setGrading] = useState<any>(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });
  const [loading, setLoading] = useState(false);
  const [regrading, setRegrading] = useState<number | null>(null);
  const [viewPdf, setViewPdf] = useState<string | null>(null);

  useEffect(() => { fetchHw(); }, [id]);

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

  if (!hw) return <div style={{ padding: '2rem', color: '#999', textAlign: 'center' }}>Đang tải...</div>;

  const graded = hw.submissions?.filter((s: any) => s.score !== null).length || 0;
  const total = hw.submissions?.length || 0;

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
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#E3F2FD' }}><Users size={18} color="#1565C0" /></div>
          <div><div className="stat-value" style={{ color: '#1565C0' }}>{total}</div><div className="stat-label">Đã nộp</div></div>
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
            <button className="btn btn-secondary" onClick={() => setViewPdf(`/uploads/homework/${hw.pdf_file}`)}>
              <Eye size={15} /> Xem đề bài
            </button>
          )}
          {hw.answer_file && (
            <button className="btn btn-success" onClick={() => setViewPdf(`/uploads/homework/${hw.answer_file}`)}>
              <Eye size={15} /> Xem đáp án
            </button>
          )}
        </div>
      )}

      {/* Submissions table */}
      <h2 className="section-title">Danh sách nộp bài</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Thời gian nộp</th>
              <th>File bài</th>
              <th>Điểm</th>
              <th>Chấm bởi</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {hw.submissions?.map((s: any) => {
              const sc = s.score !== null ? scoreColor(s.score, hw.max_score) : null;
              return (
                <tr key={s.id}>
                  <td><strong>{s.full_name}</strong><div style={{ fontSize: '0.78rem', color: '#999' }}>{s.username}</div></td>
                  <td style={{ fontSize: '0.82rem', color: '#888' }}>{new Date(s.submitted_at).toLocaleString('vi-VN')}</td>
                  <td>
                    {s.file_path && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(`/uploads/submissions/${s.file_path}`)}>
                        <Eye size={13} /> Xem
                      </button>
                    )}
                  </td>
                  <td>
                    {s.score !== null ? (
                      <span style={{ background: sc?.bg, color: sc?.color, padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: '0.88rem' }}>
                        {s.score}/{hw.max_score}
                      </span>
                    ) : <span style={{ color: '#ccc' }}>Chưa chấm</span>}
                  </td>
                  <td>
                    {s.graded_by_ai ? <span className="badge badge-purple"><Bot size={10} style={{ marginRight: 4 }} />AI</span> : s.score !== null ? <span className="badge badge-blue">Thủ công</span> : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openGrade(s)}>
                        <Star size={13} /> {s.score !== null ? 'Sửa điểm' : 'Chấm'}
                      </button>
                      {hw.answer_file && s.file_path && (
                        <button className="btn btn-ghost btn-sm" onClick={() => regrade(s.id)} disabled={regrading === s.id} title="Chấm lại bằng AI">
                          <Bot size={13} style={{ color: '#6A1B9A' }} />
                          {regrading === s.id ? '...' : 'AI'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!hw.submissions || hw.submissions.length === 0) && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có bài nộp</td></tr>
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
        {grading?.file_path && (
          <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(`/uploads/submissions/${grading.file_path}`)}>
            <Eye size={13} /> Xem bài nộp
          </button>
        )}
      </Modal>

      {/* PDF Viewer Modal */}
      {viewPdf && (
        <div className="modal-overlay" onClick={() => setViewPdf(null)}>
          <div style={{ background: 'white', borderRadius: 12, width: '90vw', height: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Xem tài liệu</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(null)}>Đóng</button>
            </div>
            <iframe src={viewPdf} style={{ flex: 1, border: 'none' }} title="PDF Viewer" />
          </div>
        </div>
      )}
    </div>
  );
}
