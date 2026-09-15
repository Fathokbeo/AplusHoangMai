const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const {
  getJwtSecret, setSessionCookie, clearSessionCookie, userFromRequest,
  loginBlockedFor, recordLoginFailure, clearLoginFailures,
} = require('../services/security');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }

  // Sai quá nhiều lần thì khóa tạm, tránh bị dò mật khẩu hàng loạt
  const wait = loginBlockedFor(req, username);
  if (wait > 0) {
    return res.status(429).json({ message: `Sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(wait / 60)} phút.` });
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username);

  if (!user) {
    recordLoginFailure(req, username);
    return res.status(401).json({ field: 'username', message: 'Tên đăng nhập không tồn tại' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    recordLoginFailure(req, username);
    return res.status(401).json({ field: 'password', message: 'Sai mật khẩu' });
  }
  clearLoginFailures(req, username);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
  setSessionCookie(req, res, token); // để trình duyệt tải được file /uploads có kiểm tra quyền

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, parent_phone: user.parent_phone },
  });
});

// Cấp lại cookie phiên cho người đang đăng nhập sẵn (token còn trong trình duyệt từ trước khi có tính
// năng này), để họ không phải đăng nhập lại mới xem được file.
router.post('/session', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !userFromRequest(req)) return res.status(401).json({ message: 'Unauthorized' });
  setSessionCookie(req, res, token);
  res.json({ message: 'OK' });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Đã đăng xuất' });
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const user = jwt.verify(token, getJwtSecret());
    res.json(user);
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
});

// Change own password
router.put('/change-password', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  let user;
  try {
    user = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(401).json({ message: 'Token không hợp lệ' });
  }

  const { old_password, new_password } = req.body;
  const db = getDb();
  const dbUser = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);

  if (!bcrypt.compareSync(old_password, dbUser.password)) {
    return res.status(400).json({ message: 'Mật khẩu cũ không đúng' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password=?,plain_password=? WHERE id=?').run(hash, new_password, user.id);
  res.json({ message: 'Đổi mật khẩu thành công' });
});

module.exports = router;
