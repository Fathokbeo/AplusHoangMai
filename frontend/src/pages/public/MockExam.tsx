import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import PublicLayout from '../../components/PublicLayout';
import SubmitHomeworkView from '../../components/SubmitHomeworkView';
import GradingDetails from '../../components/GradingDetails';
import Modal from '../../components/Modal';
import { type StudentAnswers } from '../../components/PartsSolver';
import { toast } from '../../components/Toast';
import { PAGE_MAX } from '../../lib/layout';
import {
  parsePartsConfig, hasObjectiveParts, hasEssay, emptyStudentAnswers, parseHsaConfig, emptyHsaStudentAnswers,
  PART_LABELS, PART_ORDER, type PartKey,
} from '../../lib/homeworkParts';
import { DEFAULT_INFO_FIELDS, MOCK_GRADES as GRADES, validateInfoValues, displayValue, type InfoField, type InfoValues } from '../../lib/mockInfoFields';
import { ClipboardCheck, Clock, FileText, ChevronRight, CheckCircle2, RotateCcw, ArrowLeft, Edit, Loader2 } from 'lucide-react';

// Thi thử cho khách vãng lai (KHÔNG cần đăng nhập):
//   /thi-thu       chọn khối 6–12 → thấy ngay các đề của khối; bấm "Làm bài" lần đầu → điền thông tin (admin
//                  tự chỉnh các ô cần điền) → vào làm bài. Thông tin chỉ lưu trên máy này.
//   /thi-thu/:id   làm bài (giao diện làm bài như học sinh) → "vui lòng chờ" → điểm + thông tin
// Chưa điền thông tin mà vào thẳng /thi-thu/:id → về /thi-thu?lam=<id> để điền rồi làm luôn đề đó.
// Bài làm + thông tin gửi về trang "Thi thử" của admin.

const INFO_KEY = 'aplus-mock-info';          // thông tin đã điền (chỉ lưu trên máy này)
const GRADE_KEY = 'aplus-mock-grade';        // khối đang xem
const resultKey = (id: string | number) => `aplus-mock-result-${id}`; // giữ kết quả khi tải lại trang

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } },
};

// Các ô thông tin admin đã cấu hình (tải 1 lần mỗi trang)
function useInfoFields(): InfoField[] | null {
  const [fields, setFields] = useState<InfoField[] | null>(null);
  useEffect(() => {
    api.get('/public/mock-exams/info-fields').then((r) => setFields(r.data)).catch(() => setFields(DEFAULT_INFO_FIELDS));
  }, []);
  return fields;
}

const storedInfo = (): InfoValues => {
  const i = store.get<Record<string, any>>(INFO_KEY) || {};
  return Object.fromEntries(Object.entries(i).map(([k, v]) => [k, String(v ?? '')]));
};
// Thông tin đã lưu có đủ & đúng theo cấu hình hiện tại không (admin đổi ô bắt buộc → điền bổ sung)
const savedInfo = (fields: InfoField[] | null): InfoValues | null => {
  if (!fields) return null;
  const i = storedInfo();
  return Object.keys(validateInfoValues(fields, i)).length === 0 ? i : null;
};

// Tóm tắt các phần của đề: "Trắc nghiệm 12 · Đúng/Sai 4 · Tự luận"
function partsSummary(exam: any): string {
  if (exam.exam_type === 'hsa') { const c = parseHsaConfig(exam.hsa_config); return c ? `HSA · ${c.questions.length} câu` : 'HSA'; }
  const cfg = parsePartsConfig(exam.parts_config);
  if (!cfg) return 'Tự luận';
  return PART_ORDER.filter((k: PartKey) => (k === 'essay' ? cfg.essay.enabled : (cfg as any)[k].enabled))
    .map((k) => `${PART_LABELS[k]}${k === 'essay' ? '' : ` ${(cfg as any)[k].count}`}`).join(' · ');
}

// Thẻ tóm tắt thông tin học sinh theo đúng các ô đã cấu hình (dùng ở danh sách đề, lúc làm bài và trang kết quả).
// values: thông tin đã điền, hoặc bản ghi kết quả từ server (có extra_info cho các ô thêm).
function InfoSummary({ fields, values, onEdit }: { fields: InfoField[] | null; values: Record<string, any>; onEdit?: () => void }) {
  const v: Record<string, any> = { ...values };
  (Array.isArray(values.extra_info) ? values.extra_info : []).forEach((x: any) => { if (x && x.key) v[x.key] = x.value; });
  const list = fields || DEFAULT_INFO_FIELDS;
  const name = String(v.full_name || '');
  const rest = list.filter((f) => f.key !== 'full_name').map((f) => ({ f, s: displayValue(f, v[f.key]) })).filter((x) => x.s);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F9F9F9', borderRadius: 10, padding: '0.7rem 0.9rem', fontSize: '0.85rem', color: '#555' }}>
      <strong style={{ color: '#1A1A2E' }}>{name}</strong>
      {rest.map(({ f, s }) => <span key={f.key} title={f.label}>{f.type === 'grade' ? s : f.key === 'class_name' ? `Lớp ${s}` : `${f.label}: ${s}`}</span>)}
      {onEdit && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onEdit}><Edit size={13} /> Sửa thông tin</button>}
    </div>
  );
}

// Form điền thông tin theo cấu hình
function InfoForm({ fields, values, onChange, touched, onTouch }: {
  fields: InfoField[]; values: InfoValues; onChange: (v: InfoValues) => void;
  touched: Record<string, boolean>; onTouch: (k: string) => void;
}) {
  const errors = validateInfoValues(fields, values);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {fields.map((f) => {
        const err = touched[f.key] && errors[f.key];
        const style = err ? { borderColor: '#C62828' } : undefined;
        return (
          <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'grade' ? (
              <select className="input" value={values[f.key] || ''} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })} onBlur={() => onTouch(f.key)} style={style}>
                <option value="">— Chọn khối —</option>
                {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
            ) : (
              <input className="input" value={values[f.key] || ''} placeholder={f.placeholder || ''} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                onBlur={() => onTouch(f.key)} style={style}
                inputMode={f.type === 'phone' ? 'tel' : f.type === 'score' || f.type === 'number' ? 'decimal' : undefined}
                autoComplete={f.key === 'full_name' ? 'name' : f.type === 'phone' ? 'tel' : undefined} />
            )}
            {err && <div style={{ fontSize: '0.75rem', color: '#C62828', marginTop: 4 }}>{err}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────── /thi-thu: chọn khối → danh sách đề → điền thông tin khi bắt đầu làm ───────────────────────
export function MockExamList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fields = useInfoFields();
  const [allExams, setAllExams] = useState<any[] | null>(null);
  const [grade, setGrade] = useState<number | null>(() => {
    const q = Number(params.get('khoi'));
    if (GRADES.includes(q)) return q;
    const s = Number(storedInfo().grade);
    if (GRADES.includes(s)) return s;
    const g = Number(store.get<number>(GRADE_KEY));
    return GRADES.includes(g) ? g : null;
  });
  const [info, setInfo] = useState<InfoValues>(() => storedInfo());
  const [form, setForm] = useState<{ exam: any | null } | null>(null); // hộp điền thông tin (exam = đề sẽ làm sau khi điền)
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const hasInfo = !!savedInfo(fields);

  useEffect(() => {
    api.get('/public/mock-exams').then((r) => setAllExams(r.data)).catch(() => setAllExams([]));
  }, []);

  const pickGrade = (g: number) => {
    setGrade(g);
    store.set(GRADE_KEY, g);
    params.set('khoi', String(g));
    setParams(params, { replace: true });
  };

  // Bấm "Làm bài": đã có đủ thông tin → vào làm luôn; chưa có → hiện hộp điền (khối điền sẵn theo đề / tab)
  const openStart = (exam: any) => {
    const examGrade = exam.grade && GRADES.includes(Number(exam.grade)) ? String(exam.grade) : '';
    const s = savedInfo(fields);
    if (s) {
      if (examGrade && s.grade !== examGrade) store.set(INFO_KEY, { ...s, grade: examGrade });
      navigate(`/thi-thu/${exam.id}`);
      return;
    }
    setInfo((prev) => ({ ...prev, grade: examGrade || prev.grade || (grade ? String(grade) : '') }));
    setTouched({});
    setForm({ exam });
  };

  // ?lam=<id>: vào thẳng link đề khi chưa điền thông tin → mở hộp điền cho đúng đề đó
  useEffect(() => {
    const lam = Number(params.get('lam'));
    if (!lam || !allExams || !fields) return;
    const e = allExams.find((x) => x.id === lam);
    params.delete('lam');
    setParams(params, { replace: true });
    if (e) {
      if (e.grade && GRADES.includes(Number(e.grade))) setGrade(Number(e.grade));
      openStart(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allExams, fields]);

  const confirmInfo = () => {
    if (!fields) return;
    setTouched(Object.fromEntries(fields.map((f) => [f.key, true])));
    if (Object.keys(validateInfoValues(fields, info)).length) { toast.error('Vui lòng điền đủ và đúng thông tin học sinh'); return; }
    store.set(INFO_KEY, info);
    const exam = form && form.exam;
    setForm(null);
    if (exam) navigate(`/thi-thu/${exam.id}`);
  };

  const forGrade = (g: number) => (allExams || []).filter((e) => e.grade == null || Number(e.grade) === g);
  const exams = grade ? forGrade(grade) : [];

  return (
    <PublicLayout>
      <section style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '2rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Thi thử</h1>
        <p style={{ color: '#888', margin: '4px 0 1.25rem', fontSize: '0.9rem' }}>
          Làm đề thi thử miễn phí ngay trên web, không cần tài khoản. Chọn khối lớp để xem các đề; nộp bài xong hệ thống chấm và trả điểm sau vài phút.
        </p>

        {/* Chọn khối lớp */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {GRADES.map((g) => {
            const n = allExams ? forGrade(g).length : null;
            const on = grade === g;
            return (
              <button key={g} type="button" onClick={() => pickGrade(g)} className="btn btn-sm"
                style={{
                  borderRadius: 99, padding: '0.45rem 1rem', fontWeight: 700,
                  background: on ? '#C62828' : 'white', color: on ? 'white' : '#444',
                  border: on ? '1px solid #C62828' : '1px solid #E0E0E0', boxShadow: on ? '0 2px 8px rgba(198,40,40,0.25)' : 'none',
                }}>
                Lớp {g}{n != null ? <span style={{ fontWeight: 500, opacity: 0.8 }}> · {n} đề</span> : null}
              </button>
            );
          })}
        </div>

        {hasInfo && (
          <div style={{ marginBottom: 16 }}>
            <InfoSummary fields={fields} values={info} onEdit={() => { setTouched({}); setForm({ exam: null }); }} />
          </div>
        )}

        {!grade ? (
          <div className="card" style={{ textAlign: 'center', color: '#888', padding: '2.5rem' }}>Chọn khối lớp ở trên để xem các đề thi thử.</div>
        ) : allExams === null ? <div style={{ color: '#999' }}>Đang tải…</div> : exams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#888', padding: '2.5rem' }}>Hiện chưa có đề thi thử nào cho lớp {grade}. Quay lại sau nhé!</div>
        ) : (
          <>
            <h2 className="section-title" style={{ margin: '0 0 1rem' }}>Đề thi thử lớp {grade}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
              {exams.map((e) => <MockExamCard key={e.id} exam={e} onStart={() => openStart(e)} />)}
            </div>
          </>
        )}
      </section>

      {/* Điền thông tin học sinh: trước khi làm bài lần đầu, hoặc khi bấm "Sửa thông tin" */}
      <Modal open={!!form} onClose={() => setForm(null)} size="lg"
        title={form && form.exam ? `Thông tin học sinh — ${form.exam.title}` : 'Thông tin học sinh'}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setForm(null)}>Hủy</button>
          <button className="btn btn-primary" onClick={confirmInfo} disabled={!fields}>
            {form && form.exam ? <>Bắt đầu làm bài <ChevronRight size={16} /></> : 'Lưu thông tin'}
          </button>
        </>}>
        <div style={{ fontSize: '0.85rem', color: '#888', margin: '0 0 14px' }}>
          Trung tâm dùng thông tin này để gửi kết quả và tư vấn lộ trình học. Chỉ cần điền một lần trên máy này.
        </div>
        {fields ? (
          <InfoForm fields={fields} values={info} onChange={setInfo} touched={touched} onTouch={(k) => setTouched((t) => ({ ...t, [k]: true }))} />
        ) : <div style={{ color: '#999' }}>Đang tải…</div>}
      </Modal>
    </PublicLayout>
  );
}

export function MockExamCard({ exam, onStart }: { exam: any; onStart?: () => void }) {
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
          <span>{exam.grade ? `Lớp ${exam.grade}` : 'Mọi khối'}</span>
          <span>{partsSummary(exam)}</span>
          {exam.time_limit_minutes && <span><Clock size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{exam.time_limit_minutes} phút</span>}
          <span>Thang {exam.max_score} điểm</span>
        </div>
        {onStart ? (
          <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }} onClick={onStart}>
            Làm bài <ChevronRight size={13} />
          </button>
        ) : (
          <Link to={`/thi-thu/${exam.id}`} style={{ textDecoration: 'none', marginTop: 'auto' }}>
            <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
              Làm bài <ChevronRight size={13} />
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── /thi-thu/:id: làm bài ───────────────────────────────
type Step = 'ready' | 'exam' | 'result';

export default function MockExamTake() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const fields = useInfoFields();
  const info = savedInfo(fields);
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
      Object.entries(info).forEach(([k, v]) => body.append(k, v));
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

  // Chưa điền đủ thông tin học sinh → về /thi-thu điền rồi làm luôn đề này (trừ khi đang xem lại kết quả đã nộp)
  if (fields && !info && !attempt) return <Navigate to={`/thi-thu?lam=${id}`} replace />;

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
          <ResultCard result={result} fields={fields} onRetake={retake} />
        ) : (
          <div className="card" style={{ marginTop: '1.25rem' }}>
            <h2 className="section-title" style={{ margin: '0 0 10px' }}>Thông tin học sinh</h2>
            {info && <InfoSummary fields={fields} values={info} onEdit={() => navigate(`/thi-thu?lam=${id}`)} />}
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
function ResultCard({ result, fields, onRetake }: { result: any; fields: InfoField[] | null; onRetake: () => void }) {
  const grading = !result || result.grading_status === 'pending' || result.grading_status === 'grading';
  if (grading) return (
    <div className="card" style={{ marginTop: '1.25rem', textAlign: 'center', padding: '2rem 1.25rem' }}>
      <Loader2 size={34} color="#1565C0" className="animate-spin" style={{ margin: '0 auto', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 12 }}>Đã nộp bài — vui lòng chờ trong giây lát</div>
      <div style={{ color: '#888', fontSize: '0.88rem', marginTop: 4 }}>Hệ thống đang chấm bài, điểm và nhận xét sẽ hiện ngay tại đây. Bạn không cần tải lại trang.</div>
      {result && <div style={{ marginTop: 16, textAlign: 'left' }}><InfoSummary fields={fields} values={result} /></div>}
    </div>
  );
  if (result.score === null || result.score === undefined) return (
    <div className="card" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
      <CheckCircle2 size={36} color="#2E7D32" style={{ margin: '0 auto', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 10 }}>Đã nộp bài thành công</div>
      <div style={{ color: '#888', fontSize: '0.88rem', marginTop: 4 }}>Trung tâm sẽ chấm và liên hệ phụ huynh để báo kết quả.</div>
      <div style={{ marginTop: 14, textAlign: 'left' }}><InfoSummary fields={fields} values={result} /></div>
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
      <InfoSummary fields={fields} values={result} />
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
