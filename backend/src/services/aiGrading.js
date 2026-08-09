const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { parsePartsConfig, partEnabled, describeAnswerKey, describeStudentAnswers } = require('./homeworkParts');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.pdf':  'application/pdf',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.webp': 'image/webp',
  };
  return map[ext] || 'application/octet-stream';
}

function buildInlinePart(filePath) {
  return {
    inlineData: {
      data: fileToBase64(filePath),
      mimeType: getMimeType(filePath),
    },
  };
}

// Free tier: các model Flash "xịn" chỉ có 20 request/NGÀY mỗi model (5 req/phút),
// còn Flash Lite 3.x có tới 500 request/ngày (15 req/phút). Gemini Pro free tier = 0, không dùng được.
// Chiến lược: lần chấm ĐẦU của mỗi bài dùng Flash xịn (chính xác nhất) — 50 bài/ngày vừa khít
// tổng quota 4 model Flash (4×20=80). Các lần chấm lại dùng Flash Lite (quota 2×500=1000/ngày).
const STRONG_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  // Hết sạch quota Flash xịn thì rơi xuống Lite thay vì fail
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
const LITE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  // Lite hết quota (hiếm) thì mượn Flash xịn — đủ cả 4 model để tối đa khả năng chấm được (không dừng giữa chừng)
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
];
// Trích đáp án từ file là việc dễ (đọc bảng đáp án) → dùng Lite để dành quota Flash xịn cho chấm bài
const EXTRACT_MODELS = LITE_MODELS;

// Giới hạn đầu ra để tiết kiệm token + ép trả JSON thuần (không markdown)
const GENERATION_CONFIG = {
  temperature: 0.7,
  maxOutputTokens: 4096,
  responseMimeType: 'application/json',
};

// Đọc đáp án từ file: cần CHÍNH XÁC, ổn định → nhiệt độ thấp.
const EXTRACT_CONFIG = {
  temperature: 0.1,
  maxOutputTokens: 2048,
  responseMimeType: 'application/json',
};

async function gradeSubmission(answerFilePath, submissionFilePaths, maxScore = 10, gradingNote = '', opts = {}) {
  const { partsConfig = null, scope = null, studentAnswers = null } = opts;
  const cfg = parsePartsConfig(partsConfig);

  // Phần nào AI cần chấm (scope do hàng đợi truyền vào). Bài cũ (không cfg) → chấm toàn bộ kiểu tự luận.
  const gradePart = (k) => {
    if (!cfg) return false;
    if (k === 'essay') return scope ? !!scope.essay : partEnabled(cfg, 'essay');
    return partEnabled(cfg, k) && (scope ? !!scope[k] : true);
  };
  const objOnly = { multiple_choice: gradePart('multiple_choice'), true_false: gradePart('true_false'), short_answer: gradePart('short_answer') };
  const gradeObjective = objOnly.multiple_choice || objOnly.true_false || objOnly.short_answer;
  const gradeEssay = cfg ? gradePart('essay') : true; // bài cũ: chấm toàn bộ như tự luận

  // File đáp án tự luận (PDF) — có thể không có nếu chỉ chấm phần objective
  const hasAnswerFile = !!answerFilePath && fs.existsSync(answerFilePath);

  // Đáp án học sinh đã điền ở giao diện (cho phần khách quan) — dùng thay cho việc dò trong ảnh.
  const studentText = (cfg && gradeObjective && studentAnswers) ? describeStudentAnswers(cfg, studentAnswers) : '';

  // Học sinh có thể nộp nhiều file (nhiều ảnh / PDF) — chuẩn hóa về mảng
  const subPaths = (Array.isArray(submissionFilePaths) ? submissionFilePaths : [submissionFilePaths]).filter(Boolean);
  for (const p of subPaths) {
    if (!fs.existsSync(p)) throw new Error('File bài nộp không tồn tại');
  }
  // Phải có ÍT NHẤT một nguồn bài làm: ảnh, hoặc đáp án học sinh đã điền sẵn.
  if (subPaths.length === 0 && !studentText) throw new Error('Không có bài làm để AI chấm');

  const noteBlock = gradingNote && gradingNote.trim()
    ? `\nHƯỚNG DẪN CHẤM CỦA GIÁO VIÊN (BẮT BUỘC tuân theo — chấm phần nào, chấm theo kiểu gì, chia điểm thế nào):\n"""${gradingNote.trim()}"""\n`
    : '';

  // Khối đáp án (key) của các phần objective AI phụ trách
  const answerKeyBlock = gradeObjective
    ? `\nĐÁP ÁN CÁC PHẦN (key chính thức — dùng để so chấm):\n${describeAnswerKey(cfg, objOnly)}\n`
    : '';

  // Mô tả các tài liệu đính kèm theo thứ tự để AI biết đâu là đáp án, đâu là bài làm
  const docLines = [];
  if (hasAnswerFile) docLines.push('- Tài liệu đầu tiên (PDF): ĐÁP ÁN chính thức — dùng để lấy đáp án đúng cho MỌI phần (kể cả các câu khách quan chưa có đáp án sẵn).');
  if (subPaths.length > 1) docLines.push(`- ${subPaths.length} tài liệu tiếp theo: BÀI LÀM CỦA HỌC SINH (nhiều ảnh/trang) — xem xét TẤT CẢ như một bài liền mạch.`);
  else if (subPaths.length === 1) docLines.push('- Tài liệu tiếp theo: BÀI LÀM CỦA HỌC SINH (ảnh/PDF).');
  else docLines.push('- (Không có ảnh bài làm — học sinh điền đáp án khách quan ở giao diện, xem mục ĐÁP ÁN HỌC SINH ĐÃ ĐIỀN.)');
  const docBlock = `\nCÁC TÀI LIỆU ĐÍNH KÈM:\n${docLines.join('\n')}\n`;

  // Đáp án học sinh đã điền sẵn ở giao diện (nếu có) — dùng làm bài làm cho phần khách quan.
  const studentBlock = studentText
    ? `\nĐÁP ÁN HỌC SINH ĐÃ ĐIỀN Ở GIAO DIỆN (dùng CHÍNH cái này làm bài làm của học sinh cho các phần khách quan, KHÔNG cần dò trong ảnh):\n${studentText}\n`
    : '';

  // Phạm vi chấm (chỉ những phần được giao)
  const scopeNames = [];
  if (objOnly.multiple_choice) scopeNames.push('TRẮC NGHIỆM');
  if (objOnly.true_false) scopeNames.push('ĐÚNG/SAI');
  if (objOnly.short_answer) scopeNames.push('TRẢ LỜI NGẮN');
  if (gradeEssay) scopeNames.push('TỰ LUẬN');
  const scopeBlock = cfg
    ? `\nCHỈ CHẤM CÁC PHẦN SAU (các phần khác đã được hệ thống tự chấm, BỎ QUA): ${scopeNames.join(', ') || '(không có)'}\n`
    : '';

  // Luật chấm riêng cho từng phần được giao
  const ruleLines = [];
  if (objOnly.multiple_choice) ruleLines.push('- TRẮC NGHIỆM: mỗi câu so với đáp án đúng (A/B/C/D); đúng hay sai theo từng câu, không có điểm một phần.');
  if (objOnly.true_false) {
    const tfEven = !!(cfg && cfg.true_false && cfg.true_false.tfMode === 'even');
    ruleLines.push(tfEven
      ? '- ĐÚNG/SAI (mỗi câu 4 ý a,b,c,d): chia ĐỀU — mỗi ý đúng = 25% điểm câu (đúng 1 ý = 0.25, 2 ý = 0.5, 3 ý = 0.75, cả 4 ý = 1.0; TỈ LỆ trên điểm câu, quy đổi sang điểm thực tế).'
      : '- ĐÚNG/SAI (mỗi câu 4 ý a,b,c,d): chấm theo CHUẨN THPT — trong 1 câu: đúng 1 ý = 0.1, đúng 2 ý = 0.25, đúng 3 ý = 0.5, đúng cả 4 ý = 1.0 (TỈ LỆ trên điểm câu, quy đổi sang điểm thực tế).');
  }
  if (objOnly.short_answer) ruleLines.push('- TRẢ LỜI NGẮN: khớp LINH HOẠT, chấp nhận biến thể tương đương về mặt toán học (vd "1/2" = "0,5" = "0.5"; "2" = "2,0"; bỏ qua khác biệt khoảng trắng, dấu phẩy/chấm thập phân, hoa/thường).');
  if (gradeEssay) ruleLines.push(
    '- TỰ LUẬN: chấm CHẶT CHẼ như giáo viên chấm thi thật — đọc và đối chiếu TỪNG BƯỚC lập luận với đáp án, KHÔNG chỉ nhìn đáp số cuối. Chỉ chấm "correct" khi lập luận đủ căn cứ (nêu rõ định lý/công thức/tính chất áp dụng) VÀ kết quả đúng; không suy diễn có lợi cho học sinh khi chữ viết khó đọc hay lập luận mập mờ — trường hợp đó chấm "partial"/"wrong" chứ không mặc định "correct".\n'
    + '  • BÀI ĐẠI (tự luận KHÔNG phải hình học — đại số, giải tích, xác suất...): có lời giải/các bước tính toán ĐẦY ĐỦ + đáp số đúng → điểm tối đa. Nếu học sinh CHỈ ghi đáp số/kết quả cuối, KHÔNG trình bày lời giải/các bước tính → dù đáp số đúng cũng CHỈ được TỐI ĐA 50% điểm câu đó.\n'
    + '  • BÀI HÌNH (có vẽ hình, chứng minh, tính toán hình học — tam giác, đường tròn, tọa độ, thể tích...): điểm tối đa CHỈ khi có ĐỦ CẢ 3: hình vẽ minh họa + lời giải/chứng minh chi tiết (giả thiết/kết luận, dựng hình phụ nếu có, định lý/tính chất/công thức dùng ở từng bước) + đáp số đúng. THIẾU HÌNH VẼ minh họa (dù lời giải và đáp số đúng) → CHỈ được TỐI ĐA 50% điểm câu. CHỈ có hình vẽ, KHÔNG có lời giải/chứng minh → CHỈ được TỐI ĐA 25% (1/4) điểm câu. Không có cả hình vẽ lẫn lời giải (chỉ ghi đáp số) → chấm như trường hợp nặng nhất, CHỈ được TỐI ĐA 25% điểm câu dù đáp số đúng. Khi vi phạm nhiều lỗi cùng lúc, lấy mức trần THẤP NHẤT trong các mức trên (không cộng dồn, không vượt mức trần).'
  );
  const objectiveRules = ruleLines.length ? `\nLUẬT CHẤM TỪNG PHẦN:\n${ruleLines.join('\n')}\n` : '';

  // Hướng dẫn AI lấy bài làm khách quan từ đâu: từ đáp án đã điền sẵn, hay tự dò trong ảnh.
  const imageScanNote = gradeObjective
    ? (studentText
        ? '\nLƯU Ý: Học sinh ĐÃ điền sẵn đáp án các phần khách quan ở giao diện (mục ĐÁP ÁN HỌC SINH ĐÃ ĐIỀN). Hãy dùng CHÍNH các đáp án đó để chấm. Câu nào chưa có đáp án đúng sẵn (ghi "ĐỌC TỪ FILE ĐÁP ÁN") thì TÌM đáp án đúng trong FILE ĐÁP ÁN (PDF) rồi so chấm.\n'
        : '\nLƯU Ý: Học sinh KHÔNG điền đáp án ở giao diện cho các phần khách quan cần chấm — hãy TỰ DÒ bài làm các phần đó ngay trong ẢNH rồi so với đáp án để chấm. Câu nào chưa có đáp án đúng sẵn thì TÌM trong FILE ĐÁP ÁN.\n')
    : '';

  // promptBody: toàn bộ ngữ cảnh + luật chấm (dùng chung cho cả 3 lần). jsonFormatBlock tách riêng
  // để có thể chèn thêm reviewBlock (kết quả 2 lần đầu) vào GIỮA cho lần chấm thứ 3.
  const promptBody = `Bạn là giáo viên chấm bài. Hãy chấm điểm bài làm của học sinh dựa trên đáp án, trên thang ${maxScore} điểm.
${docBlock}${scopeBlock}${answerKeyBlock}${studentBlock}${noteBlock}${objectiveRules}${imageScanNote}
CÁCH ĐỌC BÀI LÀM (ảnh, nếu có):
- Thứ tự các ảnh bài làm gửi lên CÓ THỂ KHÔNG đúng thứ tự thực tế (học sinh chụp có thể lộn trang). Hãy tự xác định thứ tự đọc hợp lý dựa vào số thứ tự câu/trang và tính liên tục của lời giải — KHÔNG mặc định thứ tự ảnh là đúng.
- Bài làm là ảnh chụp/scan CHỮ VIẾT TAY, có thể xấu, mờ, nghiêng, tẩy xóa. Đọc thật kỹ TỪNG dòng; dựa vào ngữ cảnh toán học để nhận diện đúng con số, ký hiệu, biến, phân số, lũy thừa, dấu.
- Nếu chữ quá khó đọc, hãy suy luận hợp lý nhất thay vì bỏ qua; chỉ coi là sai khi thực sự sai.

CÁCH CHẤM CHUNG:
- CHỈ chấm các phần được giao ở trên. Tổng điểm các phần = điểm trả về, KHÔNG vượt quá ${maxScore}.
- Phân chia điểm giữa các phần: theo HƯỚNG DẪN của giáo viên ở trên; nếu không nói rõ, hãy chia hợp lý.
- Chấm NGHIÊM TÚC, CHẶT CHẼ như giáo viên chấm thi thật: không ưu ái, không "du di" cho điểm khi không chắc chắn hay chữ viết khó đọc, không cho điểm tối đa nếu lập luận thiếu căn cứ hoặc trình bày sơ sài. Nghi ngờ đúng/sai thì đọc lại kỹ trước khi kết luận thay vì đoán có lợi cho học sinh.
- Với MỖI câu, xác định trạng thái: "correct" (đúng), "wrong" (sai), hoặc "partial" (đúng một phần) kèm giải thích NGẮN GỌN bằng tiếng Việt — nêu RÕ lý do trừ điểm nếu không cho điểm tối đa (thiếu bước nào, sai đâu, thiếu lời giải chi tiết...).
- Viết nhận xét tổng quan bằng tiếng Việt.`;

  const jsonFormatBlock = `

Trả về JSON đúng định dạng sau (chỉ JSON, không kèm chữ nào khác):
{
  "score": <số từ 0 đến ${maxScore}>,
  "feedback": "<nhận xét tổng quan>",
  "details": [
    {"question": "<tên câu, vd: TN câu 1 / Đúng-Sai câu 2 / TLN câu 1 / Tự luận câu 1>", "status": "correct|wrong|partial", "comment": "<giải thích ngắn gọn>"}
  ]
}`;

  const buildParts = (promptText) => [
    promptText,
    ...(hasAnswerFile ? [buildInlinePart(answerFilePath)] : []),
    ...subPaths.map(buildInlinePart),
  ];

  // Mô tả 1 kết quả chấm trước đó để đưa vào prompt rà soát lần 3.
  const describeResult = (label, r) => `${label} — điểm: ${r.score}/${maxScore}\nNhận xét: ${r.feedback}\nChi tiết từng câu:\n${r.details.map((d) => `  • ${d.question}: ${d.status} — ${d.comment}`).join('\n') || '  (không có)'}`;

  // ── QUY TRÌNH CHẤM 3 LẦN ─────────────────────────────────────────────
  // Lần 1: chấm ĐỘC LẬP bằng model mạnh nhất.
  // Lần 2: chấm ĐỘC LẬP thêm 1 lần nữa bằng model nhẹ hơn (không thấy kết quả lần 1).
  // Lần 3: KHÔNG chấm lại từ đầu mà RÀ SOÁT kết quả lần 1 và 2 (kèm xem lại bài làm gốc),
  //        ưu tiên nghiêng theo lần 1 khi có bất đồng, đảm bảo tuân đủ luật chấm ở trên,
  //        rồi CHỐT điểm cuối cùng chính thức trả cho học sinh. Không còn lấy max/trung bình trọng số.
  const basePrompt = promptBody + jsonFormatBlock;
  const baseParts = buildParts(basePrompt);

  let result1 = null;
  let result2 = null;
  try {
    result1 = await callModelOnce(baseParts, maxScore, STRONG_MODELS);
  } catch (err) {
    console.error(`[AI grading] lần 1 (model mạnh) lỗi: ${err.message}`);
  }
  try {
    result2 = await callModelOnce(baseParts, maxScore, LITE_MODELS);
  } catch (err) {
    console.error(`[AI grading] lần 2 (model nhẹ) lỗi: ${err.message}`);
  }

  if (!result1 && !result2) {
    throw new Error('Chấm bài thất bại (cả 2 lần chấm đầu đều lỗi)');
  }
  // Chỉ 1 trong 2 lần đầu thành công → không đủ dữ liệu để rà soát, dùng luôn kết quả đó.
  if (!result1 || !result2) {
    const only = result1 || result2;
    console.log(`[AI grading] chỉ 1/2 lần đầu thành công → dùng điểm ${only.score}, bỏ qua lần rà soát cuối`);
    return only;
  }

  const reviewBlock = `

HAI LẦN CHẤM ĐỘC LẬP ĐÃ THỰC HIỆN TRƯỚC ĐÓ (để bạn đối chiếu, KHÔNG được chép nguyên mà không tự kiểm tra lại với bài làm và luật chấm):

${describeResult('LẦN 1 (model mạnh — ƯU TIÊN hơn khi có bất đồng)', result1)}

${describeResult('LẦN 2 (model nhẹ — tham khảo thêm)', result2)}

NHIỆM VỤ CỦA BẠN — ĐÂY LÀ LẦN CHẤM THỨ 3, LÀ LẦN CHỐT ĐIỂM CHÍNH THỨC CUỐI CÙNG CỦA HỌC SINH:
- Tự mình xem lại bài làm (ảnh/PDF đính kèm) và đáp án, rà soát lại TỪNG câu theo ĐÚNG các luật chấm đã nêu ở trên (đặc biệt: bài hình phải có hình vẽ + lời giải chi tiết mới được điểm tối đa, thiếu hình/thiếu lời giải bị giới hạn trần điểm theo đúng luật; bài đại chỉ ghi đáp số không giải tối đa 50%; không du di khi không chắc chắn).
- Khi LẦN 1 và LẦN 2 đồng thuận (điểm và nhận xét từng câu khớp nhau) → giữ nguyên kết luận đó, trừ khi bạn tự phát hiện cả hai đều sai so với luật chấm.
- Khi LẦN 1 và LẦN 2 bất đồng ở câu nào → tự chấm lại câu đó dựa trên bài làm thực tế và luật chấm; ƯU TIÊN nghiêng theo LẦN 1 (model mạnh hơn) nếu cả hai cách chấm đều hợp lý và không rõ ràng bên nào sai; CHỈ chọn theo LẦN 2 khi LẦN 1 thực sự sai hoặc vi phạm luật chấm.
- Kết quả bạn trả về là điểm CHÍNH THỨC, CUỐI CÙNG gửi cho học sinh — hãy quyết đoán, nhất quán và đúng luật chấm.`;

  const reviewPrompt = promptBody + reviewBlock + jsonFormatBlock;
  const reviewParts = buildParts(reviewPrompt);

  try {
    const final = await callModelOnce(reviewParts, maxScore, LITE_MODELS);
    console.log(`[AI grading] lần 1=${result1.score}, lần 2=${result2.score} → lần 3 (rà soát, chốt điểm cuối) = ${final.score}`);
    return final;
  } catch (err) {
    console.error(`[AI grading] lần 3 (rà soát cuối) lỗi: ${err.message} → dùng kết quả lần 1 (model mạnh) làm điểm cuối`);
    return result1;
  }
}

// Lỗi có nên thử model tiếp theo không: hết quota (429), quá tải (503), hoặc model bị gỡ (404).
function isRetryableModelError(err) {
  const msg = String(err && err.message);
  return /429|quota|RESOURCE_EXHAUSTED|503|overloaded|UNAVAILABLE|404|not found/i.test(msg);
}

// Gọi AI 1 lần để chấm; tự fallback lần lượt qua danh sách models nếu dính quota/quá tải.
// Trả về { score, feedback, details } đã chuẩn hóa.
async function callModelOnce(parts, maxScore, models) {
  let lastErr;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig: GENERATION_CONFIG });
      const result = await model.generateContent(parts);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI không trả về định dạng JSON hợp lệ');
      const parsed = JSON.parse(jsonMatch[0]);
      parsed.score = Math.max(0, Math.min(maxScore, parseFloat(parsed.score) || 0));
      // Chuẩn hóa details thành mảng hợp lệ
      if (!Array.isArray(parsed.details)) parsed.details = [];
      parsed.details = parsed.details
        .filter(d => d && (d.question || d.comment))
        .map(d => ({
          question: String(d.question || '').slice(0, 100),
          status: ['correct', 'wrong', 'partial'].includes(d.status) ? d.status : 'partial',
          comment: String(d.comment || '').slice(0, 500),
        }));
      console.log(`[AI grading] chấm bằng ${modelName} → ${parsed.score} điểm`);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (!isRetryableModelError(err)) throw err;
      console.warn(`[AI grading] ${modelName} không khả dụng (${String(err.message).slice(0, 120)}) → thử model tiếp theo`);
    }
  }
  throw lastErr;
}

// ── Đọc FILE ĐÁP ÁN để trích đáp án (key) các câu objective giáo viên để trống ──────────
// cfg: parts_config đã parse. missing: { multiple_choice:[idx], true_false:[idx], short_answer:[idx] }
// Trả về { multiple_choice:['A',...], true_false:[['T','F','T','F'],...], short_answer:['12',...] }
// theo thứ tự câu 1..n (chỉ các phần có câu để trống). Lỗi → ném để nơi gọi tự xử lý.
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

  const parts = [prompt, buildInlinePart(answerFilePath)];
  let lastErr;
  for (const modelName of EXTRACT_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig: EXTRACT_CONFIG });
      const result = await model.generateContent(parts);
      const text = result.response.text().trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI không trả về JSON đáp án hợp lệ');
      const parsed = JSON.parse(m[0]);
      const out = normalizeExtractedKey(parsed, cfg);
      const cnt = (a) => (Array.isArray(a) ? a.filter((x) => x != null).length : 0);
      console.log(`[aiGrading] Trích đáp án từ file (${modelName}): TN=${cnt(out.multiple_choice)} ĐS=${cnt(out.true_false)} TLN=${cnt(out.short_answer)}`);
      return out;
    } catch (err) {
      lastErr = err;
      if (!isRetryableModelError(err)) throw err;
    }
  }
  throw lastErr;
}

// ── Tạo "quy chuẩn nhận xét" (rubric) — ĐỌC FILE ĐÁP ÁN ĐÚNG 1 LẦN khi giáo viên tạo/cập nhật đáp án
// bài tập (xem routes/homework.js). Chỉ cần 1 câu mô tả khái quát chủ đề/nội dung của đề, lưu lại
// dưới dạng text (KHÔNG hiển thị trên web) để lúc chấm tự động từng bài nộp KHÔNG cần gọi AI nữa mà
// vẫn ghép được vào mẫu nhận xét theo thang điểm (xem homeworkScoring.composeAutoFeedback).
async function generateFeedbackRubric(answerFilePath) {
  if (!answerFilePath || !fs.existsSync(answerFilePath)) return null;

  const prompt = `Đây là FILE ĐÁP ÁN (bảng đáp án hoặc bài giải đầy đủ) của một đề bài tập.
NHIỆM VỤ: đọc khái quát toàn bộ tài liệu và cho biết chủ đề/nội dung/dạng bài CHÍNH của cả đề, viết ĐÚNG 1 CÂU NGẮN GỌN (dưới 25 từ, tiếng Việt). Câu này sẽ được dùng để tự động nhắc học sinh kiểu "cần cẩn thận hơn khi làm các dạng bài về ...", nên hãy viết sao cho ghép được sau cụm đó (ví dụ: "phương trình bậc hai và định lý Vi-ét", "hình học tọa độ trong mặt phẳng").

Chỉ trả về JSON THUẦN (không kèm giải thích, không markdown): {"overview": "<câu mô tả>"}`;

  const parts = [prompt, buildInlinePart(answerFilePath)];
  let lastErr;
  for (const modelName of LITE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig: EXTRACT_CONFIG });
      const result = await model.generateContent(parts);
      const text = result.response.text().trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI không trả về JSON rubric hợp lệ');
      const parsed = JSON.parse(m[0]);
      const overview = String(parsed.overview || '').trim().slice(0, 150);
      console.log(`[aiGrading] Đã tạo quy chuẩn nhận xét (${modelName}): "${overview}"`);
      return overview ? { overview } : null;
    } catch (err) {
      lastErr = err;
      if (!isRetryableModelError(err)) throw err;
    }
  }
  throw lastErr;
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

module.exports = { gradeSubmission, extractAnswerKey, generateFeedbackRubric };
