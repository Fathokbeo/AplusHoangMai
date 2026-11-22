// Thông tin khách phải điền trước khi làm đề thi thử — ADMIN tự chỉnh (bật/tắt, bắt buộc hay không, tên ô,
// thêm ô riêng). Lưu ở site_settings 'mock_info_fields' (không phải dữ liệu bí mật).
//  • Ô có sẵn (cột riêng trong mock_attempts): họ tên, khối, lớp, trường, ĐTB, SĐT phụ huynh.
//    Họ tên + khối luôn bật và bắt buộc (cần để biết bài của ai và lọc đề theo khối).
//  • Ô thêm (key c_xxx): lưu vào mock_attempts.extra_info dạng [{ key, label, value }].

const BUILTIN = [
  { key: 'full_name', label: 'Họ và tên học sinh', type: 'text', placeholder: 'vd: Nguyễn Minh Anh', locked: true },
  { key: 'grade', label: 'Khối lớp', type: 'grade', placeholder: '', locked: true },
  { key: 'class_name', label: 'Lớp', type: 'text', placeholder: 'vd: 9A2' },
  { key: 'school', label: 'Trường', type: 'text', placeholder: 'vd: THCS Hoàng Mai' },
  { key: 'gpa', label: 'Điểm trung bình kì gần nhất', type: 'score', placeholder: 'vd: 8.2' },
  { key: 'parent_phone', label: 'Số điện thoại phụ huynh', type: 'phone', placeholder: 'vd: 0912 345 678' },
];
const BUILTIN_KEYS = BUILTIN.map((f) => f.key);
const CUSTOM_TYPES = ['text', 'phone', 'number', 'score'];
const MAX_CUSTOM = 10;
const SETTING_KEY = 'mock_info_fields';

const defaultFields = () => BUILTIN.map((f) => ({ ...f, enabled: true, required: true, builtin: true }));

// Làm sạch cấu hình admin gửi lên / đọc từ DB → danh sách ô hợp lệ, đủ các ô có sẵn
function sanitizeFields(list) {
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  let custom = 0;
  input.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const key = String(raw.key || '').trim();
    const b = BUILTIN.find((f) => f.key === key);
    if (b) {
      if (seen.has(key)) return;
      seen.add(key);
      const label = String(raw.label || '').trim().slice(0, 60) || b.label;
      out.push({ ...b, label, placeholder: String(raw.placeholder ?? b.placeholder).slice(0, 60), builtin: true,
        enabled: b.locked ? true : raw.enabled !== false, required: b.locked ? true : !!raw.required });
      return;
    }
    if (custom >= MAX_CUSTOM) return;
    const label = String(raw.label || '').trim().slice(0, 60);
    if (!label) return;
    let k = /^c_[a-z0-9]{3,16}$/.test(key) ? key : `c_${Math.random().toString(36).slice(2, 10)}`;
    while (seen.has(k)) k = `c_${Math.random().toString(36).slice(2, 10)}`;
    seen.add(k);
    custom++;
    out.push({ key: k, label, type: CUSTOM_TYPES.includes(raw.type) ? raw.type : 'text', placeholder: String(raw.placeholder || '').slice(0, 60),
      enabled: raw.enabled !== false, required: !!raw.required, builtin: false });
  });
  // Ô có sẵn bị thiếu → thêm lại (tắt nếu không bắt buộc), để luôn đủ cột cho bảng kết quả
  BUILTIN.forEach((b) => { if (!seen.has(b.key)) out.push({ ...b, builtin: true, enabled: !!b.locked, required: !!b.locked }); });
  // Họ tên + khối luôn lên đầu
  const order = (f) => (f.key === 'full_name' ? 0 : f.key === 'grade' ? 1 : 2);
  return out.sort((a, c) => order(a) - order(c));
}

function getFields(db) {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key=?').get(SETTING_KEY);
    if (row && row.value) return sanitizeFields(JSON.parse(row.value));
  } catch { /* dùng mặc định */ }
  return defaultFields();
}

function saveFields(db, list) {
  const fields = sanitizeFields(list);
  db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(SETTING_KEY, JSON.stringify(fields.map(({ locked, ...f }) => f)));
  return fields;
}

// Kiểm tra thông tin khách gửi theo cấu hình. Trả về { errors: {key: thông báo}, builtin: {...cột}, extra: [{key,label,value}] }
function validateInfo(fields, body) {
  const errors = {};
  const builtin = { full_name: '', grade: null, class_name: '', school: '', gpa: null, parent_phone: '' };
  const extra = [];
  const b = body || {};
  fields.forEach((f) => {
    if (!f.enabled) return;
    const raw = String(b[f.key] ?? '').trim();
    let value = raw;
    if (!raw) {
      if (f.required) errors[f.key] = `Vui lòng nhập ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`;
    } else if (f.type === 'grade') {
      const n = parseInt(raw, 10);
      if (!(Number.isInteger(n) && n >= 1 && n <= 12)) errors[f.key] = 'Vui lòng chọn khối lớp';
      value = n;
    } else if (f.type === 'score') {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10) errors[f.key] = `${f.label} phải từ 0 đến 10`;
      value = Math.round(n * 100) / 100;
    } else if (f.type === 'number') {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n)) errors[f.key] = `${f.label} phải là số`;
      value = n;
    } else if (f.type === 'phone') {
      value = raw.replace(/[\s.-]/g, '');
      if (!/^(\+84|0)\d{9,10}$/.test(value)) errors[f.key] = `${f.label} không hợp lệ`;
    } else {
      value = raw.replace(/\s+/g, ' ').slice(0, 120);
      if (f.key === 'full_name' && (value.length < 2 || value.length > 80)) errors[f.key] = 'Vui lòng nhập họ tên học sinh';
    }
    if (errors[f.key]) return;
    if (BUILTIN_KEYS.includes(f.key)) builtin[f.key] = raw ? value : builtin[f.key];
    else if (raw) extra.push({ key: f.key, label: f.label, value: String(value) });
  });
  return { errors, builtin, extra };
}

module.exports = { getFields, saveFields, sanitizeFields, validateInfo, defaultFields, BUILTIN_KEYS };
