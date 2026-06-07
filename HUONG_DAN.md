# Hướng dẫn cài đặt APLUS Hoàng Mai

## Yêu cầu
- Node.js v18+ (đã có v25)
- Anthropic API Key (để dùng chức năng AI chấm bài)

## Cài đặt API Key

1. Đăng ký tại https://console.anthropic.com
2. Tạo API key
3. Mở file `backend/.env`
4. Thay `your_anthropic_api_key_here` bằng key của bạn

## Khởi động

### Cách 1: Double-click `start.bat`

### Cách 2: Terminal riêng
```
# Terminal 1 - Backend:
cd backend
node src/server.js

# Terminal 2 - Frontend:
cd frontend
npm run dev
```

## Truy cập
- Trang chủ: http://localhost:5173
- Admin: admin / admin123

## Tài khoản mặc định
| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |

## Tính năng
- Admin: quản lý tài khoản, khóa học, lớp học, quảng cáo
- Giáo viên: tạo lớp, bài giảng, bài tập, xem điểm
- Học sinh: xem bài giảng, nộp bài, xem điểm (AI chấm tức thì)
