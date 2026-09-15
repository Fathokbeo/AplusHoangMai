const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

// Khóa ký token. Ưu tiên biến môi trường; nếu chưa đặt thì tự sinh 1 khóa ngẫu nhiên và lưu vào DB
// (mỗi bản cài 1 khóa riêng, giữ nguyên qua các lần khởi động lại) — tuyệt đối không dùng khóa mặc
// định ghi sẵn trong mã nguồn, vì mã nguồn công khai thì ai cũng tự ký được token quản trị.
let cachedSecret = null;
function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) { cachedSecret = process.env.JWT_SECRET; return cachedSecret; }
  const db = getDb();
  const row = db.prepare('SELECT value FROM site_settings WHERE key=?').get('jwt_secret');
  if (row && row.value) { cachedSecret = row.value; return cachedSecret; }
  const generated = crypto.randomBytes(48).toString('hex');
  db.prepare('INSERT OR REPLACE INTO site_settings (key,value) VALUES (?,?)').run('jwt_secret', generated);
  console.warn('⚠️  Chưa đặt JWT_SECRET trong .env — đã tự sinh khóa ngẫu nhiên và lưu vào database.');
  cachedSecret = generated;
  return cachedSecret;
}

// ── Phiên đăng nhập qua cookie ────────────────────────────────────────
// API dùng header Authorization. Nhưng thẻ <img>, <a href>, <video> tải file /uploads thì trình duyệt
// KHÔNG gửi được header đó, nên cần thêm cookie. Cookie chỉ dùng để kiểm tra quyền tải file (GET),
// không dùng cho API, nên không mở đường cho CSRF.
const SESSION_COOKIE = 'mw_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // khớp hạn 7 ngày của token

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
  }
  return null;
}

function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,   // JavaScript không đọc được → mã độc chèn vào trang cũng không lấy được phiên
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Lấy người dùng từ header Authorization hoặc cookie phiên; trả về null nếu không hợp lệ.
function userFromRequest(req) {
  const token = req.headers.authorization?.split(' ')[1] || readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try { return jwt.verify(token, getJwtSecret()); } catch { return null; }
}

// ── Chặn dò mật khẩu ──────────────────────────────────────────────────
// Đếm số lần đăng nhập sai theo TÊN ĐĂNG NHẬP (bảo vệ từng tài khoản) và theo IP (chặn dò hàng loạt).
// Ngưỡng theo IP nới rộng hơn vì cả lớp học có thể dùng chung một đường mạng.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_USER = 8;
const MAX_PER_IP = 40;
const failures = new Map(); // key -> { count, resetAt }

function bucket(key) {
  const now = Date.now();
  const cur = failures.get(key);
  if (!cur || now >= cur.resetAt) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    failures.set(key, fresh);
    return fresh;
  }
  return cur;
}

function pruneFailures() {
  if (failures.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of failures) if (now >= v.resetAt) failures.delete(k);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Còn được phép thử đăng nhập không? Trả về số giây phải chờ nếu đang bị khóa tạm.
function loginBlockedFor(req, username) {
  const u = bucket(`u:${String(username || '').toLowerCase()}`);
  const i = bucket(`i:${clientIp(req)}`);
  const hit = u.count >= MAX_PER_USER ? u : i.count >= MAX_PER_IP ? i : null;
  return hit ? Math.ceil((hit.resetAt - Date.now()) / 1000) : 0;
}

function recordLoginFailure(req, username) {
  bucket(`u:${String(username || '').toLowerCase()}`).count++;
  bucket(`i:${clientIp(req)}`).count++;
  pruneFailures();
}

function clearLoginFailures(req, username) {
  failures.delete(`u:${String(username || '').toLowerCase()}`);
  failures.delete(`i:${clientIp(req)}`);
}

module.exports = {
  getJwtSecret,
  SESSION_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  userFromRequest,
  loginBlockedFor,
  recordLoginFailure,
  clearLoginFailures,
};
