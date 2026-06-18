// Đối chiếu đáp án học sinh đã điền với đáp án đúng (key) — dùng cho giáo viên xem bài nộp.
import { parsePartsConfig } from '../lib/homeworkParts';

interface Props {
  partsConfig: any;       // parts_config đầy đủ (có answers/key)
  structuredAnswers: any; // structured_answers học sinh đã nộp
}

const TF = ['a', 'b', 'c', 'd'];
const conv = (v: any) => (v ? (String(v).toUpperCase().startsWith('T') ? 'Đúng' : 'Sai') : '—');

export default function StructuredAnswerReview({ partsConfig, structuredAnswers }: Props) {
  const cfg = parsePartsConfig(partsConfig);
  let ans: any = structuredAnswers;
  if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch { ans = null; } }
  if (!cfg || !ans) return null;

  const enabled = (k: string) => cfg[k] && cfg[k].enabled;
  const cell = (ok: boolean): React.CSSProperties => ({
    padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
    background: ok ? '#E8F5E9' : '#FFEBEE', color: ok ? '#2E7D32' : '#C62828',
  });

  return (
    <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: '0.83rem', color: '#1A1A2E' }}>Bài làm có cấu trúc của học sinh:</strong>

      {enabled('multiple_choice') && Array.isArray(ans.multiple_choice) && (
        <div style={{ marginTop: 8 }}>
          <div style={subTitle}>Trắc nghiệm</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(cfg.multiple_choice.answers || []).map((key: string, i: number) => {
              const got = ans.multiple_choice[i] || '—';
              const ok = String(got).toUpperCase() === String(key).toUpperCase();
              return <span key={i} style={cell(ok)}>Câu {i + 1}: {got}{ok ? '' : ` (đáp án ${key})`}</span>;
            })}
          </div>
        </div>
      )}

      {enabled('true_false') && Array.isArray(ans.true_false) && (
        <div style={{ marginTop: 8 }}>
          <div style={subTitle}>Đúng / Sai</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(cfg.true_false.answers || []).map((keyRow: string[], i: number) => (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: 50 }}>Câu {i + 1}</span>
                {TF.map((sub, j) => {
                  const got = (ans.true_false[i] || [])[j];
                  const ok = got && String(got).toUpperCase()[0] === String(keyRow[j]).toUpperCase()[0];
                  return <span key={sub} style={cell(!!ok)}>{sub}) {conv(got)}{ok ? '' : ` (${conv(keyRow[j])})`}</span>;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {enabled('short_answer') && Array.isArray(ans.short_answer) && (
        <div style={{ marginTop: 8 }}>
          <div style={subTitle}>Trả lời ngắn</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(cfg.short_answer.answers || []).map((key: string, i: number) => {
              const got = ans.short_answer[i] || '—';
              return (
                <div key={i} style={{ fontSize: '0.8rem' }}>
                  <strong>Câu {i + 1}:</strong> HS trả lời "<span style={{ color: '#1565C0' }}>{got}</span>" — đáp án: "<span style={{ color: '#2E7D32' }}>{key}</span>"
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const subTitle: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#6A1B9A', margin: '2px 0 4px' };
