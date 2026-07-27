// Giáo viên cấu hình 4 kiểu nộp bài + nhập đáp án (key) khi tạo/sửa bài tập.
// Đáp án để TRỐNG nghĩa là: AI tự đọc từ File đáp án (PDF) khi chấm.
// Trả lời ngắn có thêm "Ghi chú cho học sinh cách điền" (vd: làm tròn 2 chữ số) — hiện cho HỌC SINH
// khi làm bài, không liên quan chấm bài. Còn "Ghi chú cho AI chấm" ở khối Tự luận là hướng dẫn cho AI
// (chấm phần nào, chia điểm thế nào) — Trắc nghiệm/Đúng-Sai/Trả lời ngắn tự chấm theo đáp án nên
// không cần ghi chú loại này.
import { Bot } from 'lucide-react';
import {
  type PartsConfig, type PartKey, type TfMode, MC_OPTIONS, TF_SUB_LABELS,
  resizeAnswers, resizeNotes, uniformPoints, pointPerOf, keyIsSet,
  computeMaxScore, partTotalPoints, tfModeOf, tfLadderOf,
} from '../lib/homeworkParts';

interface Props {
  value: PartsConfig;
  onChange: (next: PartsConfig) => void;
  gradingNote: string;
  onGradingNoteChange: (next: string) => void;
}

const PART_TITLES: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm (chọn A/B/C/D)',
  true_false: 'Đúng / Sai (mỗi câu 4 ý a–d, kiểu đề THPT)',
  short_answer: 'Trả lời ngắn (điền đáp án)',
  essay: 'Tự luận (nộp ảnh, AI chấm theo file đáp án)',
};

export default function PartsEditor({ value, onChange, gradingNote, onGradingNoteChange }: Props) {
  const setPart = (key: PartKey, patch: any) => {
    onChange({ ...value, [key]: { ...(value as any)[key], ...patch } } as PartsConfig);
  };

  const toggle = (key: PartKey) => {
    if (key === 'essay') { setPart(key, { enabled: !value.essay.enabled }); return; }
    const cur = (value as any)[key];
    if (cur.enabled) setPart(key, { enabled: false });
    else {
      const count = cur.count > 0 ? cur.count : 1;
      const per = pointPerOf(key, cur.points);
      setPart(key, {
        enabled: true, count,
        answers: resizeAnswers(key, cur.answers, count),
        points: uniformPoints(per, count),
        ...(key === 'short_answer' ? { notes: resizeNotes(cur.notes, count) } : {}),
      });
    }
  };

  const setCount = (key: PartKey, raw: string) => {
    const count = Math.max(0, Math.min(50, parseInt(raw) || 0));
    const per = pointPerOf(key, (value as any)[key].points);
    setPart(key, {
      count,
      answers: resizeAnswers(key, (value as any)[key].answers, count),
      points: uniformPoints(per, count),
      ...(key === 'short_answer' ? { notes: resizeNotes((value as any)[key].notes, count) } : {}),
    });
  };

  // Một ô "điểm mỗi câu" áp cho cả phần
  const setPointPer = (key: PartKey, raw: string) => {
    const num = parseFloat(String(raw).replace(',', '.'));
    const per = isFinite(num) && num >= 0 ? num : 0;
    setPart(key, { points: uniformPoints(per, (value as any)[key].count) });
  };

  const setAnswer = (key: PartKey, idx: number, val: any) => {
    const answers = [...(value as any)[key].answers];
    answers[idx] = val;
    setPart(key, { answers });
  };

  const setNote = (idx: number, val: string) => {
    const notes = [...((value.short_answer.notes as string[]) || [])];
    notes[idx] = val;
    setPart('short_answer', { notes });
  };

  const setEssayPoints = (raw: string) => {
    const num = parseFloat(String(raw).replace(',', '.'));
    setPart('essay', { points: isFinite(num) && num >= 0 ? num : 0 });
  };

  // Chọn cách chia điểm phần Đúng/Sai (chuẩn THPT theo bậc, hoặc chia đều mỗi ý)
  const setTfMode = (mode: TfMode) => setPart('true_false', { tfMode: mode });

  // Hàng "Số câu + Điểm mỗi câu" của một phần
  const countPointRow = (pk: PartKey) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 12px', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>Số câu:</span>
        <input className="input" type="number" min={1} max={50} style={{ width: 78, padding: '4px 8px' }}
          value={(value as any)[pk].count} onChange={(e) => setCount(pk, e.target.value)} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>Điểm mỗi câu:</span>
        <input className="input" type="number" min={0} step={0.05} style={{ width: 78, padding: '4px 8px', textAlign: 'right' }}
          value={pointPerOf(pk, (value as any)[pk].points)} onChange={(e) => setPointPer(pk, e.target.value)} />
        <span style={{ fontSize: '0.78rem', color: '#888' }}>đ</span>
      </label>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Trắc nghiệm */}
      <div style={partBox}>
        {partToggle('multiple_choice')}
        {value.multiple_choice.enabled && (
          <div style={{ marginTop: 8 }}>
            {countPointRow('multiple_choice')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {value.multiple_choice.answers.map((ans: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={qLabel}>Câu {i + 1}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {MC_OPTIONS.map((opt) => (
                      <button key={opt} type="button"
                        onClick={() => setAnswer('multiple_choice', i, ans === opt ? '' : opt)}
                        style={chip(ans === opt)}>{opt}</button>
                    ))}
                  </div>
                  {!ans && <span style={unsetHint}>để trống → AI đọc file</span>}
                </div>
              ))}
            </div>
            {keyHint('multiple_choice')}
            {partTotalRow('multiple_choice')}
          </div>
        )}
      </div>

      {/* Đúng / Sai — bảng kiểu đề thi THPT (câu xếp ngang, ý a–d xếp dọc) */}
      <div style={partBox}>
        {partToggle('true_false')}
        {value.true_false.enabled && (
          <div style={{ marginTop: 8 }}>
            {countPointRow('true_false')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {value.true_false.answers.map((row: string[], i: number) => (
                <div key={i} style={tfCard}>
                  <div style={tfCardHead}>Câu {i + 1}</div>
                  <div style={tfGridHead}>
                    <span />
                    <span style={tfColHead('#2E7D32')}>Đúng</span>
                    <span style={tfColHead('#C62828')}>Sai</span>
                  </div>
                  {TF_SUB_LABELS.map((sub, j) => {
                    const v = (row || [])[j] || '';
                    const set = (val: string) => { const r = [...(row || ['', '', '', ''])]; r[j] = r[j] === val ? '' : val; setAnswer('true_false', i, r); };
                    return (
                      <div key={sub} style={tfGridRow}>
                        <span style={tfSub}>{sub})</span>
                        <span style={tfCell} onClick={() => set('T')}>{radio(v === 'T', '#2E7D32')}</span>
                        <span style={tfCell} onClick={() => set('F')}>{radio(v === 'F', '#C62828')}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {tfModeRow()}
            {keyHint('true_false')}
            {partTotalRow('true_false')}
          </div>
        )}
      </div>

      {/* Trả lời ngắn */}
      <div style={partBox}>
        {partToggle('short_answer')}
        {value.short_answer.enabled && (
          <div style={{ marginTop: 8 }}>
            {countPointRow('short_answer')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {value.short_answer.answers.map((ans: string, i: number) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={qLabel}>Câu {i + 1}</span>
                    <input className="input" style={{ flex: 1, minWidth: 0, padding: '5px 9px' }} placeholder="Đáp án đúng (để trống → AI đọc file). Vd: 12; 1/2; x=3"
                      value={ans} onChange={(e) => setAnswer('short_answer', i, e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...qLabel, visibility: 'hidden' }} aria-hidden="true">Câu {i + 1}</span>
                    <input className="input" style={{ flex: 1, minWidth: 0, padding: '4px 9px', fontSize: '0.82rem', background: '#FFFDF5' }}
                      placeholder="Ghi chú cho học sinh cách điền (vd: làm tròn 2 chữ số; ghi dạng a/b)"
                      value={(value.short_answer.notes as string[])?.[i] || ''} onChange={(e) => setNote(i, e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            {keyHint('short_answer')}
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
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#444', display: 'block', marginBottom: 6 }}>
                Ghi chú cho AI chấm (tùy chọn)
              </label>
              <textarea className="input" rows={3}
                placeholder="vd: Câu 1 (2đ) chấm chặt từng bước lập luận; câu 2 (2đ) chỉ cần đúng kết quả cuối. Trừ 0,5đ nếu thiếu đơn vị."
                value={gradingNote} onChange={(e) => onGradingNoteChange(e.target.value)} />
              <div style={{ fontSize: '0.74rem', color: '#888', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bot size={12} /> AI sẽ đọc và chấm đúng theo hướng dẫn này (chia điểm từng câu, cách chấm...). Học sinh không nhìn thấy ghi chú này.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tổng điểm thô */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F3E9FF', borderRadius: 10 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6A1B9A' }}>Tổng điểm tất cả các câu</span>
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#6A1B9A' }}>{computeMaxScore(value)} điểm</span>
      </div>
    </div>
  );

  function partTotalRow(key: PartKey) {
    const total = partTotalPoints(value, key);
    const n = (value as any)[key].count || 0;
    return (
      <div style={{ fontSize: '0.78rem', color: '#6A1B9A', fontWeight: 600, marginTop: 8, textAlign: 'right' }}>
        Tổng phần này: {Math.round(total * 100) / 100} điểm ({n} câu)
      </div>
    );
  }

  // Chọn cách chia điểm phần Đúng/Sai + xem trước số điểm thực tế theo "điểm mỗi câu".
  function tfModeRow() {
    const mode = tfModeOf(value.true_false.tfMode);
    const per = pointPerOf('true_false', value.true_false.points);
    const r = (n: number) => Math.round(n * 100) / 100;
    const example = (m: TfMode) => {
      const l = tfLadderOf(m);
      return `1 ý ${r(per * l[1])}đ · 2 ý ${r(per * l[2])}đ · 3 ý ${r(per * l[3])}đ · 4 ý ${r(per * l[4])}đ`;
    };
    const opts: { key: TfMode; title: string }[] = [
      { key: 'thpt', title: 'Chuẩn THPT (theo bậc)' },
      { key: 'even', title: 'Chia đều mỗi ý' },
    ];
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#444', marginBottom: 6 }}>Cách chia điểm khi đúng một phần:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map((o) => {
            const active = mode === o.key;
            return (
              <button key={o.key} type="button" onClick={() => setTfMode(o.key)}
                style={{
                  textAlign: 'left', flex: '1 1 220px', minWidth: 200, cursor: 'pointer',
                  border: `1.5px solid ${active ? '#C62828' : '#DDD'}`, background: active ? '#FFF4F4' : 'white',
                  borderRadius: 9, padding: '8px 10px',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {radio(active, '#C62828')}
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1A2E' }}>{o.title}</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#777', marginTop: 5 }}>{example(o.key)}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Nhắc: nếu để trống đáp án thì cần có File đáp án (PDF) để AI đọc.
  function keyHint(key: PartKey) {
    const p = (value as any)[key];
    const some = (p.answers || []).slice(0, p.count).some((a: any) => !keyIsSet(key, a));
    if (!some) return null;
    return (
      <div style={{ fontSize: '0.74rem', color: '#B26A00', background: '#FFF8E1', borderRadius: 6, padding: '5px 8px', marginTop: 8 }}>
        Có câu chưa đặt đáp án → khi chấm, AI sẽ tự đọc đáp án các câu đó từ <strong>File đáp án (PDF)</strong>. Hãy nhớ tải file đáp án bên dưới.
      </div>
    );
  }
}

const partBox: React.CSSProperties = { border: '1px solid #ECECEC', borderRadius: 10, padding: '10px 12px' };
const qLabel: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#1A1A2E', minWidth: 48 };
const unsetHint: React.CSSProperties = { fontSize: '0.72rem', color: '#B26A00', fontStyle: 'italic', marginLeft: 4 };

// Thẻ 1 câu Đúng/Sai (kiểu THPT)
const tfCard: React.CSSProperties = { border: '1px solid #E0E0E0', borderRadius: 8, padding: '8px 10px', background: '#FAFAFA', minWidth: 150 };
const tfCardHead: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 800, color: '#1A1A2E', textAlign: 'center', marginBottom: 6 };
const tfGridHead: React.CSSProperties = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr', alignItems: 'center', marginBottom: 2 };
const tfGridRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr', alignItems: 'center', padding: '2px 0' };
const tfSub: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#555' };
const tfCell: React.CSSProperties = { display: 'flex', justifyContent: 'center', cursor: 'pointer' };
function tfColHead(color: string): React.CSSProperties {
  return { fontSize: '0.72rem', fontWeight: 700, color, textAlign: 'center' };
}

function chip(active: boolean, activeColor = '#C62828'): React.CSSProperties {
  return {
    border: `1px solid ${active ? activeColor : '#DDD'}`,
    background: active ? activeColor : 'white',
    color: active ? 'white' : '#666',
    borderRadius: 7, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', minWidth: 32,
  };
}

// Ô tròn (radio) — đặc khi được chọn
function radio(active: boolean, color: string, disabled = false): React.ReactNode {
  return (
    <span style={{
      width: 19, height: 19, borderRadius: '50%', border: `2px solid ${active ? color : '#BBB'}`,
      background: active ? color : 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: active ? `inset 0 0 0 2px white` : 'none', opacity: disabled ? 0.5 : 1,
    }} />
  );
}
