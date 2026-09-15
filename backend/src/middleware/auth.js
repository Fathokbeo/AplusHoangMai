const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../services/security');

// API chỉ chấp nhận token ở header Authorization (KHÔNG nhận cookie phiên), nên cookie dùng cho
// /uploads không thể bị lợi dụng để gọi API thay người dùng từ trang web khác (CSRF).
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
