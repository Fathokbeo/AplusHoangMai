// Giao diện "Làm bài" cho học sinh: trắc nghiệm (ô tròn), đúng/sai (bảng kiểu THPT), trả lời ngắn.
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

  const saNotes = (cfg.short_answer.notes as string[]) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Trắc nghiệm — ô tròn cạnh A/B/C/D */}
      {cfg.multiple_choice.enabled && cfg.multiple_choice.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần I — Trắc nghiệm</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: cfg.multiple_choice.count }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '4px 0', borderBottom: '1px solid #F2F2F2' }}>
                <span style={qLabel}>Câu {i + 1}</span>
                <div style={{ display: 'flex', gap: 18 }}>
                  {MC_OPTIONS.map((opt) => {
                    const active = value.multiple_choice[i] === opt;
                    return (
                      <button key={opt} type="button" disabled={readOnly} onClick={() => setMC(i, active ? '' : opt)}
                        style={mcOption(readOnly)}>
                        {radio(active, '#1565C0')}
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: active ? '#1565C0' : '#444' }}>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Đúng / Sai — bảng kiểu đề thi THPT (câu xếp ngang, ý a–d xếp dọc) */}
      {cfg.true_false.enabled && cfg.true_false.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần II — Đúng / Sai</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Array.from({ length: cfg.true_false.count }).map((_, i) => (
              <div key={i} style={tfCard}>
                <div style={tfCardHead}>Câu {i + 1}</div>
                <div style={tfGridHead}>
                  <span />
                  <span style={tfColHead('#2E7D32')}>Đúng</span>
                  <span style={tfColHead('#C62828')}>Sai</span>
                </div>
                {TF_SUB_LABELS.map((sub, j) => {
                  const v = (value.true_false[i] || [])[j] || '';
                  return (
                    <div key={sub} style={tfGridRow}>
                      <span style={tfSub}>{sub})</span>
                      <span style={tfCell(readOnly)} onClick={() => !readOnly && setTF(i, j, v === 'T' ? '' : 'T')}>{radio(v === 'T', '#2E7D32', readOnly)}</span>
                      <span style={tfCell(readOnly)} onClick={() => !readOnly && setTF(i, j, v === 'F' ? '' : 'F')}>{radio(v === 'F', '#C62828', readOnly)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trả lời ngắn — kèm ghi chú cách điền của giáo viên */}
      {cfg.short_answer.enabled && cfg.short_answer.count > 0 && (
        <section>
          <div style={sectionTitle}>Phần III — Trả lời ngắn</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: cfg.short_answer.count }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={qLabel}>Câu {i + 1}</span>
                  <input className="input" style={{ flex: 1, padding: '6px 10px' }} disabled={readOnly}
                    placeholder="Nhập đáp án..." value={value.short_answer[i] || ''} onChange={(e) => setSA(i, e.target.value)} />
                </div>
                {saNotes[i] && <div style={{ marginLeft: 62, fontSize: '0.78rem', color: '#B26A00', fontStyle: 'italic' }}>Gợi ý: {saNotes[i]}</div>}
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

function mcOption(readOnly: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
    padding: '2px 4px', cursor: readOnly ? 'default' : 'pointer',
  };
}

// Thẻ 1 câu Đúng/Sai (kiểu THPT)
const tfCard: React.CSSProperties = { border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 12px', background: '#FAFAFA', minWidth: 150 };
const tfCardHead: React.CSSProperties = { fontSize: '0.82rem', fontWeight: 800, color: '#1A1A2E', textAlign: 'center', marginBottom: 6 };
const tfGridHead: React.CSSProperties = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr', alignItems: 'center', marginBottom: 2 };
const tfGridRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr', alignItems: 'center', padding: '3px 0' };
const tfSub: React.CSSProperties = { fontSize: '0.82rem', fontWeight: 700, color: '#555' };
function tfCell(readOnly: boolean): React.CSSProperties {
  return { display: 'flex', justifyContent: 'center', cursor: readOnly ? 'default' : 'pointer' };
}
function tfColHead(color: string): React.CSSProperties {
  return { fontSize: '0.72rem', fontWeight: 700, color, textAlign: 'center' };
}

// Ô tròn (radio) — đặc khi được chọn
function radio(active: boolean, color: string, disabled = false): React.ReactNode {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', border: `2px solid ${active ? color : '#BBB'}`,
      background: active ? color : 'white', display: 'inline-flex', flexShrink: 0,
      boxShadow: active ? 'inset 0 0 0 3px white' : 'none', opacity: disabled ? 0.55 : 1,
    }} />
  );
}
