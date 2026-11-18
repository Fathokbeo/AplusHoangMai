// Kho API key Gemini: nhiều key cùng lúc, tự xoay vòng khi key/model chạm giới hạn.
//
// Nguồn key (gộp, bỏ trùng):
//   1) Bảng ai_keys — admin thêm/xoá ở trang "AI chấm bài" (luôn hiển thị dạng che, không trả key đầy đủ).
//   2) Biến môi trường GEMINI_API_KEYS (nhiều key, cách nhau dấu phẩy / xuống dòng) và GEMINI_API_KEY.
//
// Giới hạn của Google tính theo (project của key × model): hết lượt model A ở key 1 thì key 2 vẫn dùng
// model A được, và key 1 vẫn dùng model B được → ghi "thời điểm dùng lại được" cho TỪNG cặp key × model.
// Trạng thái giữ trong bộ nhớ (khởi động lại server thì thử lại từ đầu — Google sẽ báo lại nếu vẫn hết).

const keyState = new Map(); // key → { bad: { until, reason }, models: Map(model → { until, reason }), calls, lastOk, lastError, batchOffUntil }

function state(key) {
  if (!keyState.has(key)) keyState.set(key, { bad: null, models: new Map(), calls: 0, lastOk: null, lastError: null, batchOffUntil: 0 });
  return keyState.get(key);
}

function splitKeys(text) {
  return String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 20);
}

function mask(key) {
  const k = String(key || '');
  return k.length <= 12 ? '••••' : `${k.slice(0, 6)}••••${k.slice(-4)}`;
}

function dbKeys() {
  try {
    const { getDb } = require('../db/database');
    return getDb().prepare('SELECT id, api_key, label FROM ai_keys WHERE active=1 ORDER BY id').all();
  } catch { return []; }
}

// Tất cả key đang dùng, theo thứ tự ưu tiên (key admin thêm trước, rồi key trong biến môi trường)
function allKeys() {
  const out = [];
  const seen = new Set();
  const add = (key, source, extra = {}) => { if (key && !seen.has(key)) { seen.add(key); out.push({ key, source, ...extra }); } };
  dbKeys().forEach((r) => add(r.api_key, 'db', { id: r.id, label: r.label || '' }));
  splitKeys(process.env.GEMINI_API_KEYS).forEach((k) => add(k, 'env'));
  splitKeys(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY).forEach((k) => add(k, 'env'));
  return out;
}

// Key dùng được cho model này ngay bây giờ (bỏ key hỏng / key đang hết lượt model này)
// Lần lượt xoay vòng điểm bắt đầu: các lượt gọi chạy song song (nhiều nhóm học sinh cùng lúc) được chia
// đều cho các key khác nhau → mỗi key chịu ít token/phút (TPM) và lượt/phút (RPM) hơn.
const rr = new Map();
function keysFor(model, { rotate = true } = {}) {
  const now = Date.now();
  const list = allKeys().map((k) => k.key).filter((key) => {
    const st = state(key);
    if (st.bad && st.bad.until > now) return false;
    const m = st.models.get(model);
    return !(m && m.until > now);
  });
  if (!rotate || list.length < 2) return list;
  const n = rr.get(model) || 0;
  rr.set(model, n + 1);
  const off = n % list.length;
  return [...list.slice(off), ...list.slice(0, off)];
}

// Thời điểm reset quota NGÀY của Google: nửa đêm giờ Thái Bình Dương (≈ 15h giờ Việt Nam).
function nextPacificMidnight() {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const next = new Date(pt);
  next.setHours(24, 0, 30, 0);
  return now.getTime() + (next - pt);
}

// Ghi nhận lỗi giới hạn (429) của 1 cặp key × model. retryDelaySec: thời gian Google gợi ý (nếu có).
function markLimited(key, model, retryDelaySec, message) {
  const daily = /per day|PerDay|daily/i.test(String(message || ''));
  let until;
  if (retryDelaySec && retryDelaySec > 0) until = Date.now() + retryDelaySec * 1000 + 1000;
  else until = daily ? nextPacificMidnight() : Date.now() + 65_000;
  const st = state(key);
  st.models.set(model, { until, reason: daily || (retryDelaySec || 0) > 3600 ? 'hết lượt trong ngày' : 'chạm giới hạn/phút' });
  st.lastError = { at: Date.now(), model, message: String(message || '').slice(0, 160) };
}

// Key sai / bị thu hồi / project không bật API → tạm bỏ key 1 giờ, dùng key khác.
function markBad(key, message) {
  const st = state(key);
  st.bad = { until: Date.now() + 3600_000, reason: String(message || '').slice(0, 160) };
  st.lastError = { at: Date.now(), model: null, message: st.bad.reason };
}

function markOk(key) {
  const st = state(key);
  st.calls += 1;
  st.lastOk = Date.now();
  st.bad = null;
}

// Batch chỉ chạy được trên key có bật thanh toán → ghi riêng từng key.
function batchKey(model) {
  const now = Date.now();
  return keysFor(model).find((k) => state(k).batchOffUntil <= now) || null;
}
function batchUsable(key) {
  return state(key).batchOffUntil <= Date.now();
}
function markBatchOff(key, hours = 6) {
  state(key).batchOffUntil = Date.now() + hours * 3600_000;
}

// Sớm nhất khi nào có (key × model) dùng lại được — để hàng đợi hẹn giờ chấm lại.
function nextAvailableAt(models) {
  const now = Date.now();
  let best = Infinity;
  const keys = allKeys().map((k) => k.key);
  for (const model of models) {
    for (const key of keys) {
      const st = state(key);
      const t = Math.max(st.bad && st.bad.until > now ? st.bad.until : 0, (st.models.get(model) || {}).until || 0);
      best = Math.min(best, Math.max(t, now));
    }
  }
  return Number.isFinite(best) ? best : now + 15 * 60_000;
}

// Trạng thái cho trang admin (KHÔNG trả key đầy đủ)
function statusList(models) {
  const now = Date.now();
  return allKeys().map((k) => {
    const st = state(k.key);
    return {
      id: k.id || null,
      source: k.source,
      label: k.label || '',
      masked: mask(k.key),
      calls: st.calls,
      last_ok: st.lastOk,
      bad: st.bad && st.bad.until > now ? st.bad : null,
      batch: st.batchOffUntil > now ? 'off' : 'unknown',
      models: models.map((m) => {
        const s = st.models.get(m);
        return s && s.until > now ? { model: m, until: s.until, reason: s.reason } : { model: m, until: null, reason: null };
      }),
      last_error: st.lastError,
    };
  });
}

module.exports = { allKeys, keysFor, markLimited, markBad, markOk, batchKey, batchUsable, markBatchOff, nextAvailableAt, statusList, splitKeys, mask };
