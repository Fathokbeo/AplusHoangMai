// Test CHẤM ĐIỂM TỰ ĐỘNG (deterministic) — không cần server, chạy: node test-scoring.js
const { scoreStructured, computeMaxScore, saMatch, partMax } = require('./src/services/homeworkScoring');

let pass = 0, fail = 0; const out = [];
const approx = (a, b) => Math.abs(a - b) < 1e-9;
const eq = (name, got, exp) => {
  const ok = typeof exp === 'number' ? approx(got, exp) : got === exp;
  ok ? (pass++, out.push(`  ✅ ${name} = ${got}`)) : (fail++, out.push(`  ❌ ${name} → got ${got}, expect ${exp}`));
};

console.log('\n═══ TEST CHẤM ĐIỂM TỰ ĐỘNG ═══\n');

// ── 1. Trắc nghiệm: mặc định 0.25đ/câu ───────────────────────────────
{
  const cfg = { multiple_choice: { enabled: true, count: 4, answers: ['A', 'B', 'C', 'D'], points: [0.25, 0.25, 0.25, 0.25] } };
  eq('Max trắc nghiệm 4 câu', partMax(require('./src/services/homeworkParts').parsePartsConfig(cfg), 'multiple_choice'), 1);
  const r = scoreStructured(cfg, { multiple_choice: ['A', 'B', 'X', 'D'] }); // 3 đúng
  eq('TN 3/4 đúng × 0.25', r.score, 0.75);
  eq('TN có 4 chi tiết', r.details.length, 4);
}

// ── 2. Đúng/Sai theo chuẩn THPT (điểm câu = 1.0) ─────────────────────
{
  const cfg = { true_false: { enabled: true, count: 4, answers: [
    ['T', 'F', 'T', 'F'], ['T', 'F', 'T', 'F'], ['T', 'F', 'T', 'F'], ['T', 'F', 'T', 'F'],
  ], points: [1, 1, 1, 1] } };
  // Câu1: đúng 1 ý → 0.1; Câu2: đúng 2 ý → 0.25; Câu3: đúng 3 ý → 0.5; Câu4: đúng 4 ý → 1.0
  const stud = { true_false: [
    ['T', 'T', 'F', 'T'], // đúng a → 1 ý
    ['T', 'F', 'F', 'T'], // đúng a,b → 2 ý
    ['T', 'F', 'T', 'T'], // đúng a,b,c → 3 ý
    ['T', 'F', 'T', 'F'], // đúng cả 4
  ] };
  const r = scoreStructured(cfg, stud);
  eq('ĐS tổng (0.1+0.25+0.5+1.0)', r.score, 1.85);
  eq('ĐS câu1 = 0.1', Number(r.details[0].comment.match(/\+([\d.]+)đ/)[1]), 0.1);
  eq('ĐS câu2 = 0.25', Number(r.details[1].comment.match(/\+([\d.]+)đ/)[1]), 0.25);
  eq('ĐS câu3 = 0.5', Number(r.details[2].comment.match(/\+([\d.]+)đ/)[1]), 0.5);
  eq('ĐS câu4 = 1.0', Number(r.details[3].comment.match(/\+([\d.]+)đ/)[1]), 1);
  eq('ĐS câu4 status correct', r.details[3].status, 'correct');
  eq('ĐS câu1 status partial', r.details[0].status, 'partial');
}

// ── 3. Trả lời ngắn: 0.5đ/câu + khớp linh hoạt ──────────────────────
{
  const cfg = { short_answer: { enabled: true, count: 3, answers: ['1/2', '2', '12'], points: [0.5, 0.5, 0.5] } };
  const r = scoreStructured(cfg, { short_answer: ['0,5', '2.0', '13'] }); // câu1,2 đúng (tương đương), câu3 sai
  eq('TLN 2 đúng × 0.5', r.score, 1);
  eq('TLN câu1 "0,5"="1/2" đúng', r.details[0].status, 'correct');
  eq('TLN câu2 "2.0"="2" đúng', r.details[1].status, 'correct');
  eq('TLN câu3 "13"≠"12" sai', r.details[2].status, 'wrong');
}

// ── 4. Khớp linh hoạt saMatch ───────────────────────────────────────
eq('saMatch 1/2 = 0,5', saMatch('1/2', '0,5'), true);
eq('saMatch 0.5 = 1/2', saMatch('0.5', '1/2'), true);
eq('saMatch 2 = 2,0', saMatch('2', '2,0'), true);
eq('saMatch " 12 " = 12', saMatch(' 12 ', '12'), true);
eq('saMatch ABC = abc', saMatch('ABC', 'abc'), true);
eq('saMatch 3 ≠ 4', saMatch('3', '4'), false);
eq('saMatch rỗng', saMatch('', '5'), false);

// ── 5. computeMaxScore tổng hợp ─────────────────────────────────────
{
  const cfg = {
    multiple_choice: { enabled: true, count: 4, answers: ['A', 'A', 'A', 'A'], points: [0.25, 0.25, 0.25, 0.25] }, // 1.0
    true_false: { enabled: true, count: 2, answers: [['T', 'T', 'T', 'T'], ['T', 'T', 'T', 'T']], points: [1, 1] }, // 2.0
    short_answer: { enabled: true, count: 2, answers: ['1', '2'], points: [0.5, 0.5] }, // 1.0
    essay: { enabled: true, points: 6 }, // 6.0
  };
  eq('Tổng điểm tối đa (1+2+1+6)', computeMaxScore(cfg), 10);
}

// ── 6. Phần chưa điền → đưa vào pendingAi (để AI chấm từ ảnh) ────────
{
  const cfg = {
    multiple_choice: { enabled: true, count: 2, answers: ['A', 'B'], points: [0.25, 0.25] },
    essay: { enabled: true, points: 5 },
  };
  const r = scoreStructured(cfg, {}); // học sinh không điền gì
  eq('Chưa điền TN → pendingAi', r.pendingAi.includes('multiple_choice'), true);
  eq('Chưa điền → điểm tự động 0', r.score, 0);
}

// ── 7. Điểm tùy chỉnh mỗi câu (override mặc định) ───────────────────
{
  const cfg = { multiple_choice: { enabled: true, count: 2, answers: ['A', 'B'], points: [0.5, 1] } };
  const r = scoreStructured(cfg, { multiple_choice: ['A', 'B'] });
  eq('TN điểm tùy chỉnh 0.5 + 1', r.score, 1.5);
}

console.log(out.join('\n'));
console.log(`\n═══ ${pass + fail} test | ✅ ${pass} PASS | ❌ ${fail} FAIL ═══\n`);
process.exit(fail > 0 ? 1 : 0);
