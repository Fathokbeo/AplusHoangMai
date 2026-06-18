const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { parsePartsConfig, partEnabled, describeAnswerKey } = require('./homeworkParts');

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

// Thứ tự ưu tiên model: flash trước (rẻ, có free tier), pro làm dự phòng
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'];

// Giới hạn đầu ra để tiết kiệm token + ép trả JSON thuần (không markdown)
const GENERATION_CONFIG = {
  temperature: 0.7,
  maxOutputTokens: 4096,
  responseMimeType: 'application/json',
};

async function gradeSubmission(answerFilePath, submissionFilePaths, maxScore = 10, gradingNote = '', attempts = 3, opts = {}) {
  const { partsConfig = null, scope = null } = opts;
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

  // Học sinh có thể nộp nhiều file (nhiều ảnh / PDF) — chuẩn hóa về mảng
  const subPaths = (Array.isArray(submissionFilePaths) ? submissionFilePaths : [submissionFilePaths]).filter(Boolean);
  for (const p of subPaths) {
    if (!fs.existsSync(p)) throw new Error('File bài nộp không tồn tại');
  }
  if (subPaths.length === 0) throw new Error('Không có ảnh bài làm để AI chấm');

  const noteBlock = gradingNote && gradingNote.trim()
    ? `\nHƯỚNG DẪN CHẤM CỦA GIÁO VIÊN (BẮT BUỘC tuân theo — chấm phần nào, chấm theo kiểu gì, chia điểm thế nào):\n"""${gradingNote.trim()}"""\n`
    : '';

  // Khối đáp án (key) của các phần objective AI phụ trách
  const answerKeyBlock = gradeObjective
    ? `\nĐÁP ÁN CÁC PHẦN (key chính thức — dùng để so chấm):\n${describeAnswerKey(cfg, objOnly)}\n`
    : '';

  // Mô tả các tài liệu đính kèm theo thứ tự để AI biết đâu là đáp án, đâu là bài làm
  const docLines = [];
  if (hasAnswerFile) docLines.push('- Tài liệu đầu tiên (PDF): ĐÁP ÁN phần tự luận.');
  if (subPaths.length > 1) docLines.push(`- ${subPaths.length} tài liệu tiếp theo: BÀI LÀM CỦA HỌC SINH (nhiều ảnh/trang) — xem xét TẤT CẢ như một bài liền mạch.`);
  else docLines.push('- Tài liệu tiếp theo: BÀI LÀM CỦA HỌC SINH (ảnh/PDF).');
  const docBlock = `\nCÁC TÀI LIỆU ĐÍNH KÈM:\n${docLines.join('\n')}\n`;

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
  if (objOnly.true_false) ruleLines.push('- ĐÚNG/SAI (mỗi câu 4 ý a,b,c,d): chấm theo CHUẨN THPT — trong 1 câu: đúng 1 ý = 0.1, đúng 2 ý = 0.25, đúng 3 ý = 0.5, đúng cả 4 ý = 1.0 (TỈ LỆ trên điểm câu, quy đổi sang điểm thực tế).');
  if (objOnly.short_answer) ruleLines.push('- TRẢ LỜI NGẮN: khớp LINH HOẠT, chấp nhận biến thể tương đương về mặt toán học (vd "1/2" = "0,5" = "0.5"; "2" = "2,0"; bỏ qua khác biệt khoảng trắng, dấu phẩy/chấm thập phân, hoa/thường).');
  if (gradeEssay) ruleLines.push('- TỰ LUẬN: chấm như bài tự luận, so kết quả cuối cùng và các bước lập luận chính với đáp án; cho điểm một phần khi đúng một phần.');
  const objectiveRules = ruleLines.length ? `\nLUẬT CHẤM TỪNG PHẦN:\n${ruleLines.join('\n')}\n` : '';

  // Khi AI chấm phần objective: học sinh không điền giao diện → phải tự dò trong ảnh
  const imageScanNote = gradeObjective
    ? '\nLƯU Ý: Học sinh KHÔNG điền đáp án ở giao diện cho các phần khách quan cần chấm — hãy TỰ DÒ bài làm các phần đó ngay trong ẢNH rồi so với đáp án để chấm.\n'
    : '';

  const prompt = `Bạn là giáo viên chấm bài. Hãy chấm điểm bài làm của học sinh dựa trên đáp án, trên thang ${maxScore} điểm.
${docBlock}${scopeBlock}${answerKeyBlock}${noteBlock}${objectiveRules}${imageScanNote}
CÁCH ĐỌC BÀI LÀM (ảnh, nếu có):
- Thứ tự các ảnh bài làm gửi lên CÓ THỂ KHÔNG đúng thứ tự thực tế (học sinh chụp có thể lộn trang). Hãy tự xác định thứ tự đọc hợp lý dựa vào số thứ tự câu/trang và tính liên tục của lời giải — KHÔNG mặc định thứ tự ảnh là đúng.
- Bài làm là ảnh chụp/scan CHỮ VIẾT TAY, có thể xấu, mờ, nghiêng, tẩy xóa. Đọc thật kỹ TỪNG dòng; dựa vào ngữ cảnh toán học để nhận diện đúng con số, ký hiệu, biến, phân số, lũy thừa, dấu.
- Nếu chữ quá khó đọc, hãy suy luận hợp lý nhất thay vì bỏ qua; chỉ coi là sai khi thực sự sai.

CÁCH CHẤM CHUNG:
- CHỈ chấm các phần được giao ở trên. Tổng điểm các phần = điểm trả về, KHÔNG vượt quá ${maxScore}.
- Phân chia điểm giữa các phần: theo HƯỚNG DẪN của giáo viên ở trên; nếu không nói rõ, hãy chia hợp lý.
- Với MỖI câu, xác định trạng thái: "correct" (đúng), "wrong" (sai), hoặc "partial" (đúng một phần) kèm giải thích NGẮN GỌN bằng tiếng Việt.
- Viết nhận xét tổng quan bằng tiếng Việt.

Trả về JSON đúng định dạng sau (chỉ JSON, không kèm chữ nào khác):
{
  "score": <số từ 0 đến ${maxScore}>,
  "feedback": "<nhận xét tổng quan>",
  "details": [
    {"question": "<tên câu, vd: TN câu 1 / Đúng-Sai câu 2 / TLN câu 1 / Tự luận câu 1>", "status": "correct|wrong|partial", "comment": "<giải thích ngắn gọn>"}
  ]
}`;

  const parts = [
    prompt,
    ...(hasAnswerFile ? [buildInlinePart(answerFilePath)] : []),
    ...subPaths.map(buildInlinePart),
  ];

  // Chấm nhiều lần (mặc định 3) rồi LẤY KẾT QUẢ CÓ ĐIỂM CAO NHẤT.
  // Chạy TUẦN TỰ (không song song) để: tránh lỗi quota 429 do bắn nhiều request cùng lúc,
  // và để Gemini tái dùng phần dữ liệu giống nhau ở các lần sau (tiết kiệm token).
  const n = Math.max(1, attempts);
  const results = [];
  let lastErr;
  for (let i = 0; i < n; i++) {
    try {
      results.push(await callModelOnce(parts, maxScore));
    } catch (err) {
      lastErr = err;
      console.error(`[AI grading] lần ${i + 1}/${n} lỗi: ${err.message}`);
    }
  }
  if (results.length === 0) {
    throw lastErr || new Error('Chấm bài thất bại');
  }
  results.sort((a, b) => b.score - a.score);
  console.log(`[AI grading] ${results.length}/${n} lần thành công, điểm: [${results.map(r => r.score).join(', ')}] → lấy cao nhất ${results[0].score}`);
  return results[0];
}

// Gọi AI 1 lần để chấm; tự fallback sang model khác nếu dính quota (429).
// Trả về { score, feedback, details } đã chuẩn hóa.
async function callModelOnce(parts, maxScore) {
  let lastErr;
  for (const modelName of MODELS) {
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
      return parsed;
    } catch (err) {
      lastErr = err;
      // Nếu lỗi quota (429) thì thử model tiếp theo, lỗi khác thì dừng
      if (!String(err.message).includes('429') && !String(err.message).includes('quota')) throw err;
    }
  }
  throw lastErr;
}

module.exports = { gradeSubmission };
