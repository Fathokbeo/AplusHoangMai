const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'mathweb_secret';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username);

  if (!user) {
    return res.status(401).json({ field: 'username', message: 'Tên đăng nhập không tồn tại' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ field: 'password', message: 'Sai mật khẩu' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, parent_phone: user.parent_phone },
  });
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
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
    user = jwt.verify(token, JWT_SECRET);
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
