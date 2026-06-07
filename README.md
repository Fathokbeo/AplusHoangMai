# APLUS Hoàng Mai — Hệ thống Trung tâm Giáo dục

Ứng dụng web full-stack cho Trung Tâm Giáo Dục APLUS Hoàng Mai: quản lý khóa học, lớp học, bài giảng, bài tập với **chấm điểm bằng AI (Google Gemini)**, cùng các trang giới thiệu công khai do admin tự quản lý.

## Tính năng

**3 vai trò:** Admin · Giáo viên · Học sinh

- **Admin:** quản lý tài khoản (xem được mật khẩu, xóa/vô hiệu hóa, chọn nhiều), khóa học, lớp học, quảng cáo banner, và toàn bộ nội dung trang giới thiệu (học sinh tiêu biểu, giáo viên, khóa học tiêu biểu, thành tích, liên hệ).
- **Giáo viên:** tạo khóa học và lớp học bên trong khóa, tạo tài khoản học sinh, thêm/đổi lớp cho học sinh, soạn bài giảng (YouTube/video), giao bài tập (PDF) kèm đáp án để **AI tự chấm**.
- **Học sinh:** xem lớp/bài giảng, nộp bài (PDF/ảnh) và nhận điểm + nhận xét tự động ngay sau khi nộp.

## Công nghệ

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4
- **Backend:** Node.js + Express 5 + better-sqlite3 + JWT + multer
- **AI chấm bài:** Google Gemini (`gemini-2.5-flash`)

## Cài đặt

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env        # rồi điền GEMINI_API_KEY của bạn
node src/server.js          # chạy tại http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                 # chạy tại http://localhost:5173
```

Hoặc trên Windows chạy `start.bat` để mở cả hai cùng lúc.

### Tài khoản mặc định
- Admin: `admin` / `admin123` (đổi mật khẩu ngay sau khi đăng nhập)

## Cấu hình môi trường (`backend/.env`)

| Biến | Mô tả |
|------|-------|
| `PORT` | Cổng backend (mặc định 5000) |
| `JWT_SECRET` | Chuỗi bí mật ký JWT |
| `GEMINI_API_KEY` | Google Gemini API key ([lấy tại đây](https://aistudio.google.com/apikey)) |
| `FRONTEND_URL` | URL frontend cho CORS |

## Lưu ý bảo mật

- `backend/.env` và `backend/data/*.db` **không** được đưa lên Git (đã cấu hình trong `.gitignore`).
- Database lưu mật khẩu dạng plaintext để admin xem được — hãy giữ file `data/mathweb.db` an toàn, không chia sẻ.
