# Hướng dẫn vận hành web — APLUS Hoàng Mai

Web đang chạy tại **https://aplushoangmai.com.vn** trên máy chủ riêng (VPS Ubuntu, IP `103.90.225.212`).

- Code nằm trong: `/home/deploy/apps/aplushoangmai` (bản sao của repo GitHub này)
- Chạy bằng **pm2** (tên process: `aplushoangmai`, user `deploy`), **nginx** đứng trước làm reverse proxy
- Dữ liệu (KHÔNG nằm trong git, an toàn khi cập nhật code):
  - Database: `backend/data/mathweb.db` (SQLite)
  - File tải lên: `backend/uploads/`

---

## Cập nhật web: chỉ cần push lên GitHub

Máy chủ **tự kiểm tra GitHub mỗi phút** (cron của user `deploy`). Khi thấy commit mới trên nhánh `main`, nó tự động:

1. Sao lưu database vào `/home/deploy/backups/` (giữ 7 bản gần nhất)
2. `git pull` kéo code mới
3. Build frontend (`npm run build`)
4. Khởi động lại app (`pm2 restart`)

Vậy quy trình sửa code chỉ là:

```bash
git add .
git commit -m "Mo ta thay doi"
git push
```

Chờ **1–2 phút** là web chạy bản mới. Nếu build lỗi, web **vẫn chạy bản cũ** (không sập).

Xem nhật ký tự động deploy trên máy chủ: `cat /home/deploy/auto-deploy.log`

---

## Các file liên quan trên máy chủ

| File | Vai trò |
|---|---|
| `/home/deploy/apps/aplushoangmai/deploy.sh` | Script deploy: backup DB → pull → build → restart |
| `/home/deploy/auto-deploy.sh` | Script cron gọi mỗi phút, phát hiện commit mới thì chạy `deploy.sh` |
| `/home/deploy/backup.sh` | Script sao lưu hằng ngày (database + toàn bộ file tải lên) — cron 03:20 |
| `/home/deploy/backup-db.js` | Sao lưu SQLite bằng API backup (gồm cả dữ liệu trong file `-wal`) |
| `/home/deploy/backups/mathweb-*.db` | Bản sao database trước mỗi lần deploy (giữ 7 bản) |
| `/home/deploy/backups/snapshots/` | Bản chụp hằng ngày: database + `uploads/` (giữ 14 bản) |
| `/home/deploy/backups/latest` | Lối tắt tới bản chụp mới nhất |
| `/home/deploy/auto-deploy.log` | Nhật ký các lần tự động deploy |
| `/home/deploy/backup.log` | Nhật ký các lần sao lưu |

Deploy thủ công (nếu cần): SSH vào máy chủ rồi chạy

```bash
sudo -u deploy bash /home/deploy/apps/aplushoangmai/deploy.sh
```

---

## Những điều cần nhớ

- **Dữ liệu KHÔNG mất** khi push code, deploy, khởi động lại app hay reboot VPS. pm2 đã được cài tự khởi động cùng hệ thống (`pm2-deploy.service`).
- **ĐỪNG BAO GIỜ** chạy `git clean -xdf` hoặc xóa/clone lại thư mục app trên máy chủ — sẽ mất database và file upload.
- **Gia hạn đúng hạn**: VPS và tên miền `aplushoangmai.com.vn` — hết hạn VPS là mất cả web lẫn dữ liệu.

### Sao lưu

Máy chủ **tự sao lưu mỗi ngày lúc 03:20**: database + toàn bộ file tải lên (đề bài, đáp án, bài nộp,
tài liệu, ảnh), giữ **14 bản gần nhất** trong `/home/deploy/backups/snapshots/`.

Các bản chụp dùng hardlink nên file không đổi **không bị chép lại** — 14 bản chỉ tốn gần bằng 1 bản
(khoảng 2GB cho 1.8GB dữ liệu). Xóa nhầm lớp học vẫn khôi phục được từ bản chụp của những ngày trước.

Chạy sao lưu ngay lập tức (không cần chờ tới 03:20):

```bash
sudo -u deploy bash /home/deploy/backup.sh
```

**Tải một bản về máy tính** (nên làm định kỳ — backup nằm cùng máy chủ thì hỏng ổ cứng là mất cả hai):

```bash
# Chỉ database (nhẹ, ~5MB)
scp root@103.90.225.212:/home/deploy/backups/latest/mathweb.db ./mathweb-backup.db

# Cả file tải lên (~1.8GB, lần sau chỉ tải phần thay đổi)
rsync -avz root@103.90.225.212:/home/deploy/backups/latest/ ./backup-aplus/
```

**Khôi phục** khi cần: dừng app, chép ngược lại, bật app.

```bash
sudo -u deploy pm2 stop aplushoangmai
BK=/home/deploy/backups/snapshots/<ngay-gio-can-khoi-phuc>
APP=/home/deploy/apps/aplushoangmai/backend
sudo -u deploy cp "$BK/mathweb.db" "$APP/data/mathweb.db"
sudo -u deploy rm -f "$APP/data/mathweb.db-wal" "$APP/data/mathweb.db-shm"   # bo WAL cu, neu khong se ghi de ban vua khoi phuc
sudo -u deploy rsync -a "$BK/uploads/" "$APP/uploads/"
sudo -u deploy pm2 start aplushoangmai
```

- Biến môi trường (API key AI, JWT secret) nằm trong `/home/deploy/apps/aplushoangmai/backend/.env` trên máy chủ — file này không nằm trong git, sửa xong cần `pm2 restart aplushoangmai`.

---

*(Ghi chú: file `render.yaml` và hướng dẫn Render cũ không còn dùng nữa — web đã chuyển từ Render sang VPS riêng từ tháng 7/2026.)*
