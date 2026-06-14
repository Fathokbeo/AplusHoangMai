const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

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

async function gradeSubmission(answerFilePath, submissionFilePaths, maxScore = 10, gradingNote = '', attempts = 3) {
  if (!fs.existsSync(answerFilePath))   throw new Error('File đáp án không tồn tại');
  // Học sinh có thể nộp nhiều file (nhiều ảnh / PDF) — chuẩn hóa về mảng
  const subPaths = (Array.isArray(submissionFilePaths) ? submissionFilePaths : [submissionFilePaths]).filter(Boolean);
  if (subPaths.length === 0) throw new Error('Không có file bài nộp');
  for (const p of subPaths) {
    if (!fs.existsSync(p)) throw new Error('File bài nộp không tồn tại');
  }

  const noteBlock = gradingNote && gradingNote.trim()
    ? `\nHƯỚNG DẪN CHẤM CỦA GIÁO VIÊN (BẮT BUỘC tuân theo — chấm phần nào, chấm theo kiểu gì):\n"""${gradingNote.trim()}"""\n`
    : '';

  const subDesc = subPaths.length > 1
    ? `- Các tài liệu tiếp theo (${subPaths.length} tệp): BÀI LÀM CỦA HỌC SINH — gồm nhiều ảnh/trang, hãy xem xét TẤT CẢ như một bài làm liền mạch.`
    : `- Tài liệu thứ hai: BÀI LÀM CỦA HỌC SINH`;

  const prompt = `Bạn là giáo viên chấm bài thi tự luận. Hãy chấm điểm bài làm của học sinh dựa trên đáp án.

- Tài liệu thứ nhất: ĐÁP ÁN
${subDesc}
${noteBlock}
CÁCH ĐỌC BÀI LÀM (rất quan trọng):
- Bài làm là ảnh chụp/scan CHỮ VIẾT TAY, có thể xấu, mờ, nghiêng, tẩy xóa. Hãy đọc thật kỹ TỪNG dòng.
- Dựa vào ngữ cảnh toán học để nhận diện đúng con số, ký hiệu, biến, phân số, lũy thừa, dấu.
- Với MỖI câu tự luận, xác định KẾT QUẢ / ĐÁP SỐ CUỐI CÙNG mà học sinh đưa ra (thường nằm ở cuối lời giải, sau dấu "=", sau chữ "Vậy", "KL", "Đáp số", hoặc được gạch chân/khoanh tròn).
- Nếu chữ quá khó đọc, hãy suy luận hợp lý nhất thay vì bỏ qua; chỉ coi là sai khi thực sự sai.

CÁCH CHẤM:
- So sánh TỪNG câu/bài trong bài làm với đáp án, dựa trên kết quả cuối cùng VÀ các bước lập luận chính.
- Với MỖI câu, xác định trạng thái: "correct" (đúng), "wrong" (sai), hoặc "partial" (đúng một phần) và giải thích NGẮN GỌN bằng tiếng Việt vì sao.
- Tính điểm hợp lý, công bằng trên thang ${maxScore} điểm.
- Viết nhận xét tổng quan bằng tiếng Việt.

Trả về JSON đúng định dạng sau (chỉ JSON, không kèm chữ nào khác):
{
  "score": <số từ 0 đến ${maxScore}>,
  "feedback": "<nhận xét tổng quan>",
  "details": [
    {"question": "<tên câu, vd: Câu 1>", "status": "correct|wrong|partial", "comment": "<giải thích ngắn gọn vì sao đúng/sai>"}
  ]
}`;

  const parts = [
    prompt,
    buildInlinePart(answerFilePath),
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
