import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import PublicLayout from '../../components/PublicLayout';
import SubmitHomeworkView from '../../components/SubmitHomeworkView';
import GradingDetails from '../../components/GradingDetails';
import { type StudentAnswers } from '../../components/PartsSolver';
import { toast } from '../../components/Toast';
import { PAGE_MAX } from '../../lib/layout';
import {
  parsePartsConfig, hasObjectiveParts, hasEssay, emptyStudentAnswers, parseHsaConfig, emptyHsaStudentAnswers,
  PART_LABELS, PART_ORDER, type PartKey,
} from '../../lib/homeworkParts';
import { ClipboardCheck, Clock, FileText, ChevronRight, CheckCircle2, RotateCcw, ArrowLeft, Edit, Loader2 } from 'lucide-react';

// Thi thử cho khách vãng lai:
//   /thi-thu       1) điền thông tin học sinh (có khối lớp)  2) chọn đề của đúng khối đó
//   /thi-thu/:id   làm bài (giao diện làm bài như học sinh) → "vui lòng chờ" → điểm + thông tin
// Chưa điền thông tin mà vào thẳng /thi-thu/:id → quay về /thi-thu để điền trước.
// Bài làm + thông tin gửi về trang "Thi thử" của admin.

const INFO_KEY = 'aplus-mock-info';          // thông tin đã điền (chỉ lưu trên máy này)
const resultKey = (id: string | number) => `aplus-mock-result-${id}`; // giữ kết quả khi tải lại trang
const GRADES = [6, 7, 8, 9, 10, 11, 12];

type Info = { full_name: string; grade: string; class_name: string; school: string; gpa: string; parent_phone: string };
const EMPTY_INFO: Info = { full_name: '', grade: '', class_name: '', school: '', gpa: '', parent_phone: '' };

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } },
};

// Tóm tắt các phần của đề: "Trắc nghiệm 12 · Đúng/Sai 4 · Tự luận"
function partsSummary(exam: any): string {
  if (exam.exam_type === 'hsa') { const c = parseHsaConfig(exam.hsa_config); return c ? `HSA · ${c.questions.length} câu` : 'HSA'; }
  const cfg = parsePartsConfig(exam.parts_config);
  if (!cfg) return 'Tự luận';
  return PART_ORDER.filter((k: PartKey) => (k === 'essay' ? cfg.essay.enabled : (cfg as any)[k].enabled))
    .map((k) => `${PART_LABELS[k]}${k === 'essay' ? '' : ` ${(cfg as any)[k].count}`}`).join(' · ');
}

function validate(info: Info): Partial<Record<keyof Info, string>> {
  const e: Partial<Record<keyof Info, string>> = {};
  if (info.full_name.trim().length < 2) e.full_name = 'Nhập họ tên học sinh';
  if (!GRADES.includes(Number(info.grade))) e.grade = 'Chọn khối lớp';
  if (!info.class_name.trim()) e.class_name = 'Nhập lớp';
  if (!info.school.trim()) e.school = 'Nhập trường';
  const g = Number(info.gpa.replace(',', '.'));
  if (!info.gpa.trim() || !Number.isFinite(g) || g < 0 || g > 10) e.gpa = 'Điểm từ 0 đến 10';
  if (!/^(\+84|0)\d{9,10}$/.test(info.parent_phone.replace(/[\s.-]/g, ''))) e.parent_phone = 'Số điện thoại chưa đúng';
  return e;
}
const savedInfo = (): Info | null => {
  const i = store.get<Info>(INFO_KEY);
  return i && Object.keys(validate({ ...EMPTY_INFO, ...i })).length === 0 ? { ...EMPTY_INFO, ...i } : null;
};

// Thẻ tóm tắt thông tin học sinh (dùng ở danh sách đề, lúc làm bài và trang kết quả)
function InfoSummary({ info, onEdit }: { info: Partial<Info> & { gpa?: any; grade?: any }; onEdit?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F9F9F9', borderRadius: 10, padding: '0.7rem 0.9rem', fontSize: '0.85rem', color: '#555' }}>
      <strong style={{ color: '#1A1A2E' }}>{info.full_name}</strong>
      <span>Lớp {info.class_name}{info.grade ? ` (khối ${info.grade})` : ''}</span>
      <span>{info.school}</span>
      <span>ĐTB {String(info.gpa ?? '').replace('.', ',')}</span>
      <span>PH: {info.parent_phone}</span>
      {onEdit && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onEdit}><Edit size={13} /> Sửa thông tin</button>}
    </div>
  );
}

// ─────────────────────── /thi-thu: thông tin → danh sách đề theo khối ───────────────────────
export function MockExamList() {
  const [info, setInfo] = useState<Info>(() => savedInfo() || { ...EMPTY_INFO, ...(store.get<Info>(INFO_KEY) || {}) });
  const [editing, setEditing] = useState(() => !savedInfo());
  const [touched, setTouched] = useState<Partial<Record<keyof Info, boolean>>>({});
  const [exams, setExams] = useState<any[] | null>(null);
  const errors = validate(info);

  useEffect(() => {
    if (editing) return;
    setExams(null);
    api.get('/public/mock-exams', { params: { grade: info.grade } }).then((r) => setExams(r.data)).catch(() => setExams([]));
  }, [editing, info.grade]);

  const confirmInfo = () => {
    setTouched(Object.fromEntries(Object.keys(EMPTY_INFO).map((k) => [k, true])));
    if (Object.keys(errors).length) { toast.error('Vui lòng điền đủ và đúng thông tin học sinh'); return; }
    store.set(INFO_KEY, info);
    setEditing(false);
  };

  const field = (k: keyof Info, label: string, props: Record<string, any> = {}) => {
    const err = touched[k] && errors[k];
    return (
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="label">{label} *</label>
        <input className="input" value={info[k]} onChange={(e) => setInfo({ ...info, [k]: e.target.value })}
          onBlur={() => setTouched({ ...touched, [k]: true })} style={err ? { borderColor: '#C62828' } : undefined} {...props} />
        {err && <div style={{ fontSize: '0.75rem', color: '#C62828', marginTop: 4 }}>{err}</div>}
      </div>
    );
  };

  return (
    <PublicLayout>
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '2rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Thi thử</h1>
        <p style={{ color: '#888', margin: '4px 0 1.25rem', fontSize: '0.9rem' }}>
          Làm đề thi thử miễn phí ngay trên web. Nộp bài xong hệ thống chấm và trả điểm cho bạn sau vài phút.
        </p>

        {editing ? (
          <div className="card" style={{ maxWidth: 760 }}>
            <h2 className="section-title" style={{ margin: 0 }}>Bước 1 · Thông tin học sinh</h2>
            <div style={{ fontSize: '0.85rem', color: '#888', margin: '4px 0 16px' }}>
              Điền đầy đủ để xem các đề thi thử dành cho khối lớp của bạn. Trung tâm dùng thông tin này để gửi kết quả và tư vấn lộ trình học.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {field('full_name', 'Họ và tên học sinh', { placeholder: 'vd: Nguyễn Minh Anh', autoComplete: 'name' })}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">Khối lớp *</label>
                <select className="input" value={info.grade} onChange={(e) => setInfo({ ...info, grade: e.target.value })}
                  onBlur={() => setTouched({ ...touched, grade: true })} style={touched.grade && errors.grade ? { borderColor: '#C62828' } : undefined}>
                  <option value="">— Chọn khối —</option>
                  {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
                {touched.grade && errors.grade && <div style={{ fontSize: '0.75rem', color: '#C62828', marginTop: 4 }}>{errors.grade}</div>}
              </div>
              {field('class_name', 'Lớp', { placeholder: 'vd: 9A2' })}
              {field('school', 'Trường', { placeholder: 'vd: THCS Hoàng Mai' })}
              {field('gpa', 'Điểm trung bình kì gần nhất', { placeholder: 'vd: 8.2', inputMode: 'decimal' })}
              {field('parent_phone', 'Số điện thoại phụ huynh', { placeholder: 'vd: 0912 345 678', inputMode: 'tel', autoComplete: 'tel' })}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={confirmInfo}>
              Xem đề thi thử <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <InfoSummary info={info} onEdit={() => setEditing(true)} />
            <h2 className="section-title" style={{ margin: '1.5rem 0 1rem' }}>Bước 2 · Chọn đề thi thử lớp {info.grade}</h2>
            {exams === null ? <div style={{ color: '#999' }}>Đang tải…</div> : exams.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: '#888', padding: '2.5rem' }}>Hiện chưa có đề thi thử nào cho lớp {info.grade}. Quay lại sau nhé!</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                {exams.map((e) => <MockExamCard key={e.id} exam={e} />)}
              </div>
            )}
          </>
        )}
      </section>
    </PublicLayout>
  );
}

export function MockExamCard({ exam }: { exam: any }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', transition: 'transform 0.2s, box-shadow 0.2s', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'; }}>
      <div style={{ height: 90, background: 'linear-gradient(135deg, #C62828, #1565C0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ClipboardCheck size={36} color="rgba(255,255,255,0.8)" />
      </div>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>{exam.title}</h3>
        {exam.description && <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>{exam.description}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.78rem', color: '#999', marginBottom: 12 }}>
          <span>{partsSummary(exam)}</span>
          {exam.time_limit_minutes && <span><Clock size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{exam.time_limit_minutes} phút</span>}
          <span>Thang {exam.max_score} điểm</span>
        </div>
        <Link to={`/thi-thu/${exam.id}`} style={{ textDecoration: 'none', marginTop: 'auto' }}>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Làm bài <ChevronRight size={13} />
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────── /thi-thu/:id: làm bài ───────────────────────────────
type Step = 'ready' | 'exam' | 'result';

export default function MockExamTake() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [info] = useState<Info | null>(() => savedInfo());
  const [exam, setExam] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  // Đã nộp đề này trên máy này → mở thẳng màn kết quả
  const [step, setStep] = useState<Step>(() => (store.get(resultKey(id)) ? 'result' : 'ready'));
  const [answers, setAnswers] = useState<StudentAnswers>({ multiple_choice: [], true_false: [], short_answer: [] });
  const [hsaAnswers, setHsaAnswers] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [attempt, setAttempt] = useState<{ id: number; token: string } | null>(() => store.get(resultKey(id)));

  useEffect(() => {
    api.get(`/public/mock-exams/${id}`).then((r) => setExam(r.data)).catch(() => setNotFound(true));
  }, [id]);

  // Màn kết quả: hỏi điểm định kỳ cho tới khi chấm xong
  useEffect(() => {
    if (step !== 'result' || !attempt) return;
    let stop = false;
    const tick = async () => {
      try {
        const { data } = await api.get(`/public/mock-exams/attempts/${attempt.id}`, { params: { token: attempt.token } });
        if (stop) return;
        setResult(data);
        if (data.grading_status === 'pending' || data.grading_status === 'grading') setTimeout(tick, 4000);
      } catch {
        if (!stop) { store.del(resultKey(id)); setAttempt(null); setStep('ready'); }
      }
    };
    tick();
    return () => { stop = true; };
  }, [step, attempt, id]);

  const isHsa = exam?.exam_type === 'hsa';
  const cfg = exam && !isHsa ? parsePartsConfig(exam.parts_config) : null;
  const hsaCfg = exam && isHsa ? parseHsaConfig(exam.hsa_config) : null;
  const objective = isHsa ? true : hasObjectiveParts(cfg);
  const essay = isHsa ? false : (hasEssay(cfg) || !cfg);
  const essayOnly = !isHsa && essay && !objective && !!exam?.has_pdf;
  const deadline = startedAt && exam?.time_limit_minutes ? startedAt + exam.time_limit_minutes * 60e3 : null;

  const start = () => {
    setAnswers(emptyStudentAnswers(cfg));
    setHsaAnswers(emptyHsaStudentAnswers(hsaCfg));
    setFiles([]);
    setStartedAt(Date.now());
    setStep('exam');
  };

  const addFiles = (incoming: FileList | File[]) => setFiles((prev) => {
    const merged = [...prev];
    Array.from(incoming).forEach((f) => { if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f); });
    return merged.slice(0, 12);
  });

  const submit = useCallback(async () => {
    if (!info) return;
    if (!isHsa && !objective && files.length === 0) { toast.error('Chọn ít nhất một ảnh bài làm'); return; }
    setSubmitting(true);
    try {
      const body = new FormData();
      (Object.keys(info) as (keyof Info)[]).forEach((k) => body.append(k, info[k]));
      files.forEach((f) => body.append('files', f));
      if (isHsa) body.append('structured_answers', JSON.stringify({ hsa: hsaAnswers }));
      else if (objective) body.append('structured_answers', JSON.stringify(answers));
      const { data } = await api.post(`/public/mock-exams/${id}/attempts`, body);
      const a = { id: data.id, token: data.token };
      store.set(resultKey(id), a);
      setAttempt(a);
      setStep('result');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Nộp bài không thành công, vui lòng thử lại');
    } finally { setSubmitting(false); }
  }, [id, info, files, answers, hsaAnswers, isHsa, objective]);

  const leaveExam = () => {
    if (confirm('Thoát khỏi bài làm? Các câu đã làm sẽ không được lưu.')) setStep('ready');
  };
  const retake = () => { store.del(resultKey(id)); setAttempt(null); setResult(null); setStep('ready'); };

  // Chưa điền thông tin học sinh → về /thi-thu điền trước (trừ khi đang xem lại kết quả đã nộp)
  if (!info && !attempt) return <Navigate to="/thi-thu" replace />;

  if (notFound) return (
    <PublicLayout>
      <div style={{ maxWidth: 560, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
        <h1 className="page-title">Đề thi không còn mở</h1>
        <p style={{ color: '#777' }}>Đề này đã đóng hoặc không tồn tại.</p>
        <Link to="/thi-thu" className="btn btn-primary" style={{ marginTop: 12 }}>Xem các đề khác</Link>
      </div>
    </PublicLayout>
  );
  if (!exam) return <PublicLayout><div style={{ padding: '4rem', textAlign: 'center', color: '#999' }}>Đang tải đề…</div></PublicLayout>;

  return (
    <PublicLayout>
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
        <Link to="/thi-thu" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#888', textDecoration: 'none', fontSize: '0.85rem' }}>
          <ArrowLeft size={15} /> Các đề thi thử
        </Link>
        <h1 className="page-title" style={{ margin: '8px 0 6px' }}>{exam.title}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge badge-purple">{partsSummary(exam)}</span>
          <span className="badge badge-gray"><Clock size={11} style={{ marginRight: 4 }} />{exam.time_limit_minutes ? `${exam.time_limit_minutes} phút` : 'Không giới hạn thời gian'}</span>
          <span className="badge badge-gray">Thang {exam.max_score} điểm</span>
          {exam.has_pdf && <span className="badge badge-gray"><FileText size={11} style={{ marginRight: 4 }} />Có đề PDF</span>}
        </div>
        {exam.description && <p style={{ color: '#666', lineHeight: 1.6, margin: '12px 0 0', fontSize: '0.9rem' }}>{exam.description}</p>}

        {step === 'result' ? (
          <ResultCard result={result} onRetake={retake} />
        ) : (
          <div className="card" style={{ marginTop: '1.25rem' }}>
            <h2 className="section-title" style={{ margin: '0 0 10px' }}>Thông tin học sinh</h2>
            {info && <InfoSummary info={info} onEdit={() => navigate('/thi-thu')} />}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={start}>
              Bắt đầu làm bài <ChevronRight size={16} />
            </button>
            {exam.time_limit_minutes && (
              <div style={{ fontSize: '0.8rem', color: '#999', textAlign: 'center', marginTop: 8 }}>
                Đồng hồ {exam.time_limit_minutes} phút bắt đầu chạy khi bạn bấm nút{isHsa ? ' — hết giờ bài tự nộp' : ''}.
              </div>
            )}
          </div>
        )}
      </section>

      <SubmitHomeworkView
        open={step === 'exam'}
        onClose={leaveExam}
        title={exam.title}
        pdfUrl={exam.has_pdf ? `/api/public/mock-exams/${exam.id}/pdf` : null}
        submitObjective={objective}
        submitEssay={essay}
        cfg={cfg}
        studentAnswers={answers}
        onAnswersChange={setAnswers}
        examType={isHsa ? 'hsa' : 'thpt'}
        hsaCfg={hsaCfg}
        hsaAnswers={hsaAnswers}
        onHsaAnswersChange={setHsaAnswers}
        submitFiles={files}
        onAddFiles={addFiles}
        onRemoveFile={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
        loading={submitting}
        canDoSubmit={isHsa || objective || files.length > 0}
        onSubmit={submit}
        examDeadline={isHsa ? deadline : null}
        dueDate={!isHsa && deadline ? new Date(deadline).toISOString() : null}
        essayPages={essayOnly}
      />
    </PublicLayout>
  );
}

// Kết quả: "vui lòng chờ" khi đang chấm → điểm + thông tin học sinh + chi tiết từng câu
function ResultCard({ result, onRetake }: { result: any; onRetake: () => void }) {
  const grading = !result || result.grading_status === 'pending' || result.grading_status === 'grading';
  if (grading) return (
    <div className="card" style={{ marginTop: '1.25rem', textAlign: 'center', padding: '2rem 1.25rem' }}>
      <Loader2 size={34} color="#1565C0" className="animate-spin" style={{ margin: '0 auto', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 12 }}>Đã nộp bài — vui lòng chờ trong giây lát</div>
      <div style={{ color: '#888', fontSize: '0.88rem', marginTop: 4 }}>Hệ thống đang chấm bài, điểm và nhận xét sẽ hiện ngay tại đây. Bạn không cần tải lại trang.</div>
      {result && <div style={{ marginTop: 16, textAlign: 'left' }}><InfoSummary info={result} /></div>}
    </div>
  );
  if (result.score === null || result.score === undefined) return (
    <div className="card" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
      <CheckCircle2 size={36} color="#2E7D32" style={{ margin: '0 auto', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 10 }}>Đã nộp bài thành công</div>
      <div style={{ color: '#888', fontSize: '0.88rem', marginTop: 4 }}>Trung tâm sẽ chấm và liên hệ phụ huynh để báo kết quả.</div>
      <div style={{ marginTop: 14, textAlign: 'left' }}><InfoSummary info={result} /></div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={onRetake}><RotateCcw size={14} /> Làm lại đề</button>
    </div>
  );
  const ratio = result.max_score > 0 ? result.score / result.max_score : 0;
  const tone = ratio >= 0.8 ? { c: '#2E7D32', b: '#E8F5E9' } : ratio >= 0.5 ? { c: '#E65100', b: '#FFF3E0' } : { c: '#C62828', b: '#FFEBEE' };
  return (
    <div className="card" style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem', background: tone.b, color: tone.c, flexShrink: 0 }}>
          {result.score}
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>Điểm bài thi thử</div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{result.score}/{result.max_score} điểm</div>
        </div>
      </div>
      <InfoSummary info={result} />
      {result.feedback && (
        <div style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.6, marginTop: 12 }}>
          <strong>Nhận xét:</strong> {result.feedback}
        </div>
      )}
      <GradingDetails details={result.grading_details} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={onRetake}><RotateCcw size={14} /> Làm lại đề</button>
        <Link to="/thi-thu" className="btn btn-outline btn-sm">Thử đề khác</Link>
        <a href="/#contact" className="btn btn-primary btn-sm">Đăng ký học thử</a>
      </div>
    </div>
  );
}
