# Hướng dẫn đưa web lên mạng (miễn phí) — APLUS Hoàng Mai

Web sẽ chạy như **một service duy nhất** trên **Render** (gói Free, không cần thẻ tín dụng).
Bạn sẽ có một địa chỉ dạng `https://mathweb-xxxx.onrender.com` để gửi cho người khác xem.

> ⚠️ **Lưu ý về dữ liệu (vì đang dùng SQLite + bản miễn phí):**
> Mỗi khi bạn deploy lại code, hoặc server "ngủ dậy" sau 15 phút không có người truy cập,
> **toàn bộ dữ liệu (tài khoản, khóa học, file upload) sẽ bị reset về ban đầu.**
> Điều này phù hợp để **demo / cho người khác xem thử**. Nếu sau này cần dùng thật và giữ
> dữ liệu, hãy nhắn mình chuyển sang PostgreSQL (vẫn miễn phí) hoặc bật ổ đĩa lưu vĩnh viễn (trả phí ~5$/tháng).

> Lần đầu mở web sau khi server ngủ có thể chờ ~30–60 giây để server khởi động lại — đây là giới hạn bình thường của gói Free.

---

## Những gì mình đã chuẩn bị sẵn trong dự án

- Sửa `backend/src/server.js` để **vừa chạy API vừa phục vụ giao diện frontend** (chỉ cần 1 service).
- Thêm `package.json` ở thư mục gốc với lệnh `build` và `start` cho Render.
- Thêm `render.yaml` để cấu hình deploy.
- Các bí mật (`.env`, file `.db`, thư mục `uploads`) đã được `.gitignore` loại trừ — **sẽ không bị đẩy lên GitHub**.

Bạn chỉ cần làm theo 3 bước dưới đây.

---

## Bước 1 — Đẩy code lên GitHub

1. Tạo tài khoản GitHub (nếu chưa có): https://github.com/signup
2. Tạo một repository mới (để **Private** cũng được): https://github.com/new
   - Đặt tên ví dụ `mathweb`. **Không** tích "Add a README".
3. Mở terminal **trong thư mục dự án** `D:\job\Mathweb` rồi chạy lần lượt:

```bash
git init
git add .
git commit -m "Chuan bi deploy"
git branch -M main
git remote add origin https://github.com/TEN_CUA_BAN/mathweb.git
git push -u origin main
```

> Thay `TEN_CUA_BAN` bằng tên tài khoản GitHub của bạn.
> Nếu nó hỏi đăng nhập, dùng tài khoản GitHub (có thể cần tạo Personal Access Token thay cho mật khẩu).

Sau khi push xong, kiểm tra trên GitHub: **phải KHÔNG thấy** file `backend/.env` và file `mathweb.db`. Nếu thấy thì dừng lại và nhắn mình.

---

## Bước 2 — Tạo dịch vụ trên Render

1. Vào https://render.com → **Get Started** → đăng nhập **bằng tài khoản GitHub** (nhanh nhất).
2. Bấm **New +** → **Web Service**.
3. Chọn repository `mathweb` bạn vừa đẩy lên (cho Render quyền truy cập GitHub nếu được hỏi).
4. Render thường tự đọc file `render.yaml`. Nếu nó hỏi, xác nhận các thông số:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Instance Type / Plan**: chọn **Free**
5. Bấm tạo. **Khoan vội** — sang Bước 3 nhập biến môi trường trước khi nó build xong (hoặc nhập rồi deploy lại cũng được).

---

## Bước 3 — Nhập biến môi trường (API key)

Trong service trên Render → tab **Environment** → thêm các biến:

| Key                 | Value                                            |
|---------------------|--------------------------------------------------|
| `GEMINI_API_KEY`    | (lấy từ file `backend/.env` của bạn)             |
| `ANTHROPIC_API_KEY` | (dán cùng giá trị như trên)                      |

- `JWT_SECRET` đã được Render tự tạo ngẫu nhiên (nhờ `render.yaml`) — không cần nhập.
- `PORT` Render tự cấp — **không cần nhập**.
- Nếu **chưa dùng** tính năng chấm bài bằng AI, có thể để trống 2 key trên (web vẫn chạy, chỉ riêng chấm AI sẽ báo lỗi).

Sau khi nhập xong → bấm **Manual Deploy → Deploy latest commit** (hoặc **Save, rebuild**).

> 🔐 **Bảo mật quan trọng:** API key của bạn (`AIzaSy...`) đã từng nằm trong file `.env` trên máy.
> Vì key này lộ trong quá trình làm việc, bạn **nên tạo key mới** và vô hiệu hóa key cũ tại
> https://aistudio.google.com/apikey để tránh người khác dùng trộm.

---

## Xong!

Khi build xong (vài phút), Render cho bạn một địa chỉ dạng:

```
https://mathweb-xxxx.onrender.com
```

Mở link đó là thấy web. Đăng nhập bằng tài khoản admin mặc định (tài khoản này được tạo tự động
khi server khởi động — kiểm tra trong `backend/src/db/database.js` phần tạo admin mặc định để biết
user/mật khẩu).

---

## Mỗi lần sửa code sau này

Chỉ cần đẩy lên GitHub là Render **tự động** build & deploy lại:

```bash
git add .
git commit -m "Cap nhat"
git push
```

---

## Khi nào cần nâng cấp?

- **Muốn dữ liệu không bị reset** → nhắn mình chuyển sang PostgreSQL miễn phí, hoặc bật Persistent Disk (~5$/tháng).
- **Muốn web không bị "ngủ"** (luôn phản hồi nhanh) → nâng lên gói trả phí thấp nhất của Render.
- **Muốn tên miền riêng** (vd `aplushoangmai.com`) → mua tên miền rồi trỏ về Render (mình hướng dẫn được).
