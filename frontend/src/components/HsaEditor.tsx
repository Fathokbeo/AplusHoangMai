// Giáo viên cấu hình đề kiểu HSA: mỗi câu tự chọn Trắc nghiệm hoặc Trả lời ngắn, luôn 1 điểm/câu.
// Khác THPT: chấm hoàn toàn tự động theo đáp án nhập ở đây — không hỗ trợ để trống cho AI đọc file.
import { type HsaConfig, type HsaQuestion, MC_OPTIONS, resizeHsaQuestions, hsaMaxScore } from '../lib/homeworkParts';

interface Props {
  value: HsaConfig;
  onChange: (next: HsaConfig) => void;
}

export default function HsaEditor({ value, onChange }: Props) {
  const count = value.questions.length;

  const setCount = (raw: string) => {
    const n = Math.max(0, Math.min(50, parseInt(raw) || 0));
    onChange({ questions: resizeHsaQuestions(value.questions, n) });
  };

  const setQuestion = (i: number, patch: Partial<HsaQuestion>) => {
    onChange({ questions: value.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6 }}>
        Mỗi câu tự chọn <strong>Trắc nghiệm</strong> hoặc <strong>Trả lời ngắn</strong>, luôn <strong>1 điểm/câu</strong>.
        Điểm cuối = tổng số câu đúng (không quy đổi thang điểm). Chấm hoàn toàn tự động theo đáp án nhập ở đây
        — cần nhập đủ đáp án cho tất cả các câu (không hỗ trợ AI đọc File đáp án như THPT).
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>Số câu:</span>
        <input className="input" type="number" min={0} max={50} style={{ width: 78, padding: '4px 8px' }}
          value={count} onChange={(e) => setCount(e.target.value)} />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.questions.map((q, i) => (
          <div key={i} style={qRow}>
            <span style={qLabel}>Câu {i + 1}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['multiple_choice', 'short_answer'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setQuestion(i, { kind: k })} style={kindChip(q.kind === k)}>
                  {k === 'multiple_choice' ? 'TN' : 'TLN'}
                </button>
              ))}
            </div>
            {q.kind === 'multiple_choice' ? (
              <div style={{ display: 'flex', gap: 4 }}>
                {MC_OPTIONS.map((opt) => (
                  <button key={opt} type="button" onClick={() => setQuestion(i, { answer: q.answer === opt ? '' : opt })} style={chip(q.answer === opt)}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <input className="input" style={{ flex: '1 1 140px', minWidth: 120, padding: '5px 9px' }}
                  placeholder="Đáp án đúng. Vd: 12; 1/2; x=3"
                  value={q.answer} onChange={(e) => setQuestion(i, { answer: e.target.value })} />
                <input className="input" style={{ flex: '1 1 140px', minWidth: 120, padding: '5px 9px', fontSize: '0.82rem', background: '#FFFDF5' }}
                  placeholder="Ghi chú cách điền (tùy chọn)"
                  value={q.note || ''} onChange={(e) => setQuestion(i, { note: e.target.value })} />
              </>
            )}
            {!q.answer && <span style={unsetHint}>chưa có đáp án</span>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F3E9FF', borderRadius: 10 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6A1B9A' }}>Tổng điểm (thang HSA)</span>
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#6A1B9A' }}>{hsaMaxScore(value)} điểm</span>
      </div>
    </div>
  );
}

const qRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #F2F2F2' };
const qLabel: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#1A1A2E', minWidth: 48 };
const unsetHint: React.CSSProperties = { fontSize: '0.72rem', color: '#B26A00', fontStyle: 'italic' };

function chip(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? '#C62828' : '#DDD'}`, background: active ? '#C62828' : 'white',
    color: active ? 'white' : '#666', borderRadius: 7, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700,
    cursor: 'pointer', minWidth: 32,
  };
}
function kindChip(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? '#1565C0' : '#DDD'}`, background: active ? '#1565C0' : 'white',
    color: active ? 'white' : '#666', borderRadius: 7, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
  };
}
