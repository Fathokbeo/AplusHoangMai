require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Chạy sau nginx: tin cậy 1 lớp proxy để lấy đúng IP thật của client (dùng cho chặn dò mật khẩu).
app.set('trust proxy', 1);
app.disable('x-powered-by'); // không quảng cáo "Express" cho người dò lỗ hổng

app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:5173'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');       // không đoán kiểu file → chặn vài kiểu tấn công qua file tải lên
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');            // chỉ trang mình được nhúng iframe (trình xem PDF vẫn chạy)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
});

// File tải lên: kiểm tra quyền TRƯỚC khi phục vụ. Ảnh trang giới thiệu vẫn công khai; đề bài, đáp án,
// bài nộp, video và tài liệu bài giảng thì phải đăng nhập đúng lớp mới tải được.
const { uploadsAuth, PUBLIC_DIRS } = require('./middleware/uploadsAuth');
app.use('/uploads', uploadsAuth, express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    const dir = path.basename(path.dirname(filePath));
    // Không cho proxy/CDN dùng chung bộ nhớ đệm cho file riêng tư
    if (!PUBLIC_DIRS.has(dir)) res.setHeader('Cache-Control', 'private, no-cache');
  },
}));

// Routes — public first to avoid auth middleware catch-all
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/admin/content', require('./routes/content'));  // trước /api/admin
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));
app.use('/api', require('./routes/homework'));

// Initialize DB (creates tables + default admin)
require('./db/database').getDb();

// Bật hàng đợi chấm bài AI nền (phục hồi bài còn dở + thử lại khi lỗi)
require('./services/gradingQueue').startGradingWorker();

// Serve frontend build (single-service deploy). Nếu đã build frontend, phục vụ luôn.
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: mọi request không phải /api hay /uploads trả về index.html
  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log('🌐 Đang phục vụ frontend từ frontend/dist');
}

// Global error handler — always return JSON
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Lỗi server' });
});

app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
  console.log(`📚 APLUS HOÀNG MAI - Trung tâm Giáo dục`);
});
