// Giáo viên cấu hình 4 kiểu nộp bài + nhập đáp án (key) khi tạo/sửa bài tập.
import {
  PartsConfig, PartKey, MC_OPTIONS, TF_SUB_LABELS, resizeAnswers, resizePoints,
  computeMaxScore, partTotalPoints, DEFAULT_POINTS,
} from '../lib/homeworkParts';

interface Props {
  value: PartsConfig;
  onChange: (next: PartsConfig) => void;
}

const PART_TITLES: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm (chọn A/B/C/D)',
  true_false: 'Đúng / Sai (mỗi câu 4 ý a–d)',
  short_answer: 'Trả lời ngắn (điền đáp án)',
  essay: 'Tự luận (nộp ảnh, AI chấm theo file đáp án)',
};

export default function PartsEditor({ value, onChange }: Props) {
  const setPart = (key: PartKey, patch: any) => {
    onChange({ ...value, [key]: { ...(value as any)[key], ...patch } } as PartsConfig);
  };

  const toggle = (key: PartKey) => {
    if (key === 'essay') { setPart(key, { enabled: !value.essay.enabled }); return; }
    const cur = (value as any)[key];
    if (cur.enabled) setPart(key, { enabled: false });
    else {
      const count = cur.count > 0 ? cur.count : 1;
      setPart(key, { enabled: true, count, answers: resizeAnswers(key, cur.answers, count), points: resizePoints(key, cur.points, count) });
    }
  };

  const setCount = (key: PartKey, raw: string) => {
    const count = Math.max(0, Math.min(50, parseInt(raw) || 0));
    setPart(key, { count, answers: resizeAnswers(key, (value as any)[key].answers, count), points: resizePoints(key, (value as any)[key].points, count) });
  };

  const setAnswer = (key: PartKey, idx: number, val: any) => {
    const answers = [...(value as any)[key].answers];
    answers[idx] = val;
    setPart(key, { answers });
  };

  // Cập nhật điểm 1 câu (chuỗi → số; rỗng để tạm 0). Cho phép số thập phân với dấu , hoặc .
  const setPoint = (key: PartKey, idx: number, raw: string) => {
    const num = parseFloat(String(raw).replace(',', '.'));
    const points = [...(value as any)[key].points];
    points[idx] = isFinite(num) && num >= 0 ? num : 0;
    setPart(key, { points });
  };

  const setEssayPoints = (raw: string) => {
    const num = parseFloat(String(raw).replace(',', '.'));
    setPart('essay', { points: isFinite(num) && num >= 0 ? num : 0 });
  };

  // Ô nhập điểm cho 1 câu
  const pointInput = (key: PartKey, i: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
      <input className="input" type="number" min={0} step={0.05} style={{ width: 72, padding: '4px 6px', textAlign: 'right' }}
        value={(value as any)[key].points[i] ?? DEFAULT_POINTS[key]} onChange={(e) => setPoint(key, i, e.target.value)} />
      <span style={{ fontSize: '0.78rem', color: '#888' }}>đ</span>
    </div>
  );

  // Hàm render (gọi như hàm, KHÔNG dùng dạng <Component/>) để input không bị remount/mất focus khi gõ.
  const partToggle = (pk: PartKey) => {
    const enabled = pk === 'essay' ? value.essay.enabled : (value as any)[pk].enabled;
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={() => toggle(pk)} style={{ width: 17, height: 17, accentColor: '#C62828' }} />
        {PART_TITLES[pk]}
      </label>
    );
  };

  const countRow = (pk: PartKey) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
      <span style={{ fontSize: '0.8rem', color: '#666' }}>Số câu:</span>
      <input className="input" type="number" min={1} max={50} style={{ width: 80, padding: '4px 8px' }}
        value={(value as any)[pk].count} onChange={(e) => setCount(pk, e.target.value)} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Trắc nghiệm */}
      <div style={partBox}>
        {partToggle('multiple_choice')}
        {value.multiple_choice.enabled && (
          <div style={{ marginTop: 8 }}>
            {countRow('multiple_choice')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {value.multiple_choice.answers.map((ans: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={qLabel}>Câu {i + 1}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {MC_OPTIONS.map((opt) => (
                      <button key={opt} type="button" onClick={() => setAnswer('multiple_choice', i, opt)}
                        style={chip(ans === opt)}>{opt}</button>
                    ))}
                  </div>
                  {pointInput('multiple_choice', i)}
                </div>
              ))}
            </div>
            {partTotalRow('multiple_choice')}
          </div>
        )}
      </div>

      {/* Đúng / Sai */}
      <div style={partBox}>
        {partToggle('true_false')}
        {value.true_false.enabled && (
          <div style={{ marginTop: 8 }}>
            {countRow('true_false')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {value.true_false.answers.map((row: string[], i: number) => (
                <div key={i} style={{ background: '#FAFAFA', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={qLabel}>Câu {i + 1}</span>
                    {pointInput('true_false', i)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {TF_SUB_LABELS.map((sub, j) => {
                      const v = (row || [])[j] || 'T';
                      return (
                        <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#555' }}>{sub})</span>
                          <button type="button" onClick={() => { const r = [...(row || ['T', 'T', 'T', 'T'])]; r[j] = 'T'; setAnswer('true_false', i, r); }} style={chip(v === 'T', '#2E7D32')}>Đúng</button>
                          <button type="button" onClick={() => { const r = [...(row || ['T', 'T', 'T', 'T'])]; r[j] = 'F'; setAnswer('true_false', i, r); }} style={chip(v === 'F', '#C62828')}>Sai</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#888', marginTop: 6 }}>
              Điểm câu = điểm khi đúng cả 4 ý. Đúng 1 ý = 10%, 2 ý = 25%, 3 ý = 50%, 4 ý = 100% điểm câu (chuẩn THPT).
            </div>
            {partTotalRow('true_false')}
          </div>
        )}
      </div>

      {/* Trả lời ngắn */}
      <div style={partBox}>
        {partToggle('short_answer')}
        {value.short_answer.enabled && (
          <div style={{ marginTop: 8 }}>
            {countRow('short_answer')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {value.short_answer.answers.map((ans: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={qLabel}>Câu {i + 1}</span>
                  <input className="input" style={{ flex: 1, minWidth: 0, padding: '5px 9px' }} placeholder="Đáp án đúng (vd: 12; 1/2; x=3)"
                    value={ans} onChange={(e) => setAnswer('short_answer', i, e.target.value)} />
                  {pointInput('short_answer', i)}
                </div>
              ))}
            </div>
            {partTotalRow('short_answer')}
          </div>
        )}
      </div>

      {/* Tự luận */}
      <div style={partBox}>
        {partToggle('essay')}
        {value.essay.enabled && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: '#444', fontWeight: 600 }}>Điểm phần tự luận:</span>
              <input className="input" type="number" min={0} step={0.5} style={{ width: 90, padding: '4px 8px', textAlign: 'right' }}
                value={value.essay.points} onChange={(e) => setEssayPoints(e.target.value)} />
              <span style={{ fontSize: '0.78rem', color: '#888' }}>điểm</span>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#888' }}>
              Học sinh chụp ảnh bài làm tự luận. AI chấm trên thang điểm này dựa vào <strong>File đáp án (PDF)</strong> ở phần bên dưới.
            </div>
          </div>
        )}
      </div>

      {/* Tổng điểm */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F3E9FF', borderRadius: 10 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6A1B9A' }}>Tổng điểm tối đa (thang điểm bài)</span>
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#6A1B9A' }}>{computeMaxScore(value)} điểm</span>
      </div>
    </div>
  );

  function partTotalRow(key: PartKey) {
    const total = partTotalPoints(value, key);
    const n = (value as any)[key].count || 0;
    return (
      <div style={{ fontSize: '0.78rem', color: '#6A1B9A', fontWeight: 600, marginTop: 6, textAlign: 'right' }}>
        Tổng phần này: {Math.round(total * 100) / 100} điểm ({n} câu)
      </div>
    );
  }
}

const partBox: React.CSSProperties = { border: '1px solid #ECECEC', borderRadius: 10, padding: '10px 12px' };
const qLabel: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#1A1A2E', minWidth: 48 };

function chip(active: boolean, activeColor = '#C62828'): React.CSSProperties {
  return {
    border: `1px solid ${active ? activeColor : '#DDD'}`,
    background: active ? activeColor : 'white',
    color: active ? 'white' : '#666',
    borderRadius: 7, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', minWidth: 32,
  };
}
