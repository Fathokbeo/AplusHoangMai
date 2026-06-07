import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import VideoPlayer from '../../components/VideoPlayer';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { ChevronLeft, Play, ClipboardList, BookOpen, Upload, CheckCircle, Clock, Eye, Bot, Lock, FileText } from 'lucide-react';

export default function StudentClassDetail() {
  const { id } = useParams();
  const [cls, setCls] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'lessons' | 'homework'>('lessons');
  const [viewLessonModal, setViewLessonModal] = useState(false);
  const [viewingLesson, setViewingLesson] = useState<any>(null);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState<any>(null);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewPdf, setViewPdf] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchClass(); }, [id]);

  const fetchClass = async () => {
    const { data } = await api.get(`/student/my-classes/${id}`);
    setCls(data);
  };

  const openSubmit = (hw: any) => {
    setSubmitting(hw);
    setSubmitFile(null);
    setSubmitModal(true);
  };

  const doSubmit = async () => {
    if (!submitFile) { toast.error('Chọn file bài làm'); return; }
    setLoading(true);
    try {
      const body = new FormData();
      body.append('file', submitFile);
      const { data } = await api.post(`/homework/${submitting.id}/submit`, body);
      toast.success(data.message);
      setSubmitModal(false);
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi nộp bài');
    } finally {
      setLoading(false);
    }
  };

  if (!cls) return <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Đang tải...</div>;

  const tabs = [
    { key: 'lessons', label: `Bài giảng (${cls.lessons?.length || 0})`, icon: BookOpen },
    { key: 'homework', label: `Bài tập (${cls.homework?.length || 0})`, icon: ClipboardList },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem' }}>
        <Link to="/student" style={{ color: '#888', textDecoration: 'none', marginTop: 4 }}>
          <ChevronLeft size={18} />
        </Link>
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            {cls.course_title && <span className="badge badge-blue">{cls.course_title}</span>}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{cls.title}</h1>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.88rem' }}>Giáo viên: <strong>{cls.teacher_name}</strong></p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1.5rem', width: 'fit-content' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as any)} className="btn"
            style={{ background: activeTab === key ? 'white' : 'transparent', boxShadow: activeTab === key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: activeTab === key ? '#C62828' : '#888', border: 'none', gap: 6 }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Lessons */}
      {activeTab === 'lessons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cls.lessons?.map((l: any, i: number) => (
            <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem' }}>
              <div style={{ width: 36, height: 36, background: '#E3F2FD', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{i + 1}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.title}</div>
                {l.description && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{l.description}</div>}
              </div>
              {l.video_url ? (
                <button className="btn btn-primary btn-sm" onClick={() => { setViewingLesson(l); setViewLessonModal(true); }}>
                  <Play size={13} /> Xem bài
                </button>
              ) : <span style={{ fontSize: '0.78rem', color: '#ccc' }}>Chưa có video</span>}
            </div>
          ))}
          {(!cls.lessons || cls.lessons.length === 0) && (
            <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>Chưa có bài giảng</div>
          )}
        </div>
      )}

      {/* Homework */}
      {activeTab === 'homework' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cls.homework?.map((hw: any) => {
            const isSubmitted = !!hw.submission_id;
            const hasGrade = hw.score !== null;
            const canSubmit = hw.can_submit;

            return (
              <div key={hw.id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isSubmitted ? '#E8F5E9' : '#F3E5F5' }}>
                    {isSubmitted ? <CheckCircle size={18} color="#2E7D32" /> : <ClipboardList size={18} color="#6A1B9A" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{hw.title}</span>
                      {isSubmitted && <span className="badge badge-green">Đã nộp</span>}
                      {!canSubmit && !isSubmitted && <span className="badge badge-gray">Hết hạn</span>}
                    </div>
                    {hw.description && <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#888', lineHeight: 1.5 }}>{hw.description}</p>}

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.78rem', color: '#888' }}>
                      <span>Thang điểm: {hw.max_score}</span>
                      {hw.due_date && <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> HH: {new Date(hw.due_date).toLocaleString('vi-VN')}</span>}
                    </div>

                    {/* Grade display */}
                    {hasGrade && (
                      <div style={{ marginTop: 12, background: '#F9F9F9', borderRadius: 10, padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', background: hw.score / hw.max_score >= 0.8 ? '#E8F5E9' : hw.score / hw.max_score >= 0.5 ? '#FFF3E0' : '#FFEBEE', color: hw.score / hw.max_score >= 0.8 ? '#2E7D32' : hw.score / hw.max_score >= 0.5 ? '#E65100' : '#C62828' }}>
                            {hw.score}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: '#888' }}>Điểm đạt được</div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{hw.score}/{hw.max_score}</div>
                          </div>
                          {hw.graded_by_ai && <span className="badge badge-purple" style={{ marginLeft: 'auto' }}><Bot size={10} style={{ marginRight: 4 }} />AI chấm</span>}
                        </div>
                        {hw.feedback && (
                          <div style={{ fontSize: '0.83rem', color: '#555', lineHeight: 1.6, borderTop: '1px solid #EEE', paddingTop: 8, marginTop: 8 }}>
                            <strong>Nhận xét:</strong> {hw.feedback}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    {hw.pdf_file && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(`/uploads/homework/${hw.pdf_file}`)}>
                        <FileText size={13} /> Xem đề
                      </button>
                    )}
                    {hw.can_see_answer && hw.answer_file && (
                      <button className="btn btn-success btn-sm" onClick={() => setViewPdf(`/uploads/homework/${hw.answer_file}`)}>
                        <Eye size={13} /> Đáp án
                      </button>
                    )}
                    {!hw.can_see_answer && hw.answer_visible_date && (
                      <span style={{ fontSize: '0.72rem', color: '#999', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Lock size={11} /> Đáp án mở lúc {new Date(hw.answer_visible_date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                    {canSubmit ? (
                      <button className="btn btn-primary btn-sm" onClick={() => openSubmit(hw)}>
                        <Upload size={13} /> {isSubmitted ? 'Nộp lại' : 'Nộp bài'}
                      </button>
                    ) : !isSubmitted && <span style={{ fontSize: '0.78rem', color: '#C62828' }}>Hết hạn</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {(!cls.homework || cls.homework.length === 0) && (
            <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>Chưa có bài tập</div>
          )}
        </div>
      )}

      {/* View Lesson Modal */}
      <Modal open={viewLessonModal} onClose={() => setViewLessonModal(false)} title={viewingLesson?.title || ''} size="xl">
        {viewingLesson?.video_url && (
          <>
            <VideoPlayer url={viewingLesson.video_url} type={viewingLesson.video_type} />
            {viewingLesson.description && <p style={{ color: '#555', marginTop: 12, lineHeight: 1.6 }}>{viewingLesson.description}</p>}
          </>
        )}
      </Modal>

      {/* Submit Homework Modal */}
      <Modal open={submitModal} onClose={() => setSubmitModal(false)} title={`Nộp bài: ${submitting?.title}`}
        footer={<><button className="btn btn-ghost" onClick={() => setSubmitModal(false)}>Hủy</button><button className="btn btn-primary" onClick={doSubmit} disabled={loading || !submitFile}>{loading ? 'Đang nộp...' : 'Nộp bài'}</button></>}>
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5F5F5', borderRadius: 8, fontSize: '0.82rem', color: '#666' }}>
          Nộp bài dạng ảnh chụp (JPG, PNG) hoặc file PDF. Hệ thống AI sẽ tự động chấm điểm và cho kết quả ngay sau khi nộp.
        </div>
        <div className="form-group">
          <label className="label">File bài làm (PDF hoặc ảnh) *</label>
          <div className="dropzone" onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) setSubmitFile(f); }}>
            {submitFile ? (
              <div>
                <CheckCircle size={24} color="#2E7D32" style={{ margin: '0 auto 8px' }} />
                <div style={{ color: '#2E7D32', fontWeight: 600 }}>{submitFile.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>{(submitFile.size / 1024 / 1024).toFixed(1)} MB</div>
              </div>
            ) : (
              <div>
                <Upload size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <div style={{ fontWeight: 500 }}>Kéo thả hoặc click để chọn file</div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 4 }}>PDF, JPG, PNG - tối đa 20MB</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => { if (e.target.files?.[0]) setSubmitFile(e.target.files[0]); }} />
        </div>
      </Modal>

      {/* PDF Viewer */}
      {viewPdf && (
        <div className="modal-overlay" onClick={() => setViewPdf(null)}>
          <div style={{ background: 'white', borderRadius: 12, width: '90vw', height: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Xem tài liệu</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(null)}>Đóng</button>
            </div>
            <iframe src={viewPdf} style={{ flex: 1, border: 'none' }} title="PDF" />
          </div>
        </div>
      )}
    </div>
  );
}
