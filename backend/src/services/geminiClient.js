// Gọi Gemini qua REST (generateContent) — điều khiển đủ các tham số mới (thinking, độ phân giải ảnh,
// JSON schema) mà SDK @google/generative-ai cũ không hỗ trợ. Có fallback lần lượt qua danh sách model
// khi dính hết quota / quá tải / model không tồn tại.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 6 * 60_000; // model có "thinking" chấm bài nhiều trang có thể mất vài phút

// POST JSON bằng module https (KHÔNG dùng fetch: fetch của Node tự ngắt sau 300s chờ phản hồi, trong khi
// model có suy luận chấm bài nhiều trang lúc máy chủ Google đông có thể lâu hơn).
function postJson(url, key, payload, timeoutMs) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'content-length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

const keys = require('./aiKeys');

// Lỗi có nên thử model tiếp theo không: hết quota (429), quá tải (5xx), model bị gỡ / không có quyền (404/403).
function isRetryableModelError(err) {
  if (err && err.retryable) return true;
  const msg = String(err && err.message);
  return /429|quota|RESOURCE_EXHAUSTED|503|500|overloaded|UNAVAILABLE|404|not found|timeout|aborted|fetch failed/i.test(msg);
}

function isQuotaError(err) {
  return /429|quota|RESOURCE_EXHAUSTED/i.test(String(err && err.message));
}

// Thân request generateContent cho 1 model.
// parts: mảng phần tử { text } | { inlineData: { mimeType, data(base64) } }
// opts: { schema, thinkingLevel ('low'|'medium'|'high'), mediaResolution, maxOutputTokens, temperature }
function buildRequest(model, parts, opts = {}) {
  const generationConfig = {
    responseMimeType: 'application/json',
    maxOutputTokens: opts.maxOutputTokens || 32768,
  };
  if (opts.schema) generationConfig.responseSchema = opts.schema;
  if (opts.temperature != null) generationConfig.temperature = opts.temperature;
  if (opts.mediaResolution) generationConfig.mediaResolution = opts.mediaResolution;
  // Gemini 3.x/4: thinkingLevel; Gemini 2.5: thinkingBudget (-1 = tự động)
  if (/^gemini-(3|4)/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel || 'high' };
  else if (/^gemini-2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: -1 };
  return { contents: [{ role: 'user', parts }], generationConfig };
}

function apiError(model, status, body) {
  const msg = (body && body.error && body.error.message) || `HTTP ${status}`;
  const err = new Error(`${status} ${model}: ${String(msg).slice(0, 300)}`);
  err.status = status;
  // Google ghi thời gian nên chờ (RetryInfo.retryDelay = "35s"): giới hạn theo PHÚT thì chờ ngắn,
  // giới hạn theo NGÀY (free tier 20 lượt/ngày/model) thì cả chục tiếng.
  const ri = ((body && body.error && body.error.details) || []).find((d) => d && /RetryInfo/.test(d['@type'] || ''));
  if (ri && ri.retryDelay) err.retryDelaySec = parseFloat(String(ri.retryDelay)) || null;
  return err;
}

// GenerateContentResponse → { json, model, usage }
function parseResponse(model, body) {
  const cand = body && body.candidates && body.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
    : '';
  if (!text) {
    const err = new Error(`${model}: không có nội dung trả về (finishReason=${cand && cand.finishReason})`);
    err.retryable = true;
    throw err;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) { const err = new Error(`${model}: AI không trả về JSON hợp lệ`); err.retryable = true; throw err; }
    try { json = JSON.parse(m[0]); } catch { const err = new Error(`${model}: JSON hỏng (finishReason=${cand.finishReason})`); err.retryable = true; throw err; }
  }
  return { json, model, usage: body.usageMetadata || {} };
}

// Gọi 1 lần với 1 key cụ thể.
async function generateOnce(model, parts, opts = {}, key = null) {
  const k = key || (keys.allKeys()[0] || {}).key;
  if (!k) throw new Error('Chưa có API key Gemini nào (thêm ở trang Admin → AI chấm bài, hoặc GEMINI_API_KEY)');
  let res;
  try {
    res = await postJson(`${API}/${model}:generateContent`, k, JSON.stringify(buildRequest(model, parts, opts)), opts.timeoutMs || REQUEST_TIMEOUT_MS);
  } catch (e) {
    const err = new Error(`${model}: ${e.message}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok || res.body.error) throw apiError(model, res.status, res.body);
  return parseResponse(model, res.body);
}

// Key sai / hết hạn / project chưa bật Gemini API → bỏ key đó, dùng key khác (không phải lỗi của model).
function isKeyError(err) {
  return (err && (err.status === 401 || err.status === 403)) || /API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED|SERVICE_DISABLED/i.test(String(err && err.message));
}

// Gọi với xoay vòng: lần lượt từng MODEL (theo thứ tự ưu tiên — chỉ model mạnh), trong mỗi model thử
// lần lượt từng KEY còn lượt. Key chạm giới hạn → ghi lại thời điểm dùng lại được rồi đổi key ngay; hết
// key cho model này → sang model tiếp theo. Tất cả đang chờ ngắn (giới hạn/phút) → đợi rồi thử lại.
// Trả về { json, model, usage, key (đã che) }.
async function generateJson(models, parts, opts = {}) {
  let lastErr;
  const overloadRetries = opts.overloadRetries ?? 3;
  if (!keys.allKeys().length) throw new Error('Chưa có API key Gemini nào (thêm ở trang Admin → AI chấm bài, hoặc GEMINI_API_KEY)');
  for (let round = 0; round < 3; round++) {
    for (const model of models) {
      let overloadTries = 0;
      let modelBroken = false;
      for (const key of keys.keysFor(model)) {
        for (;;) {
          const t0 = Date.now();
          try {
            const r = await generateOnce(model, parts, opts, key);
            keys.markOk(key);
            if (process.env.GRADING_DEBUG) console.log(`[gemini] ${model} [${keys.mask(key)}] OK ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(r.usage));
            return { ...r, key: keys.mask(key) };
          } catch (err) {
            lastErr = err;
            if (err.status === 429 || isQuotaError(err)) {
              keys.markLimited(key, model, err.retryDelaySec, err.message);
              console.warn(`[gemini] ${model} [${keys.mask(key)}] hết lượt → đổi key`);
              break; // key tiếp theo
            }
            if (isKeyError(err)) {
              keys.markBad(key, err.message);
              console.warn(`[gemini] key ${keys.mask(key)} lỗi (${String(err.message).slice(0, 100)}) → bỏ key này 1 giờ`);
              break;
            }
            if (!isRetryableModelError(err)) throw err;
            const overloaded = /503|overloaded|UNAVAILABLE|high demand/i.test(String(err.message));
            // Quá tải là của MODEL (đổi key không giúp gì) → chờ 10s, 20s, 40s rồi thử lại; vẫn không được → model khác
            if (overloaded && overloadTries < overloadRetries) {
              const wait = 10_000 * 2 ** overloadTries++;
              console.warn(`[gemini] ${model} quá tải → chờ ${wait / 1000}s thử lại`);
              await new Promise((res) => setTimeout(res, wait));
              continue;
            }
            console.warn(`[gemini] ${model} không khả dụng sau ${Math.round((Date.now() - t0) / 1000)}s (${String(err.message).slice(0, 140)}) → thử model tiếp theo`);
            modelBroken = true;
            break;
          }
        }
        if (modelBroken) break; // lỗi của model → bỏ qua các key còn lại, sang model khác
      }
    }
    // Không còn cặp key × model nào dùng được: chỉ chờ nếu sắp có lại (≤ 90s), không thì báo hết lượt
    const wait = keys.nextAvailableAt(models) - Date.now();
    if (wait > 90_000) break;
    if (wait > 0) {
      console.warn(`[gemini] tất cả key đang chạm giới hạn/phút → chờ ${Math.ceil(wait / 1000)}s`);
      await new Promise((res) => setTimeout(res, wait + 500));
    }
  }
  const err = lastErr || new Error('Không có model/key nào để gọi');
  if (isQuotaError(err) || models.every((m) => !keys.keysFor(m).length)) {
    err.quota = true;
    err.retryAt = keys.nextAvailableAt(models);
  }
  throw err;
}

// ── BATCH MODE (giảm 50% giá) ─────────────────────────────────────────────────────────────
// Gửi nhiều request trong 1 "lô"; Google xử lý trong vài phút → tối đa 24 giờ. Chỉ dùng được với key
// mà project đã bật thanh toán (ghi riêng từng key). Tắt bằng GEMINI_BATCH=0. Lỗi bất kỳ → gọi thường.
const BATCH_POLL_MS = 30_000;
const BATCH_MAX_BYTES = 18 * 1024 * 1024; // giới hạn lô inline của Google: 20MB

// Còn key nào có thể chạy batch không (chưa bị đánh dấu "không hỗ trợ batch") — để hàng đợi chọn số bài song song
function batchEnabled() {
  if (process.env.GEMINI_BATCH === '0') return false;
  return keys.allKeys().some((k) => keys.batchUsable(k.key));
}

async function apiGet(pathName, key) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(`https://generativelanguage.googleapis.com/v1beta/${pathName}`, { headers: { 'x-goog-api-key': key } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

// Trạng thái + kết quả lô: tài liệu Google ghi 2 kiểu đường dẫn → đọc cả hai.
function batchState(b) {
  return String((b && (b.state || (b.metadata && b.metadata.state) || (b.done ? 'JOB_STATE_SUCCEEDED' : ''))) || '');
}
function batchResponses(b) {
  const holders = [b && b.dest, b && b.response, b && b.output, b && b.metadata && b.metadata.output, b && b.metadata && b.metadata.dest];
  for (const h of holders) {
    const ir = h && (h.inlinedResponses || h.inlined_responses);
    if (ir) return Array.isArray(ir) ? ir : (ir.inlinedResponses || ir.inlined_responses || []);
  }
  return null;
}

// Chạy 1 lô trên 1 model bằng 1 key. requests: [{ parts, opts }]. Trả về mảng { json, model, usage } | Error.
async function runBatch(model, requests, key, { maxWaitMs, label = 'cham-bai' } = {}) {
  const body = JSON.stringify({
    batch: {
      display_name: `${label}-${Date.now()}`,
      input_config: {
        requests: {
          requests: requests.map((r, i) => ({ request: buildRequest(model, r.parts, r.opts), metadata: { key: `r${i}` } })),
        },
      },
    },
  });
  if (Buffer.byteLength(body) > BATCH_MAX_BYTES) { const e = new Error('lô quá lớn'); e.fallback = true; throw e; }
  const created = await postJson(`${API}/${model}:batchGenerateContent`, key, body, 120_000);
  if (!created.ok || created.body.error) {
    const err = apiError(model, created.status, created.body);
    if (created.status === 429 || isQuotaError(err)) { keys.markLimited(key, model, err.retryDelaySec, err.message); err.nextKey = true; throw err; }
    // Key chưa bật thanh toán / không hỗ trợ batch → đánh dấu RIÊNG key này 6 tiếng, thử key khác
    if (created.status === 400 || created.status === 403 || /FAILED_PRECONDITION|PERMISSION/i.test(String(err.message))) {
      keys.markBatchOff(key, 6);
      console.warn(`[gemini] Batch không dùng được với key ${keys.mask(key)} (${String(err.message).slice(0, 100)})`);
      err.nextKey = true;
    }
    throw err;
  }
  const name = created.body.name || (created.body.metadata && created.body.metadata.name);
  if (!name) { const e = new Error('không có tên lô'); e.fallback = true; throw e; }
  console.log(`[gemini] Đã gửi lô ${name} (${model}, key ${keys.mask(key)}, ${requests.length} yêu cầu) — chờ kết quả`);

  const t0 = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, BATCH_POLL_MS));
    const r = await apiGet(name, key).catch(() => null);
    if (!r || !r.ok) continue;
    const b = r.body;
    const st = batchState(b);
    if (/SUCCEEDED/.test(st)) {
      const list = batchResponses(b);
      if (!list) { const e = new Error(`lô ${name} xong nhưng không đọc được kết quả`); e.fallback = true; throw e; }
      const byKey = new Map(list.map((x, i) => [(x.metadata && x.metadata.key) || `r${i}`, x]));
      keys.markOk(key);
      console.log(`[gemini] Lô ${name} xong sau ${Math.round((Date.now() - t0) / 1000)}s`);
      return requests.map((_, i) => {
        const x = byKey.get(`r${i}`);
        if (!x || x.error || !x.response) return new Error(`${model}: lô trả lỗi ${JSON.stringify((x && x.error) || 'không có').slice(0, 200)}`);
        try { return { ...parseResponse(model, x.response), key: keys.mask(key) }; } catch (e) { return e; }
      });
    }
    if (/FAILED|CANCELLED|EXPIRED/.test(st)) { const e = new Error(`lô ${name}: ${st}`); e.fallback = true; throw e; }
    if (Date.now() - t0 > maxWaitMs) {
      await postJson(`${API.replace('/models', '')}/${name}:cancel`, key, '{}', 60_000).catch(() => {});
      const e = new Error(`lô ${name} quá ${Math.round(maxWaitMs / 60000)} phút chưa xong — huỷ, gọi thường`);
      e.fallback = true;
      throw e;
    }
  }
}

// Chạy nhiều request: ưu tiên Batch (rẻ 50%) trên key hỗ trợ, lỗi thì gọi thường (vẫn xoay key/model).
// requests: [{ parts, opts, models }]. Trả về mảng kiểu Promise.allSettled ({ status, value | reason }).
async function generateJsonMulti(requests, { batch = true, maxWaitMin } = {}) {
  const realtime = () => Promise.allSettled(requests.map((r) => generateJson(r.models, r.parts, r.opts)));
  if (!batch || process.env.GEMINI_BATCH === '0') return realtime();
  const maxWaitMs = (Number(maxWaitMin || process.env.GEMINI_BATCH_MAX_WAIT_MIN) || 180) * 60_000;
  for (const model of requests[0].models) {
    for (let key = keys.batchKey(model); key; key = keys.batchKey(model)) {
      try {
        const out = await runBatch(model, requests, key, { maxWaitMs });
        // Request nào trong lô lỗi → gọi thường riêng request đó
        return Promise.all(out.map(async (v, i) => {
          if (!(v instanceof Error)) return { status: 'fulfilled', value: v };
          console.warn(`[gemini] ${v.message} → gọi thường yêu cầu này`);
          try { return { status: 'fulfilled', value: await generateJson(requests[i].models, requests[i].parts, requests[i].opts) }; } catch (e) { return { status: 'rejected', reason: e }; }
        }));
      } catch (err) {
        if (err.nextKey) continue; // key này hết lượt / không hỗ trợ batch → key khác
        if (err.fallback) { console.warn(`[gemini] ${err.message}`); return realtime(); }
        if (!isRetryableModelError(err)) throw err;
        console.warn(`[gemini] lô trên ${model} lỗi (${String(err.message).slice(0, 120)}) → thử model tiếp theo`);
        break;
      }
    }
  }
  return realtime();
}

module.exports = { generateJson, generateJsonMulti, generateOnce, isRetryableModelError, isQuotaError, isKeyError, batchEnabled, apiGet };
