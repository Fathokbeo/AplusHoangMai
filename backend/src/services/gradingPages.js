// Chuẩn bị TRANG bài làm cho AI chấm + vẽ kết quả chấm lên ảnh bài làm.
//
// 1) preparePages(): mọi file học sinh nộp (ảnh JPG/PNG/WEBP, PDF nhiều trang) → danh sách TRANG ảnh JPEG
//    đánh số 1..N theo thứ tự nộp. Ảnh điện thoại được xoay đúng chiều theo EXIF, thu nhỏ vừa đủ đọc.
//    AI nhận đúng các ảnh này (kèm nhãn "TRANG k") nên tọa độ AI trả về khớp với ảnh ta vẽ lên.
// 2) renderGradedPages(): vẽ lên từng trang theo THỨ TỰ ĐÚNG (AI sắp xếp lại nếu học sinh chụp lộn trang):
//    ✓ xanh / ~ cam / ✗ đỏ cạnh từng ý kèm điểm, khoanh + gạch đỏ chỗ sai kèm số thứ tự lỗi,
//    điểm tổng ở đầu trang đầu. Lưu JPEG vào uploads/graded.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const MAX_EDGE = 2000;       // cạnh dài tối đa của 1 trang gửi AI (đủ đọc chữ viết tay, không quá tốn token)
const PDF_RENDER_WIDTH = 1600;
const GRADED_DIR = path.join(__dirname, '../../uploads/graded');

// Font cho chữ vẽ lên ảnh: chọn font hệ thống ĐỦ dấu tiếng Việt (ể, ọ, ấ...). Máy chủ không có font
// nào như vậy → chữ trên ảnh tự bỏ dấu (vẫn đọc được, không hiện ô vuông). Thêm font: đặt file .ttf
// vào thư mục trong biến GRADING_FONT_DIR.
const VI_FONTS = ['Arial', 'Segoe UI', 'DejaVu Sans', 'Noto Sans', 'Liberation Sans', 'Roboto', 'Open Sans', 'Ubuntu', 'Tahoma'];
let FONT = null;
try {
  if (process.env.GRADING_FONT_DIR) GlobalFonts.loadFontsFromDir(process.env.GRADING_FONT_DIR);
  const have = new Set(GlobalFonts.families.map((f) => f.family));
  FONT = VI_FONTS.find((f) => have.has(f)) || null;
} catch { FONT = null; }
const FONT_CSS = FONT ? `"${FONT}"` : 'sans-serif';
// Không có font tiếng Việt → bỏ dấu ("Điểm" → "Diem")
const txt = (s) => (FONT ? String(s) : String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'));

// ── EXIF orientation (ảnh chụp điện thoại) ────────────────────────────────────────────
function jpegOrientation(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xff) return 1;
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString('ascii', off + 4, off + 8) === 'Exif') {
      const t = off + 10; // đầu TIFF header
      const le = buf.toString('ascii', t, t + 2) === 'II';
      const r16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const r32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const ifd = t + r32(t + 4);
      const n = r16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > buf.length) break;
        if (r16(e) === 0x0112) return r16(e + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1; // tới dữ liệu ảnh rồi
    off += 2 + len;
  }
  return 1;
}

// Vẽ ảnh lên canvas đã xoay theo EXIF + thu nhỏ để cạnh dài ≤ maxEdge. Trả về canvas.
function drawOriented(img, orientation, maxEdge) {
  const swap = orientation >= 5 && orientation <= 8;
  const srcW = img.width, srcH = img.height;
  const outW0 = swap ? srcH : srcW, outH0 = swap ? srcW : srcH;
  const k = Math.min(1, maxEdge / Math.max(outW0, outH0));
  const W = Math.round(outW0 * k), H = Math.round(outH0 * k);
  const c = createCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  const dw = srcW * k, dh = srcH * k;
  // Bảng biến đổi chuẩn theo giá trị EXIF Orientation (W,H = kích thước ảnh sau khi xoay)
  const T = {
    2: [-1, 0, 0, 1, W, 0], 3: [-1, 0, 0, -1, W, H], 4: [1, 0, 0, -1, 0, H],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, W, 0], 7: [0, -1, -1, 0, W, H], 8: [0, -1, 1, 0, 0, H],
  }[orientation];
  if (T) g.transform(...T);
  g.drawImage(img, 0, 0, dw, dh);
  return c;
}

async function renderPdfPages(filePath) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const shot = await parser.getScreenshot({ desiredWidth: PDF_RENDER_WIDTH, imageBuffer: true, imageDataUrl: false });
    const out = [];
    for (const pg of shot.pages) {
      const img = await loadImage(Buffer.from(pg.data));
      out.push({ page: pg.pageNumber, canvas: drawOriented(img, 1, MAX_EDGE) });
    }
    return out;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// filePaths: các file bài nộp theo thứ tự học sinh tải lên.
// Trả về [{ index (1..N), file (tên file gốc), filePage (trang trong file, 1-based), width, height, jpeg (Buffer) }]
async function preparePages(filePaths) {
  const pages = [];
  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();
    if (ext === '.pdf') {
      for (const p of await renderPdfPages(fp)) {
        pages.push({ file: path.basename(fp), filePage: p.page, canvas: p.canvas });
      }
    } else {
      const buf = fs.readFileSync(fp);
      const img = await loadImage(buf);
      const orient = (ext === '.jpg' || ext === '.jpeg') ? jpegOrientation(buf) : 1;
      pages.push({ file: path.basename(fp), filePage: 1, canvas: drawOriented(img, orient, MAX_EDGE) });
    }
  }
  return pages.map((p, i) => ({
    index: i + 1,
    file: p.file,
    filePage: p.filePage,
    width: p.canvas.width,
    height: p.canvas.height,
    jpeg: p.canvas.toBuffer('image/jpeg', 88),
  }));
}

// ── Vẽ kết quả chấm ───────────────────────────────────────────────────────────────────
const COLORS = { correct: '#1B8A2E', partial: '#E07000', wrong: '#D50000', missing: '#D50000' };

// box_2d chuẩn Gemini: [ymin, xmin, ymax, xmax] theo thang 0..1000 → pixel. Sai định dạng → null.
function boxToRect(box, W, H) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => Number.isFinite(Number(v)))) return null;
  let [y0, x0, y1, x1] = box.map((v) => Math.max(0, Math.min(1000, Number(v))));
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 - y0 < 3 || x1 - x0 < 3) return null;
  return { x: (x0 / 1000) * W, y: (y0 / 1000) * H, w: ((x1 - x0) / 1000) * W, h: ((y1 - y0) / 1000) * H };
}

function drawCheck(g, x, y, s, color) {
  g.save();
  g.strokeStyle = color; g.lineWidth = Math.max(3, s * 0.14); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y + s * 0.55); g.lineTo(x + s * 0.38, y + s * 0.9); g.lineTo(x + s, y + s * 0.1); g.stroke();
  g.restore();
}
function drawCross(g, x, y, s, color) {
  g.save();
  g.strokeStyle = color; g.lineWidth = Math.max(3, s * 0.14); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + s * 0.1, y + s * 0.1); g.lineTo(x + s * 0.9, y + s * 0.9);
  g.moveTo(x + s * 0.9, y + s * 0.1); g.lineTo(x + s * 0.1, y + s * 0.9); g.stroke();
  g.restore();
}
function drawPartial(g, x, y, s, color) {
  g.save();
  g.strokeStyle = color; g.lineWidth = Math.max(3, s * 0.13); g.lineCap = 'round';
  g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x + s * 0.25, y + s * 0.5); g.lineTo(x + s * 0.75, y + s * 0.5); g.stroke();
  g.restore();
}
function label(g, raw, x, y, size, color) {
  const text = txt(raw);
  g.save();
  g.font = `bold ${Math.round(size)}px ${FONT_CSS}`;
  const w = g.measureText(text).width;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(x - 3, y - size * 0.95, w + 6, size * 1.25);
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.restore();
  return w;
}
const fmt = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

// pages: kết quả preparePages. final: { page_order, items[] } đã chuẩn hóa (xem aiGrading.normalizeResult).
// opts: { prefix (tên file), score, maxScore }. Trả về [{ name, page (chỉ số trang gốc), file, filePage }].
async function renderGradedPages(pages, final, opts = {}) {
  if (!pages || pages.length === 0) return [];
  fs.mkdirSync(GRADED_DIR, { recursive: true });
  const order = Array.isArray(final.page_order) ? final.page_order : pages.map((p) => p.index);
  const out = [];
  for (let k = 0; k < order.length; k++) {
    const page = pages.find((p) => p.index === order[k]);
    if (!page) continue;
    const img = await loadImage(page.jpeg);
    const W = img.width, H = img.height;
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    const s = Math.max(26, Math.round(Math.min(W, H) * 0.035)); // cỡ dấu ✓/✗
    const fs1 = Math.max(18, Math.round(s * 0.62));            // cỡ chữ nhãn

    // Điểm tổng ở đầu trang đầu tiên (như giáo viên ghi điểm)
    if (k === 0 && opts.score != null) {
      label(g, `Điểm: ${fmt(opts.score)}/${fmt(opts.maxScore)}`, 16, fs1 * 1.6 + 6, fs1 * 1.6, COLORS.wrong);
    }
    // Số trang đã sắp xếp (góc phải trên)
    label(g, `Trang ${k + 1}/${order.length}`, W - fs1 * 6.5, fs1 + 8, fs1 * 0.8, '#555');

    let errNo = 0;
    const placed = []; // tránh dấu chồng lên nhau
    for (const it of final.items || []) {
      // Gạch / khoanh chỗ sai
      for (const er of it.errors || []) {
        if (er.page !== page.index) continue;
        const r = boxToRect(er.box_2d, W, H);
        if (!r) continue;
        errNo += 1;
        er.mark_no = errNo; // để danh sách lý do ghi "(1)", "(2)"... khớp số trên ảnh
        g.save();
        g.strokeStyle = COLORS.wrong; g.lineWidth = Math.max(3, s * 0.1);
        // khoanh đỏ (elip) quanh chỗ sai — không gạch đè lên chữ để vẫn đọc được bài làm
        g.beginPath();
        g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + s * 0.35, r.h / 2 + s * 0.3, 0, 0, Math.PI * 2);
        g.stroke();
        // gạch chân dưới chỗ sai
        g.beginPath(); g.moveTo(r.x, r.y + r.h + s * 0.45); g.lineTo(r.x + r.w, r.y + r.h + s * 0.45); g.stroke();
        // số thứ tự lỗi trong vòng tròn
        const cx = Math.max(s * 0.5, r.x - s * 0.95), cy = Math.max(s * 0.5, r.y);
        g.fillStyle = COLORS.wrong; g.beginPath(); g.arc(cx, cy, s * 0.42, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `bold ${Math.round(s * 0.5)}px ${FONT_CSS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(errNo), cx, cy + 1);
        g.restore();
        if (er.note) {
          const note = String(er.note).slice(0, 70);
          const ty = Math.min(H - 6, r.y + r.h + s * 0.45 + fs1 * 1.15);
          label(g, `(${errNo}) ${note}`, Math.max(4, Math.min(r.x, W - fs1 * 0.5 * note.length - 40)), ty, fs1 * 0.8, COLORS.wrong);
        }
      }
      // Dấu đúng/sai + điểm của ý
      if (it.page !== page.index) continue;
      const r = boxToRect(it.box_2d, W, H);
      if (!r) continue;
      const color = COLORS[it.status] || COLORS.partial;
      let x = Math.min(W - s * 4.6, r.x + r.w + s * 0.4);
      let y = Math.max(s * 0.2, r.y);
      while (placed.some((p) => Math.abs(p.x - x) < s * 3 && Math.abs(p.y - y) < s * 1.1)) y += s * 1.15;
      placed.push({ x, y });
      if (it.status === 'correct') drawCheck(g, x, y, s, color);
      else if (it.status === 'partial') drawPartial(g, x, y, s, color);
      else drawCross(g, x, y, s, color);
      label(g, `${it.short || ''} ${fmt(it.points)}/${fmt(it.max_points)}`.trim(), x + s * 1.15, y + s * 0.78, fs1, color);
    }

    const name = `${opts.prefix || 'graded'}_${k + 1}.jpg`;
    fs.writeFileSync(path.join(GRADED_DIR, name), c.toBuffer('image/jpeg', 85));
    out.push({ name, page: page.index, file: page.file, filePage: page.filePage });
  }
  return out;
}

// Xóa các ảnh đã chấm cũ (danh sách tên file JSON hoặc mảng).
function removeGradedFiles(raw) {
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { list = null; } }
  const pages = Array.isArray(list) ? list : (list && Array.isArray(list.pages) ? list.pages : []);
  pages.forEach((p) => {
    const name = typeof p === 'string' ? p : p && p.name;
    if (!name || name.includes('/') || name.includes('\\')) return;
    const f = path.join(GRADED_DIR, name);
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  });
}

// Ảnh bài đã chấm gửi cho HỌC SINH: chỉ danh sách ảnh (bỏ phần đối chiếu nội bộ giữa các lần chấm AI).
function gradedPagesForStudent(raw) {
  try {
    const o = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    const pages = o && Array.isArray(o.pages) ? o.pages : [];
    return pages.length ? JSON.stringify({ pages }) : null;
  } catch { return null; }
}

module.exports = { preparePages, renderGradedPages, removeGradedFiles, gradedPagesForStudent, boxToRect, GRADED_DIR };
