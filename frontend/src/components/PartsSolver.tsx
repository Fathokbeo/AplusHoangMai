// Giao diện "Làm bài" cho học sinh: trắc nghiệm, đúng/sai, trả lời ngắn.
// Thứ tự cố định: Trắc nghiệm → Đúng/Sai → Trả lời ngắn. (Tự luận upload riêng ở ngoài.)
import { type PartsConfig, MC_OPTIONS, TF_SUB_LABELS } from '../lib/homeworkParts';

export interface StudentAnswers {
  multiple_choice: string[];
  true_false: string[][];
  short_answer: string[];
}

interface Props {
  cfg: PartsConfig;
  value: StudentAnswers;
  onChange: (next: StudentAnswers) => void;
  readOnly?: boolean;
}

export default function PartsSolver({ cfg, value, onChange, readOnly = false }: Props) {
  const setMC = (i: number, v: string) => {
    const arr = [...value.multiple_choice]; arr[i] = v; onChange({ ...value, multiple_choice: arr });
  };
  const setTF = (i: number, j: number, v: string) => {
    const rows = value.true_false.map((r) => [...r]);
    while (rows.length <= i) rows.push(['', '', '', '']);
    rows[i][j] = v; onChange({ ...value, true_false: rows });
  };
  const setSA = (i: number, v: string) => {
    const arr = [...value.short_answer]; arr[i] = v; onChange({ ...value, short_answer: arr });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Trắc nghiệm */}
      {cfg.multiple_choice.enabled && cfg.multiple_choice.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần I — Trắc nghiệm</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: cfg.multiple_choice.count }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={qLabel}>Câu {i + 1}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MC_OPTIONS.map((opt) => (
                    <button key={opt} type="button" disabled={readOnly} onClick={() => setMC(i, opt)}
                      style={chip(value.multiple_choice[i] === opt)}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Đúng / Sai */}
      {cfg.true_false.enabled && cfg.true_false.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần II — Đúng / Sai</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: cfg.true_false.count }).map((_, i) => (
              <div key={i} style={{ background: '#FAFAFA', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ ...qLabel, marginBottom: 6 }}>Câu {i + 1}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {TF_SUB_LABELS.map((sub, j) => {
                    const v = (value.true_false[i] || [])[j] || '';
                    return (
                      <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#555', minWidth: 20 }}>{sub})</span>
                        <button type="button" disabled={readOnly} onClick={() => setTF(i, j, 'T')} style={chip(v === 'T', '#2E7D32')}>Đúng</button>
                        <button type="button" disabled={readOnly} onClick={() => setTF(i, j, 'F')} style={chip(v === 'F', '#C62828')}>Sai</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trả lời ngắn */}
      {cfg.short_answer.enabled && cfg.short_answer.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần III — Trả lời ngắn</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: cfg.short_answer.count }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={qLabel}>Câu {i + 1}</span>
                <input className="input" style={{ flex: 1, padding: '6px 10px' }} disabled={readOnly}
                  placeholder="Nhập đáp án..." value={value.short_answer[i] || ''} onChange={(e) => setSA(i, e.target.value)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontWeight: 800, fontSize: '0.9rem', color: '#C62828', marginBottom: 8 };
const qLabel: React.CSSProperties = { fontSize: '0.85rem', fontWeight: 700, color: '#1A1A2E', minWidth: 52 };

function chip(active: boolean, activeColor = '#1565C0'): React.CSSProperties {
  return {
    border: `1px solid ${active ? activeColor : '#DDD'}`,
    background: active ? activeColor : 'white',
    color: active ? 'white' : '#666',
    borderRadius: 8, padding: '5px 14px', fontSize: '0.85rem', fontWeight: 700,
    cursor: active ? 'default' : 'pointer', minWidth: 38,
  };
}
