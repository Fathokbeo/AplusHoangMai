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
| `/home/deploy/backups/` | Bản sao lưu database trước mỗi lần deploy |
| `/home/deploy/auto-deploy.log` | Nhật ký các lần tự động deploy |

Deploy thủ công (nếu cần): SSH vào máy chủ rồi chạy

```bash
sudo -u deploy bash /home/deploy/apps/aplushoangmai/deploy.sh
```

---

## Những điều cần nhớ

- **Dữ liệu KHÔNG mất** khi push code, deploy, khởi động lại app hay reboot VPS. pm2 đã được cài tự khởi động cùng hệ thống (`pm2-deploy.service`).
- **ĐỪNG BAO GIỜ** chạy `git clean -xdf` hoặc xóa/clone lại thư mục app trên máy chủ — sẽ mất database và file upload.
- **Gia hạn đúng hạn**: VPS và tên miền `aplushoangmai.com.vn` — hết hạn VPS là mất cả web lẫn dữ liệu.
- Nên thỉnh thoảng tải một bản backup về máy tính:

```bash
scp root@103.90.225.212:/home/deploy/apps/aplushoangmai/backend/data/mathweb.db ./mathweb-backup.db
```

- Biến môi trường (API key AI, JWT secret) nằm trong `/home/deploy/apps/aplushoangmai/backend/.env` trên máy chủ — file này không nằm trong git, sửa xong cần `pm2 restart aplushoangmai`.

---

*(Ghi chú: file `render.yaml` và hướng dẫn Render cũ không còn dùng nữa — web đã chuyển từ Render sang VPS riêng từ tháng 7/2026.)*
