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

async function gradeSubmission(answerFilePath, submissionFilePath, maxScore = 10) {
  if (!fs.existsSync(answerFilePath))   throw new Error('File đáp án không tồn tại');
  if (!fs.existsSync(submissionFilePath)) throw new Error('File bài nộp không tồn tại');

  const prompt = `Bạn là giáo viên toán. Hãy chấm điểm bài làm của học sinh.

ĐÁP ÁN (tài liệu đầu tiên):
BÀI LÀM HỌC SINH (tài liệu thứ hai):

Yêu cầu:
- So sánh từng bài/câu trong bài làm với đáp án
- Tính điểm hợp lý trên thang ${maxScore} điểm
- Viết nhận xét chi tiết bằng tiếng Việt: nêu rõ các câu đúng, câu sai, cách cải thiện

Trả lời CHÍNH XÁC theo định dạng JSON sau (không thêm bất kỳ text nào khác):
{"score": <số từ 0 đến ${maxScore}>, "feedback": "<nhận xét chi tiết>"}`;

  const parts = [
    prompt,
    buildInlinePart(answerFilePath),
    buildInlinePart(submissionFilePath),
  ];

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
