import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import VideoPlayer from '../../components/VideoPlayer';
import Modal from '../../components/Modal';
import GradingDetails from '../../components/GradingDetails';
import FileViewer from '../../components/FileViewer';
import PartsSolver, { type StudentAnswers } from '../../components/PartsSolver';
import useIsMobile from '../../lib/useIsMobile';
import { toast } from '../../components/Toast';
import { parsePartsConfig, hasObjectiveParts, hasEssay, emptyStudentAnswers, PART_LABELS, PART_ORDER, type PartKey } from '../../lib/homeworkParts';
import { parseAttachments, isViewableFile } from '../../lib/attachments';
import AssistantScheduleModal from '../../components/AssistantScheduleModal';
import FacebookIcon from '../../components/FacebookIcon';
import {
  ChevronLeft, Play, ClipboardList, BookOpen, Upload, CheckCircle, Clock, Eye, Bot, Lock, FileText, X, Plus, Layers, Video,
  ChevronDown, ChevronRight, ChevronUp, Trophy, Star, Paperclip, Download, UserCog, Phone, Calendar
} from 'lucide-react';

// Danh sách URL các file đã nộp (hỗ trợ cũ: 1 file, mới: nhiều file dạng JSON)
function submittedFileUrls(hw: any): string[] {
  let names: string[] = [];
  if (hw.submitted_files) { try { const a = JSON.parse(hw.submitted_files); if (Array.isArray(a)) names = a; } catch { /* ignore */ } }
  if (names.length === 0 && hw.submitted_file) names = [hw.submitted_file];
  return names.map((n: string) => `/uploads/submissions/${n}`);
}

export default function StudentClassDetail() {
  const { id } = useParams();
  const [cls, setCls] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'assistants'>('content');
  const [scheduleAssistantId, setScheduleAssistantId] = useState<number | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [viewLessonModal, setViewLessonModal] = useState(false);
  const [viewingLesson, setViewingLesson] = useState<any>(null);
  const [solutionVideo, setSolutionVideo] = useState<{ title: string; url: string } | null>(null);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState<any>(null);
  const [submitFiles, setSubmitFiles] = useState<File[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswers>({ multiple_choice: [], true_false: [], short_answer: [] });
  const [loading, setLoading] = useState(false);
  const [viewFiles, setViewFiles] = useState<string[] | null>(null);
  // Bài tập nào đang mở "Chi tiết" điểm (nhận xét + kết quả từng câu); mặc định ẩn hết
  const [openGradeDetails, setOpenGradeDetails] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => { fetchClass(); }, [id]);

  // Tự làm mới khi có bài vừa nộp đang được AI chấm nền, để cập nhật điểm
  useEffect(() => {
    const pending = cls?.homework?.some((hw: any) => hw.submission_id && hw.score === null && (hw.grading_status === 'pending' || hw.grading_status === 'grading'));
    if (!pending) return;
    const t = setInterval(fetchClass, 8000);
    return () => clearInterval(t);
  }, [cls]);

  // Khi mở lớp: lớp chưa dùng chương thì mở sẵn nhóm "Chưa phân chương", còn lại để thu gọn
  useEffect(() => {
    if (cls) setExpandedChapters(new Set((cls.chapters?.length || 0) === 0 ? ['orphan'] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id]);

  const fetchClass = async () => {
    const { data } = await api.get(`/student/my-classes/${id}`);
    setCls(data);
  };

  const openSubmit = (hw: any) => {
    setSubmitting(hw);
    setSubmitFiles([]);
    const cfg = parsePartsConfig(hw.parts_config);
    // Nạp lại đáp án đã nộp (nếu nộp lại) hoặc khởi tạo rỗng theo cấu hình bài
    let prev: any = null;
    if (hw.structured_answers) { try { prev = JSON.parse(hw.structured_answers); } catch { /* ignore */ } }
    const empty = emptyStudentAnswers(cfg);
    setStudentAnswers({
      multiple_choice: prev?.multiple_choice || empty.multiple_choice,
      true_false: prev?.true_false || empty.true_false,
      short_answer: prev?.short_answer || empty.short_answer,
    });
    setSubmitModal(true);
  };

  // Thêm file vào danh sách (gộp với file đã chọn, loại trùng tên+kích thước)
  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setSubmitFiles((prev) => {
      const merged = [...prev];
      arr.forEach((f) => { if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f); });
      return merged.slice(0, 20);
    });
  };

  const removeFile = (idx: number) => setSubmitFiles((prev) => prev.filter((_, i) => i !== idx));

  const doSubmit = async () => {
    const cfg = parsePartsConfig(submitting?.parts_config);
    const objective = hasObjectiveParts(cfg);
    // Phải có bài làm: đáp án objective đã điền HOẶC ít nhất một file (cho phần tự luận / bài cũ)
    if (submitFiles.length === 0 && !objective) { toast.error('Chọn ít nhất một file bài làm'); return; }
    setLoading(true);
    try {
      const body = new FormData();
      submitFiles.forEach((f) => body.append('files', f));
      if (objective) body.append('structured_answers', JSON.stringify(studentAnswers));
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

  const chapters: any[] = cls.chapters || [];

  // Nội dung lớp gom theo chương, tách riêng Đại số (hiển thị trước) và Hình học (sau) — mỗi môn
  // đánh số thứ tự độc lập. Cuối cùng là nhóm "Chưa phân chương" nếu có bài lẻ chưa gán chương.
  const lessonsAll: any[] = cls.lessons || [];
  const homeworkAll: any[] = cls.homework || [];
  const toChapterGroup = (ch: any) => ({
    key: String(ch.id), chapter: ch,
    lessons: lessonsAll.filter((l: any) => l.chapter_id === ch.id),
    homework: homeworkAll.filter((h: any) => h.chapter_id === ch.id),
  });
  const algebraGroups = chapters.filter((ch: any) => (ch.subject || 'algebra') === 'algebra').map(toChapterGroup);
  const geometryGroups = chapters.filter((ch: any) => ch.subject === 'geometry').map(toChapterGroup);
  const orphanLessons = lessonsAll.filter((l: any) => !l.chapter_id || !chapters.some((c: any) => c.id === l.chapter_id));
  const orphanHomework = homeworkAll.filter((h: any) => !h.chapter_id || !chapters.some((c: any) => c.id === h.chapter_id));
  const orphanGroup = (orphanLessons.length || orphanHomework.length)
    ? { key: 'orphan', chapter: null, lessons: orphanLessons, homework: orphanHomework }
    : null;
  const scheduleAssistant = (cls.assistants || []).find((a: any) => a.id === scheduleAssistantId) || null;

  const toggleChapter = (key: string) => setExpandedChapters((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderLessonCard = (l: any, i: number) => {
    const atts = parseAttachments(l.attachments);
    const docCount = atts.filter((a) => a.kind !== 'answer').length;
    const ansCount = atts.filter((a) => a.kind === 'answer').length;
    return (
      <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem' }}>
        <div style={{ width: 36, height: 36, background: '#E3F2FD', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{i + 1}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.title}</div>
          {l.description && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{l.description}</div>}
          {(l.video_url || atts.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {l.video_url && <span className="badge badge-blue"><Play size={10} style={{ marginRight: 3 }} />Video</span>}
              {docCount > 0 && <span className="badge badge-orange"><Paperclip size={10} style={{ marginRight: 3 }} />Tài liệu ×{docCount}</span>}
              {ansCount > 0 && <span className="badge badge-green"><FileText size={10} style={{ marginRight: 3 }} />Đáp án BT ×{ansCount}</span>}
            </div>
          )}
        </div>
        {(l.video_url || atts.length > 0) ? (
          <button className="btn btn-primary btn-sm" onClick={() => { setViewingLesson(l); setViewLessonModal(true); }}>
            <Play size={13} /> Xem bài
          </button>
        ) : <span style={{ fontSize: '0.78rem', color: '#ccc' }}>Chưa có nội dung</span>}
      </div>
    );
  };

  const renderHomeworkCard = (hw: any, i: number) => {
    const isSubmitted = !!hw.submission_id;
    const hasGrade = hw.score !== null;
    const canSubmit = hw.can_submit;

    return (
      <div key={hw.id} className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isSubmitted ? '#E8F5E9' : '#F3E5F5' }}>
            {isSubmitted ? <CheckCircle size={18} color="#2E7D32" /> : <ClipboardList size={18} color="#6A1B9A" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: '0.72rem', color: '#6A1B9A', background: '#F3E5F5', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{hw.title}</span>
              {isSubmitted && <span className="badge badge-green">Đã nộp</span>}
              {!canSubmit && !isSubmitted && <span className="badge badge-gray">Hết hạn</span>}
            </div>
            {hw.description && <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#888', lineHeight: 1.5 }}>{hw.description}</p>}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.78rem', color: '#888' }}>
              <span>Thang điểm: {hw.max_score}</span>
              {hw.due_date && <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> HH: {new Date(hw.due_date).toLocaleString('vi-VN')}</span>}
            </div>
            {(() => {
              const cfg = parsePartsConfig(hw.parts_config);
              if (!cfg) return null;
              const active = PART_ORDER.filter((k: PartKey) => (k === 'essay' ? cfg.essay.enabled : (cfg as any)[k].enabled));
              if (active.length === 0) return null;
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {active.map((k) => {
                    const count = k === 'essay' ? null : (cfg as any)[k].count;
                    return <span key={k} className="badge badge-purple">{PART_LABELS[k]}{count ? ` ×${count}` : ''}</span>;
                  })}
                </div>
              );
            })()}

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
                  {/* Góc trên bên phải: nhãn AI chấm + nút Chi tiết (mở/đóng nhận xét & từng câu) */}
                  <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* !! ép cờ 0/1 từ CSDL về true/false — không thì số 0 bị in ra màn hình */}
                    {!!hw.graded_by_ai && <span className="badge badge-purple"><Bot size={10} style={{ marginRight: 4 }} />AI chấm</span>}
                    {!!hw.can_see_answer && !!(hw.feedback || hw.grading_details) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setOpenGradeDetails((prev) => {
                        const next = new Set(prev);
                        if (next.has(hw.id)) next.delete(hw.id); else next.add(hw.id);
                        return next;
                      })}>
                        {openGradeDetails.has(hw.id) ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Chi tiết
                      </button>
                    )}
                  </div>
                </div>
                {/* Nhận xét + chi tiết sai câu nào: chỉ hiện sau khi mở đáp án (theo "Thời gian xem đáp án")
                    VÀ học sinh bấm nút "Chi tiết" — mặc định ẩn cho gọn */}
                {hw.can_see_answer ? (
                  openGradeDetails.has(hw.id) && (
                  <>
                    {hw.feedback && (
                      <div style={{ fontSize: '0.83rem', color: '#555', lineHeight: 1.6, borderTop: '1px solid #EEE', paddingTop: 8, marginTop: 8 }}>
                        <strong>Nhận xét:</strong> {hw.feedback}
                      </div>
                    )}
                    <GradingDetails details={hw.grading_details} />
                  </>
                  )
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#999', borderTop: '1px solid #EEE', paddingTop: 8, marginTop: 8 }}>
                    <Lock size={12} />
                    Nhận xét &amp; chi tiết từng câu sẽ hiển thị cùng lúc với đáp án
                    {hw.answer_visible_date ? ` (lúc ${new Date(hw.answer_visible_date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })})` : ''}.
                  </div>
                )}
              </div>
            )}

            {/* Đã nộp nhưng chưa có điểm: cho biết hệ thống đang chấm tự động */}
            {isSubmitted && !hasGrade && (hw.grading_status === 'pending' || hw.grading_status === 'grading') && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#1565C0', background: '#E3F2FD', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
                <Bot size={15} /> Đã nhận bài — hệ thống đang tự động chấm, kết quả sẽ hiển thị sau ít phút.
              </div>
            )}
            {isSubmitted && !hasGrade && hw.grading_status === 'failed' && (
              <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#888', background: '#F5F5F5', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
                Đã nhận bài. Giáo viên sẽ chấm và trả điểm sớm.
              </div>
            )}
            {/* Quá hạn mà chưa nộp → tính 0 điểm vào điểm trung bình */}
            {!isSubmitted && !canSubmit && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#C62828', background: '#FFEBEE', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
                <Lock size={14} /> Quá hạn, không nộp bài — tính <strong>0 điểm</strong> vào điểm trung bình.
              </div>
            )}
          </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
            {hw.pdf_file && (
              <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles([`/uploads/homework/${hw.pdf_file}`])}>
                <FileText size={13} /> Xem đề
              </button>
            )}
            {isSubmitted && submittedFileUrls(hw).length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles(submittedFileUrls(hw))}>
                <Eye size={13} /> Bài đã nộp ({submittedFileUrls(hw).length})
              </button>
            )}
            {!!hw.can_see_answer && !!hw.answer_file && (
              <button className="btn btn-success btn-sm" onClick={() => setViewFiles([`/uploads/homework/${hw.answer_file}`])}>
                <Eye size={13} /> Đáp án
              </button>
            )}
            {!!hw.can_see_answer && !!hw.solution_video_url && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSolutionVideo({ title: hw.title, url: hw.solution_video_url })}>
                <Video size={13} /> Video chữa
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
  };

  // Một chương dạng accordion: bấm để mở/đóng, mở ra mới thấy bài giảng & bài tập
  const renderChapterAccordion = (group: any, idx: number) => {
    const open = expandedChapters.has(group.key);
    const lc = group.lessons.length, hc = group.homework.length;
    return (
      <div key={group.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div onClick={() => toggleChapter(group.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem', cursor: 'pointer' }}>
          {open ? <ChevronDown size={18} color="#888" /> : <ChevronRight size={18} color="#888" />}
          <div style={{ width: 36, height: 36, background: group.chapter ? '#E3F2FD' : '#F5F5F5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {group.chapter ? <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{idx + 1}</span> : <Layers size={16} color="#999" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: group.chapter ? '#1A1A2E' : '#777' }}>{group.chapter ? group.chapter.title : 'Chưa phân chương'}</div>
            <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>{lc} bài giảng · {hc} bài tập</div>
          </div>
        </div>
        {open && (
          <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #F0F0F0' }}>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><BookOpen size={14} color="#1565C0" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài giảng ({lc})</span></div>
              {lc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài giảng</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.lessons.map((l: any, i: number) => renderLessonCard(l, i))}</div>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><ClipboardList size={14} color="#6A1B9A" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài tập ({hc})</span></div>
              {hc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài tập</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.homework.map((hw: any, i: number) => renderHomeworkCard(hw, i))}</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Cấu hình các phần của bài đang nộp (cho modal làm bài)
  const submitCfg = parsePartsConfig(submitting?.parts_config);
  const submitObjective = hasObjectiveParts(submitCfg);
  const submitEssay = hasEssay(submitCfg) || !submitCfg; // bài cũ (không cfg) coi như chỉ tự luận
  const canDoSubmit = submitObjective || submitFiles.length > 0;

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

      {/* Điểm TB + xếp hạng THÁNG NÀY (reset theo tháng; bài quá hạn chưa nộp tính 0 điểm) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1.1rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Star size={20} color="#E65100" />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#E65100', lineHeight: 1.1 }}>{cls.my_avg ?? '—'}<span style={{ fontSize: '0.8rem', color: '#bbb', fontWeight: 600 }}>/10</span></div>
            <div style={{ fontSize: '0.76rem', color: '#888' }}>Điểm TB tháng này</div>
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1.1rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={20} color="#6A1B9A" />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#6A1B9A', lineHeight: 1.1 }}>
              {cls.my_rank ? <>Hạng {cls.my_rank}<span style={{ fontSize: '0.8rem', color: '#bbb', fontWeight: 600 }}>/{cls.rank_total}</span></> : '—'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#888' }}>Xếp hạng tháng này</div>
          </div>
        </div>
      </div>

      {/* Tabs: Nội dung / Trợ giảng */}
      <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1.25rem', width: isMobile ? '100%' : 'fit-content' }}>
        {[
          { key: 'content' as const, label: 'Nội dung', icon: Layers },
          { key: 'assistants' as const, label: `Trợ giảng (${cls.assistants?.length || 0})`, icon: UserCog },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} className="btn"
            style={{ background: activeTab === key ? 'white' : 'transparent', boxShadow: activeTab === key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: activeTab === key ? '#C62828' : '#888', border: 'none', gap: 6 }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Danh sách chương → mở chương ra mới thấy bài giảng & bài tập. Đại số trước, Hình học sau. */}
      {activeTab === 'content' && (
        algebraGroups.length === 0 && geometryGroups.length === 0 && !orphanGroup ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>Chưa có nội dung</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {algebraGroups.length > 0 && (
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1A1A2E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1565C0', display: 'inline-block' }} /> Đại số
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {algebraGroups.map((g, i) => renderChapterAccordion(g, i))}
                </div>
              </div>
            )}
            {geometryGroups.length > 0 && (
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1A1A2E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#6A1B9A', display: 'inline-block' }} /> Hình học
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {geometryGroups.map((g, i) => renderChapterAccordion(g, i))}
                </div>
              </div>
            )}
            {orphanGroup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {renderChapterAccordion(orphanGroup, 0)}
              </div>
            )}
          </div>
        )
      )}

      {/* Trợ giảng: chỉ xem thông tin liên hệ + lịch làm việc, không sửa được */}
      {activeTab === 'assistants' && (
        (cls.assistants || []).length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>
            <UserCog size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div>Lớp chưa có trợ giảng</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
            {cls.assistants.map((a: any) => (
              <div key={a.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                {a.photo ? (
                  <img src={`/uploads/assistants/${a.photo}`} alt={a.full_name} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: 220, background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCog size={56} color="#6A1B9A" />
                  </div>
                )}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{a.full_name}</h3>
                  <div style={{ color: '#6A1B9A', fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>Trợ giảng</div>
                  {(a.phone || a.facebook_url) && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                      {a.phone && (
                        <a href={`tel:${String(a.phone).replace(/[^+\d]/g, '')}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                          <Phone size={13} /> {a.phone}
                        </a>
                      )}
                      {a.facebook_url && (
                        <a href={a.facebook_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                          <FacebookIcon size={13} /> Facebook
                        </a>
                      )}
                    </div>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setScheduleAssistantId(a.id)}>
                    <Calendar size={13} /> Xem lịch làm việc
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* View Lesson Modal */}
      <Modal open={viewLessonModal} onClose={() => setViewLessonModal(false)} title={viewingLesson?.title || ''} size="xl">
        {viewingLesson?.video_url && <VideoPlayer url={viewingLesson.video_url} type={viewingLesson.video_type} />}
        {viewingLesson?.description && <p style={{ color: '#555', marginTop: 12, lineHeight: 1.6 }}>{viewingLesson.description}</p>}
        {viewingLesson && parseAttachments(viewingLesson.attachments).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Paperclip size={14} /> Tài liệu đính kèm
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {parseAttachments(viewingLesson.attachments).map((a) => (
                <div key={a.file} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                  <FileText size={15} color={a.kind === 'answer' ? '#2E7D32' : '#E65100'} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name} <span className={`badge ${a.kind === 'answer' ? 'badge-green' : 'badge-orange'}`} style={{ marginLeft: 6 }}>{a.kind === 'answer' ? 'Đáp án BT trên lớp' : 'Tài liệu bài giảng'}</span>
                  </span>
                  {isViewableFile(a.file) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setViewFiles([`/uploads/lessons/${a.file}`])}><Eye size={13} /> Xem</button>
                  )}
                  <a className="btn btn-ghost btn-sm" href={`/uploads/lessons/${a.file}`} download={a.name}><Download size={13} /> Tải về</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Solution Video Modal */}
      <Modal open={!!solutionVideo} onClose={() => setSolutionVideo(null)} title={solutionVideo ? `Video chữa: ${solutionVideo.title}` : ''} size="xl">
        {solutionVideo && <VideoPlayer url={solutionVideo.url} type="youtube" />}
      </Modal>

      {/* Submit Homework Modal */}
      <Modal open={submitModal} onClose={() => setSubmitModal(false)} title={`Làm bài: ${submitting?.title}`} size={submitObjective ? 'lg' : undefined}
        footer={<><button className="btn btn-ghost" onClick={() => setSubmitModal(false)}>Hủy</button><button className="btn btn-primary" onClick={doSubmit} disabled={loading || !canDoSubmit}>{loading ? 'Đang nộp...' : `Nộp bài${submitFiles.length > 0 ? ` (${submitFiles.length} file)` : ''}`}</button></>}>
        {submitObjective && (
          <div style={{ marginBottom: '1.25rem' }}>
            <PartsSolver cfg={submitCfg!} value={studentAnswers} onChange={setStudentAnswers} />
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
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}>
            <div>
              <Upload size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <div style={{ fontWeight: 500 }}>Kéo thả hoặc click để chọn file</div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 4 }}>PDF, JPG, PNG · chọn được nhiều ảnh · tối đa 20MB/file</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple hidden
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />

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
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => removeFile(i)} title="Xóa">
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
      </Modal>

      {/* File Viewer */}
      {viewFiles && <FileViewer files={viewFiles} onClose={() => setViewFiles(null)} />}

      <AssistantScheduleModal
        open={scheduleAssistantId !== null}
        onClose={() => setScheduleAssistantId(null)}
        assistant={scheduleAssistant}
        editable={false}
      />
    </div>
  );
}
