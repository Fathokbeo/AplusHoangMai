// Giao diện "Làm bài" cho học sinh — kiểu HSA: mỗi câu tự chọn sẵn Trắc nghiệm hoặc Trả lời ngắn.
import { MC_OPTIONS, type HsaConfig } from '../lib/homeworkParts';

interface Props {
  cfg: HsaConfig;
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}

export default function HsaSolver({ cfg, value, onChange, readOnly = false }: Props) {
  const setAnswer = (i: number, v: string) => {
    const arr = [...value];
    while (arr.length <= i) arr.push('');
    arr[i] = v;
    onChange(arr);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cfg.questions.map((q, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '5px 0', borderBottom: '1px solid #F2F2F2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={qLabel}>Câu {i + 1}</span>
            {q.kind === 'multiple_choice' ? (
              <div style={{ display: 'flex', gap: 18 }}>
                {MC_OPTIONS.map((opt) => {
                  const active = (value[i] || '') === opt;
                  return (
                    <button key={opt} type="button" disabled={readOnly}
                      onClick={() => setAnswer(i, active ? '' : opt)} style={mcOption(readOnly)}>
                      {radio(active)}
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: active ? '#1565C0' : '#444' }}>{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <input className="input" style={{ flex: 1, minWidth: 160, padding: '6px 10px' }} disabled={readOnly}
                placeholder="Nhập đáp án..." value={value[i] || ''} onChange={(e) => setAnswer(i, e.target.value)} />
            )}
          </div>
          {q.note && <div style={{ marginLeft: 62, fontSize: '0.78rem', color: '#B26A00', fontStyle: 'italic' }}>Gợi ý: {q.note}</div>}
        </div>
      ))}
    </div>
  );
}

const qLabel: React.CSSProperties = { fontSize: '0.85rem', fontWeight: 700, color: '#1A1A2E', minWidth: 52 };

function mcOption(readOnly: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: '2px 4px', cursor: readOnly ? 'default' : 'pointer' };
}

function radio(active: boolean): React.ReactNode {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', border: `2px solid ${active ? '#1565C0' : '#BBB'}`,
      background: active ? '#1565C0' : 'white', display: 'inline-flex', flexShrink: 0,
      boxShadow: active ? 'inset 0 0 0 3px white' : 'none',
    }} />
  );
}
