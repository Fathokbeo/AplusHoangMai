const fs = require('fs');
const path = require('path');
const { parsePartsConfig, partEnabled, describeAnswerKey, describeStudentAnswers } = require('./homeworkParts');
const { generateJson, generateJsonMulti, isQuotaError } = require('./geminiClient');
const { preparePages, renderGradedPages } = require('./gradingPages');

// ── Chọn model ───────────────────────────────────────────────────────────────────────
// Thứ tự ưu tiên khi chấm (xoay vòng ở geminiClient.generateJson):
//   1) TẦNG MẠNH: lần lượt từng model mạnh, mỗi model thử HẾT các API key trong kho rồi mới sang model sau
//      → dùng hết model mạnh của TẤT CẢ các key trước.
//   2) TẦNG DỰ PHÒNG (yếu hơn một chút): chỉ dùng khi mọi key đã hết lượt mọi model mạnh; bài chấm bằng
//      tầng này được gắn cờ "nên xem lại" cho giáo viên.
// Không bao giờ dùng bản Lite để chấm. Ghi đè: GEMINI_GRADING_MODELS / GEMINI_FALLBACK_MODELS="m1,m2,...".
const DEFAULT_GRADING_MODELS = [
  'gemini-4-hydrogen',  // đo thực tế: chấm sát giáo viên nhất trong các model đã thử
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];
const DEFAULT_FALLBACK_MODELS = [
  'gemini-3-flash-preview', // đo thực tế: chấm rộng tay hơn giáo viên → chỉ để dự phòng
];
// Việc nhẹ (đọc bảng đáp án, tóm tắt chủ đề) → Lite trước để dành quota model mạnh cho chấm bài.
const LITE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', ...DEFAULT_GRADING_MODELS];

const envList = (name) => String(process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
function strongModels() {
  const env = envList('GEMINI_GRADING_MODELS');
  return env.length ? env : DEFAULT_GRADING_MODELS;
}
function fallbackModels() {
  const strong = strongModels();
  const env = envList('GEMINI_FALLBACK_MODELS');
  return (env.length ? env : DEFAULT_FALLBACK_MODELS).filter((m) => !strong.includes(m));
}
// Toàn bộ thứ tự dùng khi chấm: tầng mạnh trước, tầng dự phòng sau
function gradingModels() {
  return [...strongModels(), ...fallbackModels()];
}

function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  return map[ext] || 'application/octet-stream';
}

function buildInlinePart(filePath) {
  return { inlineData: { data: fileToBase64(filePath), mimeType: getMimeType(filePath) } };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── JSON schema kết quả chấm (Gemini responseSchema). Thứ tự trường = thứ tự AI viết: chép lại bài làm
//    → đối chiếu, nêu lý do → mới cho điểm (điểm là KẾT LUẬN của lý do, không phải đoán trước).
const ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING', description: 'Tên ý đầy đủ, vd "Tự luận Bài I.1", "Tự luận Bài 3b", "TN câu 2"' },
    short: { type: 'STRING', description: 'Nhãn rất ngắn để vẽ lên ảnh, vd "I.1", "3b", "TN2"' },
    max_points: { type: 'NUMBER', description: 'Điểm tối đa của ý theo biểu điểm' },
    page: { type: 'INTEGER', description: 'Số TRANG (1..N) chứa bài làm ý này; 0 nếu học sinh không làm' },
    box_2d: { type: 'ARRAY', items: { type: 'INTEGER' }, description: '[ymin, xmin, ymax, xmax] thang 0-1000 bao phần bài làm ý này trên trang' },
    student_work: { type: 'STRING', description: 'Chép lại ngắn gọn học sinh đã viết gì cho ý này (hoặc "không làm")' },
    attempted: { type: 'BOOLEAN', description: 'Học sinh CÓ viết bài làm cho ý này trong ảnh không' },
    reason: { type: 'STRING', description: 'Đối chiếu với đáp án/biểu điểm: đúng ở đâu, sai ở bước nào, vì sao trừ điểm' },
    errors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          page: { type: 'INTEGER' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
          note: { type: 'STRING', description: 'Ghi chú lỗi rất ngắn (≤ 12 từ)' },
        },
        required: ['page', 'box_2d', 'note'],
        propertyOrdering: ['page', 'box_2d', 'note'],
      },
    },
    error_types: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: ['TT', 'TB', 'DD', 'KT', 'KL'] },
      description: 'Loại lỗi của ý (rỗng nếu đúng hết / không làm): TT tính toán sai; TB trình bày, lập luận chưa chặt chẽ, thiếu bước, thiếu điều kiện; DD đọc đề sai/sót yêu cầu; KT sai kiến thức, sai công thức/phương pháp; KL thiếu/sai kết luận, kí hiệu, đơn vị',
    },
    status: { type: 'STRING', enum: ['correct', 'partial', 'wrong', 'missing'] },
    points: { type: 'NUMBER', description: 'Điểm đạt được của ý (0..max_points)' },
  },
  required: ['question', 'short', 'max_points', 'page', 'student_work', 'attempted', 'reason', 'status', 'points'],
  propertyOrdering: ['question', 'short', 'max_points', 'page', 'box_2d', 'student_work', 'attempted', 'reason', 'errors', 'error_types', 'status', 'points'],
};

const GRADE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    page_order: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Thứ tự đọc ĐÚNG của các trang (hoán vị của 1..N)' },
    rubric_total: { type: 'NUMBER', description: 'Tổng điểm GỐC theo biểu điểm của tất cả các ý trong phạm vi chấm' },
    items: { type: 'ARRAY', items: ITEM_SCHEMA },
    feedback: { type: 'STRING' },
  },
  required: ['page_order', 'rubric_total', 'items', 'feedback'],
  propertyOrdering: ['page_order', 'rubric_total', 'items', 'feedback'],
};

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    comparison: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          run1_points: { type: 'NUMBER' },
          run2_points: { type: 'NUMBER' },
          analysis: { type: 'STRING', description: 'Xem lại bài làm thật: lần nào chấm sai, sai vì sao (đọc nhầm chữ, bỏ sót bước, áp sai biểu điểm...)' },
          final_points: { type: 'NUMBER' },
        },
        required: ['question', 'run1_points', 'run2_points', 'analysis', 'final_points'],
        propertyOrdering: ['question', 'run1_points', 'run2_points', 'analysis', 'final_points'],
      },
    },
    page_order: GRADE_SCHEMA.properties.page_order,
    rubric_total: GRADE_SCHEMA.properties.rubric_total,
    items: GRADE_SCHEMA.properties.items,
    feedback: { type: 'STRING' },
  },
  required: ['comparison', 'page_order', 'rubric_total', 'items', 'feedback'],
  propertyOrdering: ['comparison', 'page_order', 'rubric_total', 'items', 'feedback'],
};

// Chuẩn hóa kết quả AI → items hợp lệ + điểm do SERVER cộng (không tin con số tổng AI tự ghi).
//  - ý học sinh không làm (attempted=false / status missing / không có trang) → 0 điểm
//  - điểm từng ý bị kẹp trong [0, max_points]
//  - max_points là điểm GỐC theo biểu điểm; quy đổi về thang = tổng điểm đạt × thang / tổng biểu điểm.
//    Mẫu số lấy max(tổng max_points các ý, rubric_total AI khai): AI bỏ sót ý nào thì ý đó tính 0 điểm,
//    KHÔNG phóng điểm lên (chính lỗi "làm 2/4 ý vẫn đủ điểm" trước đây).
//  - điểm cuối làm tròn theo bước SCORE_STEP (mặc định 0,25 như giáo viên chấm tay).
function normalizeResult(raw, maxScore, pageCount) {
  const validPage = (p) => Number.isInteger(Number(p)) && Number(p) >= 1 && Number(p) <= pageCount;
  const items = (Array.isArray(raw && raw.items) ? raw.items : [])
    .filter((it) => it && (it.question || it.short))
    .map((it) => {
      const max = Math.max(0, Number(it.max_points) || 0);
      let pts = Math.max(0, Math.min(max, Number(it.points) || 0));
      let status = ['correct', 'partial', 'wrong', 'missing'].includes(it.status) ? it.status : 'partial';
      const attempted = it.attempted !== false && status !== 'missing';
      if (!attempted) { pts = 0; status = 'missing'; }
      else if (max > 0 && pts >= max - 1e-9) status = 'correct';
      else if (pts <= 1e-9) status = 'wrong';
      else status = 'partial';
      const page = validPage(it.page) ? Number(it.page) : 0;
      return {
        question: String(it.question || it.short).slice(0, 100),
        short: String(it.short || it.question || '').slice(0, 14),
        max_points: round2(max),
        points: round2(pts),
        status,
        attempted,
        student_work: String(it.student_work || '').slice(0, 400),
        reason: String(it.reason || '').slice(0, 700),
        page,
        box_2d: Array.isArray(it.box_2d) ? it.box_2d.slice(0, 4).map(Number) : null,
        errors: (Array.isArray(it.errors) ? it.errors : [])
          .filter((e) => e && validPage(e.page) && Array.isArray(e.box_2d))
          .slice(0, 6)
          .map((e) => ({ page: Number(e.page), box_2d: e.box_2d.slice(0, 4).map(Number), note: String(e.note || '').slice(0, 90) })),
        error_types: status === 'correct' || status === 'missing' ? []
          : [...new Set((Array.isArray(it.error_types) ? it.error_types : []).filter((t) => ['TT', 'TB', 'DD', 'KT', 'KL'].includes(t)))],
      };
    });

  const sumMax = round2(items.reduce((s, it) => s + it.max_points, 0));
  const sumPts = round2(items.reduce((s, it) => s + it.points, 0));
  const rubricTotal = Number(raw && raw.rubric_total) > 0 ? Number(raw.rubric_total) : 0;
  const denom = Math.max(sumMax, rubricTotal || maxScore);
  let score = maxScore > 0 && denom > 0 ? (sumPts * maxScore) / denom : sumPts;
  const step = Number(process.env.SCORE_STEP) > 0 ? Number(process.env.SCORE_STEP) : 0.25;
  score = round2(Math.round(score / step + 1e-9) * step);
  score = Math.max(0, Math.min(maxScore, score));

  // Thứ tự trang: phải là hoán vị của 1..N, thiếu trang nào thì nối vào cuối
  let order = (Array.isArray(raw && raw.page_order) ? raw.page_order : []).map(Number).filter((p) => validPage(p));
  order = [...new Set(order)];
  for (let i = 1; i <= pageCount; i++) if (!order.includes(i)) order.push(i);

  return { score, sumMax, sumPts, rubricTotal, items, page_order: order, feedback: String((raw && raw.feedback) || '').slice(0, 1500) };
}

// items → grading_details lưu DB (giữ các trường cũ question/status/comment để giao diện + nhận xét
// tự động hiện có vẫn chạy; thêm points/max_points).
function toDetails(items) {
  return items.map((it) => {
    const errTxt = it.errors.length
      ? ' Lỗi: ' + it.errors.map((e, i) => `(${e.mark_no || i + 1}) ${e.note}`).join('; ') + '.'
      : '';
    const base = it.status === 'missing' ? `Không làm ý này. ${it.reason}`.trim() : it.reason;
    return {
      question: it.question,
      status: it.status === 'missing' ? 'wrong' : it.status,
      comment: `${base}${errTxt}`.slice(0, 900),
      points: it.points,
      max_points: it.max_points,
      label: it.short,              // nhãn ngắn của ý ("5a", "I.2") — để gom nhận xét "câu 5abc, 6b"
      error_types: it.error_types,  // TT/TB/DD/KT/KL — để nhận xét theo loại lỗi
    };
  });
}

// Schema khi chấm GỘP nhiều học sinh trong 1 lượt gọi: mảng students, mỗi phần tử là kết quả của 1 học sinh.
const groupOf = (schema) => ({
  type: 'OBJECT',
  properties: {
    students: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { student: { type: 'INTEGER', description: 'Số thứ tự học sinh (S1 → 1, S2 → 2, ...)' }, ...schema.properties },
        required: ['student', ...schema.required],
        propertyOrdering: ['student', ...schema.propertyOrdering],
      },
    },
  },
  required: ['students'],
});
const GROUP_GRADE_SCHEMA = groupOf(GRADE_SCHEMA);
const GROUP_REVIEW_SCHEMA = groupOf(REVIEW_SCHEMA);

// ── CHẤM 1 NHÓM HỌC SINH (cùng bài tập, cùng phạm vi chấm) ──────────────────────────────────
// Nhiều học sinh trong CÙNG một lượt gọi → tiết kiệm lượt gọi/ngày (giới hạn RPD của Google); đề + đáp án
// chỉ gửi 1 lần cho cả nhóm. Quy trình mỗi học sinh giữ nguyên: 2 lần chấm độc lập (2 lượt gọi cho CẢ nhóm),
// server so từng ý, học sinh nào có ý lệch thì gom chung 1 lượt đối chiếu, rồi vẽ ảnh chấm cho từng em.
// common: { answerFilePath, maxScore, gradingNote, partsConfig, scope, models, realtime, lessons, hints }
// students: [{ files, studentAnswers, annotatePrefix }]
// Trả về mảng cùng thứ tự: { ok: true, score, feedback, details, marks, raw } | { ok: false, error }.
async function gradeGroup(common, students) {
  const { answerFilePath, maxScore = 10, gradingNote = '', partsConfig = null, scope = null, models: modelsOverride = null, realtime = false, lessons = [], hints = [] } = common;
  const cfg = parsePartsConfig(partsConfig);

  // Phần nào AI cần chấm (scope do hàng đợi truyền vào). Bài cũ (không cfg) → chấm toàn bộ kiểu tự luận.
  const gradePart = (k) => {
    if (!cfg) return false;
    if (k === 'essay') return scope ? !!scope.essay : partEnabled(cfg, 'essay');
    return partEnabled(cfg, k) && (scope ? !!scope[k] : true);
  };
  const objOnly = { multiple_choice: gradePart('multiple_choice'), true_false: gradePart('true_false'), short_answer: gradePart('short_answer') };
  const gradeObjective = objOnly.multiple_choice || objOnly.true_false || objOnly.short_answer;
  const gradeEssay = cfg ? gradePart('essay') : true;
  const hasAnswerFile = !!answerFilePath && fs.existsSync(answerFilePath);

  // ── Chuẩn bị bài làm từng học sinh (lỗi riêng em nào thì chỉ em đó lỗi) ──────────────────
  const results = students.map(() => null);
  const S = []; // { i (vị trí trong students), idx (S1, S2...), pages, N, studentBlock, annotatePrefix }
  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    try {
      const studentText = (cfg && gradeObjective && st.studentAnswers) ? describeStudentAnswers(cfg, st.studentAnswers) : '';
      const subPaths = (Array.isArray(st.files) ? st.files : [st.files]).filter(Boolean);
      for (const p of subPaths) if (!fs.existsSync(p)) throw new Error('File bài nộp không tồn tại');
      if (subPaths.length === 0 && !studentText) throw new Error('Không có bài làm để AI chấm');
      const pages = subPaths.length ? await preparePages(subPaths) : [];
      S.push({
        i, idx: S.length + 1, pages, N: pages.length, annotatePrefix: st.annotatePrefix || null,
        studentBlock: studentText ? `\nĐÁP ÁN HỌC SINH ĐÃ ĐIỀN Ở GIAO DIỆN (dùng CHÍNH cái này làm bài làm phần khách quan, không dò trong ảnh):\n${studentText}\n` : '',
      });
    } catch (error) {
      results[i] = { ok: false, error };
    }
  }
  if (!S.length) return results;
  const multi = S.length > 1;

  const hasNote = !!(gradingNote && gradingNote.trim());
  const noteBlock = hasNote
    ? `\nGHI CHÚ CHẤM CỦA GIÁO VIÊN (ƯU TIÊN CAO NHẤT):\n"""${gradingNote.trim()}"""\n`
    : '';
  const answerKeyBlock = gradeObjective
    ? `\nĐÁP ÁN CÁC PHẦN KHÁCH QUAN (key chính thức):\n${describeAnswerKey(cfg, objOnly)}\n`
    : '';
  // Sổ kinh nghiệm: giáo viên đã sửa điểm AI trước đây và ghi lý do → AI phải tuân theo khi gặp tình huống tương tự
  const hasLessons = Array.isArray(lessons) && lessons.length > 0;
  const lessonBlock = hasLessons
    ? `\nKINH NGHIỆM CHẤM CỦA TRUNG TÂM (giáo viên đã sửa điểm AI ở các lần trước — gặp tình huống tương tự thì BẮT BUỘC chấm theo):\n${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';
  // Lỗi nhiều em đã mắc ở chính đề này → chỉ để soi kỹ, không được mặc định trừ điểm
  const hintBlock = Array.isArray(hints) && hints.length
    ? `\nLỖI NHIỀU HỌC SINH ĐÃ MẮC Ở ĐỀ NÀY (CHỈ để soi thật kỹ đúng các chỗ này; TUYỆT ĐỐI không mặc định trừ điểm — chỉ trừ khi THẤY ĐÚNG lỗi đó trong bài của học sinh đang chấm):\n${hints.map((h) => `- ${h}`).join('\n')}\n`
    : '';

  const scopeNames = [];
  if (objOnly.multiple_choice) scopeNames.push('TRẮC NGHIỆM');
  if (objOnly.true_false) scopeNames.push('ĐÚNG/SAI');
  if (objOnly.short_answer) scopeNames.push('TRẢ LỜI NGẮN');
  if (gradeEssay) scopeNames.push('TỰ LUẬN');
  const scopeBlock = cfg
    ? `\nCHỈ CHẤM CÁC PHẦN SAU (phần khác hệ thống đã tự chấm, BỎ QUA, không liệt kê): ${scopeNames.join(', ') || '(không có)'}\n`
    : '';

  const ruleLines = [];
  if (objOnly.multiple_choice) ruleLines.push('- TRẮC NGHIỆM: mỗi câu là 1 ý; đúng đáp án = đủ điểm câu, sai/bỏ trống = 0.');
  if (objOnly.true_false) {
    const tfEven = !!(cfg && cfg.true_false && cfg.true_false.tfMode === 'even');
    ruleLines.push(tfEven
      ? '- ĐÚNG/SAI (mỗi câu 4 ý a,b,c,d): mỗi câu là 1 ý; mỗi ý a/b/c/d đúng = 25% điểm câu.'
      : '- ĐÚNG/SAI (mỗi câu 4 ý a,b,c,d): mỗi câu là 1 ý; chuẩn THPT — đúng 1 ý = 10%, 2 ý = 25%, 3 ý = 50%, cả 4 ý = 100% điểm câu.');
  }
  if (objOnly.short_answer) ruleLines.push('- TRẢ LỜI NGẮN: mỗi câu là 1 ý; chấp nhận dạng tương đương về toán học ("1/2" = "0,5").');
  if (gradeEssay) ruleLines.push(
    '- TỰ LUẬN: chấm như giáo viên chấm thi thật, đối chiếu TỪNG BƯỚC với đáp án và biểu điểm (không chỉ nhìn đáp số). Bước nào trong biểu điểm có điểm riêng mà học sinh làm đúng thì cho điểm bước đó; sai từ bước nào thì các bước sau phụ thuộc kết quả sai không được điểm.\n'
    + '  Khi biểu điểm KHÔNG quy định riêng thì áp dụng: • Bài đại số/giải tích/xác suất chỉ ghi đáp số, không có lời giải → tối đa 50% điểm ý. • Bài hình: thiếu hình vẽ minh họa → tối đa 50%; chỉ có hình vẽ, không có lời giải → tối đa 25%; nhiều lỗi cùng lúc lấy mức trần THẤP NHẤT.'
  );
  // Hiệu chỉnh theo đối chiếu với điểm giáo viên chấm tay: AI hay trừ những lỗi giáo viên thật không trừ.
  ruleLines.push(
    '- MỨC CHẶT MẶC ĐỊNH (chỉ khi ghi chú giáo viên không nói khác): chấm chặt nhưng ĐÚNG biểu điểm — chỉ trừ điểm khi chỉ ra được bước/yêu cầu cụ thể của biểu điểm mà học sinh làm sai hoặc thiếu.\n'
    + '  • Hình vẽ tay: KHÔNG đo độ dài/số đo trên hình; chỉ trừ khi sai QUAN HỆ (điểm nằm sai tia/sai phía, thiếu điểm, không thẳng hàng, sai trung điểm, thiếu yếu tố đề yêu cầu vẽ).\n'
    + '  • Lỗi hình thức nhỏ (đơn vị, kí hiệu, viết tắt) mà biểu điểm không có điểm riêng: CÙNG một lỗi lặp lại nhiều ý chỉ trừ MỘT lần 0,25đ cho cả bài; đáp số đúng mà chỉ sai đơn vị thì không trừ quá 0,25đ.\n'
    + '  • Điểm của ý phải KHỚP với lý do: cộng đúng các bước được cho điểm trong reason (đã nói bước nào đạt thì phải được điểm bước đó).'
  );

  // ── Prompt chia 2 phần để Gemini tự CACHE phần đầu: phần ĐẦU giống nhau cho mọi bài nộp của cùng một bài
  //    tập (luật chấm + file đáp án), phần SAU là bài làm từng học sinh + nhiệm vụ của lượt gọi.
  const intro = `Bạn là giáo viên Toán chấm bài cực kỳ cẩn thận. Chấm bài làm của học sinh trên thang ${maxScore} điểm cho phần được giao.
${scopeBlock}${answerKeyBlock}${noteBlock}${lessonBlock}${hintBlock}
LUẬT CHẤM MẶC ĐỊNH:
${ruleLines.join('\n')}

THỨ TỰ ƯU TIÊN KHI CHẤM (để các quy định không xung đột):
1. ${hasNote ? 'GHI CHÚ CHẤM CỦA GIÁO VIÊN ở trên là cao nhất: cách chia điểm từng câu/từng ý, mức trừ điểm cho từng loại lỗi, yêu cầu khoanh/chú thích... trong ghi chú LUÔN được áp dụng, kể cả khi khác biểu điểm trong file đáp án hay luật mặc định.' : '(Giáo viên không có ghi chú riêng.)'}
${hasLessons ? `2. KINH NGHIỆM CHẤM CỦA TRUNG TÂM ở trên: đứng ngay sau ghi chú chấm của bài này (mâu thuẫn thì theo ghi chú của bài này), cao hơn biểu điểm file đáp án và luật mặc định.
` : ''}${hasLessons ? '3' : '2'}. Biểu điểm / hướng dẫn chấm trong FILE ĐÁP ÁN: dùng cho mọi điều ghi chú của giáo viên không nói tới (vd điểm từng bước nhỏ bên trong 1 ý).
${hasLessons ? '4' : '3'}. Luật chấm mặc định ở trên: CHỈ dùng để lấp chỗ mà các mục trên đều không quy định.
Kết hợp: (a) điểm tối đa từng ý lấy theo mức ưu tiên cao nhất có quy định; (b) MỘT lỗi chỉ bị trừ MỘT lần — ghi chú giáo viên đã có mức trừ cho loại lỗi đó (vd "thiếu kết luận trừ 0,25đ") thì dùng đúng mức đó, KHÔNG trừ thêm theo luật mặc định cho cùng lỗi; (c) các lỗi KHÁC NHAU trong cùng 1 ý thì cộng dồn mức trừ, nhưng điểm ý không xuống dưới 0 và không vượt điểm tối đa của ý; (d) trong reason ghi rõ từng khoản trừ và căn cứ, vd "−0,25 thiếu điều kiện x ≠ 2 (theo ghi chú GV)".

CÁCH CHẤM BẮT BUỘC (để không cho điểm sai):
1. Lập DANH SÁCH TẤT CẢ CÁC Ý NHỎ NHẤT có điểm riêng theo biểu điểm (vd Bài 1 có a, b, c, d → 4 ý riêng; Bài I có 1), 2), 3) → 3 ý riêng; trắc nghiệm mỗi câu 1 ý). max_points của từng ý LẤY theo THỨ TỰ ƯU TIÊN ở trên (ghi chú giáo viên → biểu điểm file đáp án → chia hợp lý). max_points ghi đúng ĐIỂM GỐC trong biểu điểm (vd ý được 0,5đ thì ghi 0.5), KHÔNG tự quy đổi; rubric_total = tổng điểm gốc các ý trong phạm vi chấm — nếu khác thang ${maxScore} thì hệ thống tự quy đổi. Liệt kê ĐỦ mọi ý của đề trong phạm vi chấm — kể cả ý học sinh KHÔNG làm.
2. Với TỪNG ý: tìm bài làm của ý đó trong các trang ảnh, chép lại ngắn gọn (student_work). Nếu KHÔNG tìm thấy bài làm cho ý đó → attempted=false, status "missing", points = 0. TUYỆT ĐỐI không cho điểm ý mà học sinh không viết gì; không suy ra "chắc học sinh biết làm".
3. So với đáp án từng bước, ghi reason: đúng ở đâu, SAI Ở BƯỚC NÀO, sai thế nào (vd "dòng 3 tính 15/24 - 22/24 = 7/24, sai dấu, đúng là -7/24"), thiếu gì, vì sao trừ điểm. Rồi mới cho points (0..max_points).
4. Với mỗi chỗ sai, ghi vào errors: trang, box_2d bao đúng chỗ viết sai (dòng/biểu thức sai), note ngắn. Ghi error_types cho ý bị trừ điểm: TT tính toán sai; TB trình bày/lập luận chưa chặt chẽ, thiếu bước, thiếu điều kiện; DD đọc đề sai/sót yêu cầu; KT sai kiến thức/công thức/phương pháp; KL thiếu/sai kết luận, kí hiệu, đơn vị (có thể nhiều loại).
   short = nhãn ngắn theo đúng số câu/ý của đề, dạng "5a", "6b", "I.2", "TN3" (không thêm chữ "Câu").
5. page và box_2d của ý: vùng bài làm của ý đó. box_2d = [ymin, xmin, ymax, xmax] thang 0–1000 theo chiều cao/chiều rộng của CHÍNH trang đó.
6. page_order: các trang có thể bị chụp/ghép LỘN THỨ TỰ — xác định thứ tự đọc đúng dựa vào số bài/số câu và mạch lời giải.

CÁCH ĐỌC ẢNH: chữ viết tay có thể xấu, mờ, nghiêng, tẩy xóa — đọc thật kỹ từng dòng, dùng ngữ cảnh toán học để nhận đúng số, dấu, phân số, lũy thừa. Phần bị gạch xóa không tính. Bỏ qua mọi dấu chấm/điểm bằng mực đỏ của người khác nếu có trên ảnh — tự chấm độc lập. Không ưu ái, không "du di" khi không chắc: nghi ngờ thì đọc lại kỹ trước khi kết luận.
${hasAnswerFile ? '\nTài liệu đính kèm ngay sau đây là FILE ĐÁP ÁN / HƯỚNG DẪN CHẤM chính thức (lấy đáp án và biểu điểm từng ý ở đây).' : ''}`;

  const baseParts = [{ text: intro }];
  if (hasAnswerFile) baseParts.push({ text: 'FILE ĐÁP ÁN / HƯỚNG DẪN CHẤM:' }, buildInlinePart(answerFilePath));

  // Bài làm 1 học sinh. Nhóm nhiều em: mỗi em có tiêu đề "HỌC SINH Sk" và nhãn trang "Sk – TRANG j" riêng.
  const studentParts = (s) => {
    const parts = [];
    const pageLabel = (p) => (multi ? `S${s.idx} – TRANG ${p.index}` : `TRANG ${p.index}`)
      + (s.pages.length > 1 ? ` (file ${p.file}${p.filePage > 1 || /\.pdf$/i.test(p.file) ? `, trang ${p.filePage}` : ''})` : '');
    parts.push({
      text: (multi ? `\n===== HỌC SINH S${s.idx} =====` : '') + s.studentBlock
        + (s.N ? `\nBÀI LÀM CỦA ${multi ? `HỌC SINH S${s.idx}` : 'HỌC SINH'} GỒM ${s.N} TRANG ẢNH, mỗi ảnh có nhãn "${multi ? `S${s.idx} – ` : ''}TRANG k" đứng ngay trước:`
          : '\n(Không có ảnh bài làm — chỉ chấm theo đáp án học sinh đã điền.)'),
    });
    s.pages.forEach((p) => {
      parts.push({ text: `${pageLabel(p)}:` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: p.jpeg.toString('base64') } });
    });
    return parts;
  };
  const partsFor = (subset) => [...baseParts, ...subset.flatMap(studentParts)];
  const groupNote = (subset) => (multi
    ? `\nLƯỢT NÀY CÓ ${subset.length} HỌC SINH (${subset.map((s) => `S${s.idx}`).join(', ')}) LÀM CÙNG ĐỀ: chấm RIÊNG TỪNG HỌC SINH theo đúng CÁCH CHẤM BẮT BUỘC, tuyệt đối không lẫn bài làm của em này sang em khác. Trả về mảng students, mỗi phần tử có student = số thứ tự học sinh (S2 → 2); page/page_order/errors.page là số TRANG trong bài của CHÍNH học sinh đó (nhãn "S2 – TRANG 3" → page 3).`
    : '');

  const gradeTask = (variant, subset) => ({
    text: (variant === 1
      ? `NHIỆM VỤ: Chấm độc lập bài làm trên theo đúng CÁCH CHẤM BẮT BUỘC. feedback: nhận xét tổng quan ngắn bằng tiếng Việt.`
      : `NHIỆM VỤ: Chấm độc lập bài làm trên. Làm theo trình tự: (a) trước hết đọc và CHÉP LẠI toàn bộ bài làm từng ý thật chính xác vào student_work, (b) sau đó mới đối chiếu với đáp án/biểu điểm từng bước để cho điểm. Áp dụng đúng CÁCH CHẤM BẮT BUỘC. feedback: nhận xét tổng quan ngắn bằng tiếng Việt.`)
      + groupNote(subset) + ' Trả về JSON theo schema.',
  });

  const all = modelsOverride || gradingModels();
  const usage = [];
  const genOpts = { thinkingLevel: 'high', mediaResolution: 'MEDIA_RESOLUTION_HIGH', maxOutputTokens: multi ? 65536 : 32768 };
  // Batch (rẻ 50%) cho chấm nền; giáo viên bấm "chấm lại" đang chờ kết quả → gọi thường (realtime).
  const useBatch = !realtime;
  const gradeReq = (v, subset) => ({ models: all, parts: [...partsFor(subset), gradeTask(v, subset)], opts: { ...genOpts, schema: multi ? GROUP_GRADE_SCHEMA : GRADE_SCHEMA } });
  // JSON trả về → Map(idx học sinh → kết quả đã chuẩn hóa)
  const extract = (r, subset) => {
    const out = new Map();
    if (!multi) { out.set(subset[0].idx, { ...normalizeResult(r.json, maxScore, subset[0].N), model: r.model, raw: r.json }); return out; }
    (Array.isArray(r.json && r.json.students) ? r.json.students : []).forEach((x) => {
      const s = subset.find((y) => y.idx === Number(x && x.student));
      if (s && !out.has(s.idx)) out.set(s.idx, { ...normalizeResult(x, maxScore, s.N), model: r.model, raw: x });
    });
    return out;
  };

  // ── LẦN 1 + LẦN 2: chấm độc lập cả nhóm (2 lượt gọi), cùng ưu tiên model mạnh nhất ─────────────
  const run1 = new Map();
  const run2 = new Map();
  const errs = {};
  const [s1, s2] = await generateJsonMulti([gradeReq(1, S), gradeReq(2, S)], { batch: useBatch });
  [[s1, run1, 1], [s2, run2, 2]].forEach(([s, m, v]) => {
    if (s.status === 'fulfilled') {
      usage.push({ step: `run${v}`, model: s.value.model, usage: s.value.usage, students: S.length });
      extract(s.value, S).forEach((val, k) => m.set(k, val));
    } else {
      errs[v] = s.reason;
      console.error(`[AI grading] lần ${v} lỗi: ${s.reason && s.reason.message}`);
    }
  });
  // Em nào thiếu 1 lần chấm (lỗi tạm thời / AI bỏ sót em đó) → chấm bù cho đúng các em đó, 1 lượt gọi
  for (const [v, m] of [[1, run1], [2, run2]]) {
    const missing = S.filter((s) => !m.has(s.idx) && (run1.has(s.idx) || run2.has(s.idx)));
    if (!missing.length) continue;
    try {
      const r = await generateJson(all, [...partsFor(missing), gradeTask(v, missing)], gradeReq(v, missing).opts);
      usage.push({ step: `run${v}`, model: r.model, usage: r.usage, students: missing.length });
      extract(r, missing).forEach((val, k) => m.set(k, val));
    } catch (err) {
      errs[v] = err;
      console.error(`[AI grading] chấm bù lần ${v} lỗi: ${err.message}`);
    }
  }

  // ── ĐỐI CHIẾU: server so từng ý; em nào có ý LỆCH thì gom chung 1 lượt gọi đối chiếu ────────────
  const keyOf = (it) => String(it.short || it.question || '').toLowerCase().replace(/\s+/g, '').replace(/^(tựluận|tl)/, '');
  const per = new Map(); // idx → { r1, r2, keys, m1, m2, disputed, comparison, final, reviewModel, reviewSkipped }
  S.forEach((s) => {
    const r1 = run1.get(s.idx) || null;
    const r2 = run2.get(s.idx) || null;
    const p = { r1, r2, final: null, comparison: [], reviewModel: null, reviewSkipped: false, disputed: [] };
    if (r1 && r2) {
      p.m1 = new Map(r1.items.map((it) => [keyOf(it), it]));
      p.m2 = new Map(r2.items.map((it) => [keyOf(it), it]));
      p.keys = [...new Set([...p.m1.keys(), ...p.m2.keys()])];
      p.disputed = p.keys.filter((k) => {
        const a = p.m1.get(k), b = p.m2.get(k);
        return !a || !b || Math.abs(a.points - b.points) > 1e-9 || Math.abs(a.max_points - b.max_points) > 1e-9;
      });
      p.comparison = p.keys.map((k) => ({
        question: (p.m1.get(k) || p.m2.get(k)).question,
        run1_points: p.m1.has(k) ? p.m1.get(k).points : null,
        run2_points: p.m2.has(k) ? p.m2.get(k).points : null,
        final_points: null,
        analysis: p.disputed.includes(k) ? '' : 'Hai lần chấm khớp nhau.',
      }));
      if (!p.disputed.length) {
        p.reviewSkipped = true;
        p.final = r1;
        p.comparison.forEach((c) => { c.final_points = c.run1_points; });
      }
    }
    per.set(s.idx, p);
  });

  const toReview = S.filter((s) => { const p = per.get(s.idx); return p.r1 && p.r2 && p.disputed.length; });
  if (toReview.length) {
    const brief = (it) => it && ({ question: it.question, max_points: it.max_points, points: it.points, student_work: it.student_work, reason: it.reason });
    const block = (s) => {
      const p = per.get(s.idx);
      const agreed = p.keys.filter((k) => !p.disputed.includes(k)).map((k) => `${p.m1.get(k).question} (${p.m1.get(k).points}/${p.m1.get(k).max_points})`);
      return `${multi ? `HỌC SINH S${s.idx}:\n` : ''}HAI LẦN CHẤM ĐỘC LẬP ĐÃ KHỚP NHAU Ở CÁC Ý (giữ nguyên, KHÔNG cần trả về): ${agreed.join('; ') || '(không có)'}.
CÁC Ý HAI LẦN CHẤM LỆCH NHAU (cần đối chiếu):
${p.disputed.map((k) => `- ${(p.m1.get(k) || p.m2.get(k)).question}: LẦN 1 ${JSON.stringify(brief(p.m1.get(k)) || 'không liệt kê ý này')} | LẦN 2 ${JSON.stringify(brief(p.m2.get(k)) || 'không liệt kê ý này')}`).join('\n')}`;
    };
    const reviewTask = {
      text: `${toReview.map(block).join('\n\n')}

NHIỆM VỤ — ĐỐI CHIẾU VÀ CHỐT ĐIỂM CÁC Ý LỆCH${multi ? ' (làm RIÊNG cho từng học sinh ở trên)' : ''}:
1. comparison: với TỪNG ý lệch, mở lại đúng trang bài làm, đọc lại thật kỹ, đối chiếu biểu điểm và viết analysis: lần nào chấm SAI, VÌ SAO sai (đọc nhầm chữ/số, bỏ sót ý không làm, cho điểm ý học sinh không viết, áp sai biểu điểm, bỏ sót bước sai, trừ lỗi biểu điểm không có...), rồi final_points.
2. Không "chia trung bình" cho êm — điểm chốt là điểm ĐÚNG theo bài làm thật, theo THỨ TỰ ƯU TIÊN (ghi chú giáo viên trước nhất), mỗi lỗi chỉ trừ một lần, và phải KHỚP với analysis.
3. items: CHỈ trả về các ý lệch ở trên (đúng tên ý), với points = final_points, max_points là điểm gốc theo biểu điểm, reason nêu rõ lý do, errors khoanh đúng chỗ sai, page + box_2d chính xác. rubric_total = tổng điểm gốc của TẤT CẢ các ý trong phạm vi chấm. page_order: thứ tự đúng của các trang.
4. feedback: nhận xét tổng quan ngắn bằng tiếng Việt cho cả bài.${groupNote(toReview)}
Trả về JSON theo schema.`,
    };
    try {
      const [rv] = await generateJsonMulti([{ models: all, parts: [...partsFor(toReview), reviewTask], opts: { ...genOpts, schema: multi ? GROUP_REVIEW_SCHEMA : REVIEW_SCHEMA } }], { batch: useBatch });
      if (rv.status !== 'fulfilled') throw rv.reason;
      const r = rv.value;
      usage.push({ step: 'review', model: r.model, usage: r.usage, students: toReview.length });
      const reviewed = extract(r, toReview);
      toReview.forEach((s) => {
        const p = per.get(s.idx);
        const rvw = reviewed.get(s.idx);
        if (!rvw) return; // AI bỏ sót em này → xử lý như đối chiếu lỗi bên dưới
        p.reviewModel = r.model;
        const mr = new Map(rvw.items.map((it) => [keyOf(it), it]));
        // Ghép: ý khớp lấy theo lần 1; ý lệch lấy theo lần đối chiếu (AI quên trả ý nào → lấy lần chấm CHẶT hơn)
        const merged = p.keys.map((k) => {
          if (!p.disputed.includes(k)) return p.m1.get(k);
          if (mr.has(k)) return mr.get(k);
          const a = p.m1.get(k), b = p.m2.get(k);
          return !a ? b : !b ? a : (a.points <= b.points ? a : b);
        });
        p.final = normalizeResult({
          page_order: rvw.page_order.length ? rvw.page_order : p.r1.page_order,
          rubric_total: rvw.rubricTotal || p.r1.rubricTotal,
          items: merged,
          feedback: rvw.feedback || p.r1.feedback,
        }, maxScore, s.N);
        const comps = Array.isArray(rvw.raw && rvw.raw.comparison) ? rvw.raw.comparison : [];
        const cr = new Map(comps.map((c) => [keyOf({ question: c.question }), c]));
        p.comparison.forEach((c) => {
          const k = keyOf({ question: c.question });
          const it = p.final.items.find((x) => keyOf(x) === k || keyOf({ question: x.question }) === k);
          const fromAi = cr.get(k) || [...cr.values()].find((x) => keyOf({ question: x.question }) === keyOf({ short: it && it.short }));
          c.final_points = it ? it.points : c.run1_points;
          if (fromAi && fromAi.analysis) c.analysis = String(fromAi.analysis).slice(0, 600);
        });
      });
    } catch (err) {
      console.error(`[AI grading] đối chiếu lỗi: ${err.message}`);
    }
  }

  // ── Kết quả từng học sinh ───────────────────────────────────────────────────────────────────
  const fb = fallbackModels();
  const usedFallback = usage.some((u) => fb.includes(u.model));
  for (const s of S) {
    const p = per.get(s.idx);
    const { r1, r2 } = p;
    if (!r1 && !r2) {
      const e1 = errs[1], e2 = errs[2];
      const err = new Error(`Chấm bài thất bại (cả 2 lần chấm đều lỗi): ${(e1 || e2 || { message: 'AI không trả kết quả cho bài này' }).message}`);
      err.quota = !!(e1 && e2 && isQuotaError(e1) && isQuotaError(e2));
      err.retryAt = (e1 && e1.retryAt) || (e2 && e2.retryAt) || null;
      results[s.i] = { ok: false, error: err };
      continue;
    }
    // Đối chiếu lỗi / chỉ 1 lần chấm thành công: 2 lần lệch ≤ 0,25 → lấy lần 1; lệch nhiều → lấy lần CHẤM
    // CHẶT HƠN (điểm thấp hơn) và gắn cờ để giáo viên xem lại.
    let final = p.final;
    if (!final) {
      if (r1 && r2) final = Math.abs(r1.score - r2.score) <= 0.25 ? r1 : (r1.score <= r2.score ? r1 : r2);
      else final = r1 || r2;
      p.comparison.forEach((c) => { if (c.final_points == null) c.final_points = (final.items.find((x) => x.question === c.question) || {}).points ?? null; });
    }
    const spread = r1 && r2 ? round2(Math.abs(r1.score - r2.score)) : null;
    const missingItems = final.rubricTotal > 0 && final.sumMax < final.rubricTotal - 0.01;
    const reviewFailed = r1 && r2 && !p.reviewSkipped && !p.reviewModel;
    const needsTeacher = spread == null || spread > 1 || reviewFailed || missingItems || usedFallback;
    const review = {
      run1: r1 ? { score: r1.score, model: r1.model } : null,
      run2: r2 ? { score: r2.score, model: r2.model } : null,
      final: { score: final.score, model: p.reviewModel || (final === r2 ? r2.model : r1 && r1.model) },
      spread,
      skipped: p.reviewSkipped,
      needs_teacher: needsTeacher,
      note: spread == null ? 'Chỉ chấm được 1 lần (lần còn lại lỗi) — nên xem lại.'
        : reviewFailed ? 'Lần đối chiếu không chạy được — điểm lấy theo lần chấm chặt hơn.'
        : missingItems ? `AI chỉ liệt kê các ý có tổng ${final.sumMax}/${final.rubricTotal} điểm biểu điểm — phần thiếu tính 0 điểm, nên xem lại.`
        : spread > 1 ? `Hai lần chấm lệch ${spread} điểm — nên xem lại.`
        : usedFallback ? 'Mọi API key đã hết lượt model mạnh nên bài này chấm bằng model dự phòng (yếu hơn một chút) — nên xem lại.' : '',
      used_fallback: usedFallback,
      group_size: S.length, // số học sinh chấm chung 1 lượt gọi
      comparison: p.comparison,
      usage,
    };

    // Vẽ kết quả lên ảnh bài làm (đúng thứ tự trang)
    let graded = [];
    if (s.annotatePrefix && s.N) {
      try {
        graded = await renderGradedPages(s.pages, final, { prefix: s.annotatePrefix, score: final.score, maxScore });
      } catch (err) {
        console.error(`[AI grading] vẽ ảnh chấm lỗi: ${err.message}`);
      }
    }
    console.log(`[AI grading]${multi ? ` S${s.idx}/${S.length}` : ''} lần 1=${r1 ? `${r1.score} (${r1.model})` : 'lỗi'}, lần 2=${r2 ? `${r2.score} (${r2.model})` : 'lỗi'} → chốt ${final.score}/${maxScore}${p.reviewModel ? ` (đối chiếu ${p.reviewModel})` : ''}`);
    results[s.i] = {
      ok: true,
      score: final.score,
      feedback: final.feedback,
      details: toDetails(final.items),
      // items: vị trí + kết quả từng ý (không kèm lời giải) để vẽ lại ảnh chấm mà không cần gọi AI lại
      marks: {
        pages: graded,
        review,
        items: final.items.map((it) => ({ short: it.short, status: it.status, points: it.points, max_points: it.max_points, page: it.page, box_2d: it.box_2d, errors: it.errors })),
        page_order: final.page_order,
      },
      raw: { run1: r1, run2: r2, final },
    };
  }
  return results;
}

// Chấm 1 bài (giáo viên bấm "chấm lại", bài thi thử...): nhóm 1 học sinh.
async function gradeSubmission(answerFilePath, submissionFilePaths, maxScore = 10, gradingNote = '', opts = {}) {
  const { partsConfig = null, scope = null, studentAnswers = null, annotatePrefix = null, models = null, realtime = false, lessons = [], hints = [] } = opts;
  const [r] = await gradeGroup(
    { answerFilePath, maxScore, gradingNote, partsConfig, scope, models, realtime, lessons, hints },
    [{ files: submissionFilePaths, studentAnswers, annotatePrefix }],
  );
  if (!r.ok) throw r.error;
  return r;
}

// ── Đọc FILE ĐÁP ÁN để trích đáp án (key) các câu objective giáo viên để trống ──────────
// cfg: parts_config đã parse. missing: { multiple_choice:[idx], true_false:[idx], short_answer:[idx] }
// Trả về { multiple_choice:['A',...], true_false:[['T','F','T','F'],...], short_answer:['12',...] }
async function extractAnswerKey(answerFilePath, cfg, missing) {
  if (!answerFilePath || !fs.existsSync(answerFilePath)) throw new Error('Không có file đáp án để AI đọc');

  const wants = [];
  if (partEnabled(cfg, 'multiple_choice') && missing.multiple_choice && missing.multiple_choice.length) {
    wants.push(`- "multiple_choice": mảng ${cfg.multiple_choice.count} phần tử, mỗi phần tử là 1 chữ "A"/"B"/"C"/"D" — đáp án đúng của câu 1..${cfg.multiple_choice.count} (đúng thứ tự).`);
  }
  if (partEnabled(cfg, 'true_false') && missing.true_false && missing.true_false.length) {
    wants.push(`- "true_false": mảng ${cfg.true_false.count} phần tử, mỗi phần tử là mảng 4 giá trị "T"(Đúng)/"F"(Sai) cho 4 ý a,b,c,d của câu đó (đúng thứ tự câu 1..${cfg.true_false.count}).`);
  }
  if (partEnabled(cfg, 'short_answer') && missing.short_answer && missing.short_answer.length) {
    wants.push(`- "short_answer": mảng ${cfg.short_answer.count} phần tử, mỗi phần tử là đáp án ngắn (chuỗi) của câu 1..${cfg.short_answer.count} (đúng thứ tự).`);
  }
  if (wants.length === 0) return {};

  const prompt = `Đây là FILE ĐÁP ÁN (có thể là bảng đáp án, hoặc bài giải đầy đủ) của một đề kiểm tra.
Hãy ĐỌC THẬT KỸ toàn bộ tài liệu và TRÍCH ra ĐÁP ÁN ĐÚNG CUỐI CÙNG của các phần khách quan sau.
Chỉ trả về JSON THUẦN (không kèm giải thích, không markdown), gồm ĐÚNG các khóa dưới đây:
${wants.join('\n')}

Yêu cầu BẮT BUỘC:
- Đáp án có thể nằm trong bảng tô đậm, ô đáp án, dòng "Đáp án:", hoặc suy ra từ lời giải — hãy tìm cho ra.
- Giữ ĐÚNG THỨ TỰ câu: phần tử thứ 0 = câu 1, thứ 1 = câu 2, ...
- Trắc nghiệm: mỗi câu chỉ 1 chữ in hoa "A"/"B"/"C"/"D".
- Đúng/Sai: mỗi câu là mảng 4 phần tử cho ý a,b,c,d; dùng "T" nếu ý đó ĐÚNG, "F" nếu ý đó SAI.
- Trả lời ngắn: ghi đúng đáp án (số/biểu thức) như trong file.
- Câu nào THỰC SỰ không tìm thấy đáp án thì để null tại vị trí đó (đừng đoán bừa).`;

  const r = await generateJson(LITE_MODELS, [{ text: prompt }, buildInlinePart(answerFilePath)], { thinkingLevel: 'low', temperature: 0.1, maxOutputTokens: 4096 });
  const out = normalizeExtractedKey(r.json, cfg);
  const cnt = (a) => (Array.isArray(a) ? a.filter((x) => x != null).length : 0);
  console.log(`[aiGrading] Trích đáp án từ file (${r.model}): TN=${cnt(out.multiple_choice)} ĐS=${cnt(out.true_false)} TLN=${cnt(out.short_answer)}`);
  return out;
}

// ── "Quy chuẩn nhận xét" (rubric): 1 câu mô tả chủ đề của đề, tạo 1 lần khi giáo viên lưu đáp án ─────
async function generateFeedbackRubric(answerFilePath) {
  if (!answerFilePath || !fs.existsSync(answerFilePath)) return null;

  const prompt = `Đây là FILE ĐÁP ÁN (bảng đáp án hoặc bài giải đầy đủ) của một đề bài tập.
NHIỆM VỤ: đọc khái quát toàn bộ tài liệu và cho biết chủ đề/nội dung/dạng bài CHÍNH của cả đề, viết ĐÚNG 1 CÂU NGẮN GỌN (dưới 25 từ, tiếng Việt). Câu này sẽ được dùng để tự động nhắc học sinh kiểu "cần cẩn thận hơn khi làm các dạng bài về ...", nên hãy viết sao cho ghép được sau cụm đó (ví dụ: "phương trình bậc hai và định lý Vi-ét", "hình học tọa độ trong mặt phẳng").

Chỉ trả về JSON THUẦN (không kèm giải thích, không markdown): {"overview": "<câu mô tả>"}`;

  const r = await generateJson(LITE_MODELS, [{ text: prompt }, buildInlinePart(answerFilePath)], { thinkingLevel: 'low', temperature: 0.1, maxOutputTokens: 1024 });
  const overview = String((r.json && r.json.overview) || '').trim().slice(0, 150);
  console.log(`[aiGrading] Đã tạo quy chuẩn nhận xét (${r.model}): "${overview}"`);
  return overview ? { overview } : null;
}

// Chuẩn hóa kết quả AI trả về → đúng kiểu mong đợi cho từng phần.
function normalizeExtractedKey(parsed, cfg) {
  const out = {};
  if (partEnabled(cfg, 'multiple_choice') && Array.isArray(parsed.multiple_choice)) {
    out.multiple_choice = parsed.multiple_choice.map((v) => {
      const c = String(v == null ? '' : v).trim().toUpperCase().charAt(0);
      return /[ABCD]/.test(c) ? c : null;
    });
  }
  if (partEnabled(cfg, 'true_false') && Array.isArray(parsed.true_false)) {
    out.true_false = parsed.true_false.map((row) => {
      if (!Array.isArray(row)) return null;
      const r = row.slice(0, 4).map((v) => (String(v == null ? '' : v).trim().toUpperCase().startsWith('T') ? 'T' : (String(v).trim().toUpperCase().startsWith('F') ? 'F' : null)));
      return r.length === 4 && r.every((x) => x) ? r : null;
    });
  }
  if (partEnabled(cfg, 'short_answer') && Array.isArray(parsed.short_answer)) {
    out.short_answer = parsed.short_answer.map((v) => (v == null ? null : String(v).trim()));
  }
  return out;
}

module.exports = { gradeSubmission, gradeGroup, extractAnswerKey, generateFeedbackRubric, normalizeResult, gradingModels, strongModels, fallbackModels };
