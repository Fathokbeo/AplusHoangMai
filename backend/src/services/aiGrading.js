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

// Thứ tự ưu tiên model: flash trước (có free tier), pro làm dự phòng
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'];

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

  const prompt = `Bạn là giáo viên chấm bài. Hãy chấm điểm bài làm của học sinh dựa trên đáp án.

- Tài liệu thứ nhất: ĐÁP ÁN
${subDesc}
${noteBlock}
Yêu cầu:
- So sánh TỪNG câu/bài trong bài làm với đáp án.
- Với MỖI câu, xác định trạng thái: "correct" (đúng), "wrong" (sai), hoặc "partial" (đúng một phần) và giải thích NGẮN GỌN bằng tiếng Việt vì sao.
- Tính điểm hợp lý trên thang ${maxScore} điểm.
- Viết nhận xét tổng quan bằng tiếng Việt.

Trả lời CHÍNH XÁC theo định dạng JSON sau (không thêm bất kỳ text nào khác, không markdown):
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
  // Chạy song song cho nhanh; dùng allSettled để 1-2 lần lỗi vẫn lấy được lần thành công.
  const n = Math.max(1, attempts);
  const runs = await Promise.allSettled(
    Array.from({ length: n }, () => callModelOnce(parts, maxScore))
  );
  const results = runs.filter(r => r.status === 'fulfilled').map(r => r.value);
  if (results.length === 0) {
    throw runs.find(r => r.status === 'rejected')?.reason || new Error('Chấm bài thất bại');
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
      const model = genAI.getGenerativeModel({ model: modelName });
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
