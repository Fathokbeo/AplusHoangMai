// Đánh giá độ chính xác AI chấm bài so với điểm giáo viên chấm tay.
//
//   node scripts/eval-grading.js <manifest.json> [--out <thư mục kết quả>] [--models m1,m2,...] [--only tên1,tên2]
//
// manifest.json:
// {
//   "answer": "<đường dẫn file đề + hướng dẫn chấm (PDF)>",
//   "maxScore": 10,
//   "gradingNote": "",                       (tùy chọn)
//   "students": [
//     { "name": "Nguyễn Khánh An", "teacher": 7.75, "pdf": "<file bài làm>", "pages": [1,3] },  // trang 1..3 của file
//     { "name": "...", "teacher": 8.5, "files": ["a.jpg", "b.jpg"] }                           // hoặc các file ảnh
//   ]
// }
// Kết quả mỗi học sinh lưu ở <out>/results.json (chạy lại sẽ bỏ qua học sinh đã chấm xong), ảnh đã chấm
// ở uploads/graded/eval_*.jpg được chép sang <out>/graded/.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { gradeSubmission, gradingModels } = require('../src/services/aiGrading');
const { GRADED_DIR } = require('../src/services/gradingPages');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const manifestPath = args[0];
if (!manifestPath) { console.error('Thiếu manifest.json'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baseDir = path.dirname(path.resolve(manifestPath));
const rel = (p) => (path.isAbsolute(p) ? p : path.join(baseDir, p));
const outDir = path.resolve(opt('--out', path.join(baseDir, 'eval-out')));
const models = opt('--models') ? opt('--models').split(',') : null;
const only = opt('--only') ? opt('--only').split(',').map((s) => s.trim()) : null;
fs.mkdirSync(path.join(outDir, 'pages'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'graded'), { recursive: true });

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '_');

// Tách trang [from, to] của PDF bài làm thành ảnh JPEG riêng cho học sinh (giống học sinh chụp từng trang nộp lên)
async function studentFiles(st) {
  if (st.files) return st.files.map(rel);
  const dir = path.join(outDir, 'pages', slug(st.name));
  const [from, to] = st.pages;
  const want = []; for (let i = from; i <= to; i++) want.push(i);
  const done = want.map((i) => path.join(dir, `p${i}.jpg`));
  if (done.every((f) => fs.existsSync(f))) return done;
  fs.mkdirSync(dir, { recursive: true });
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const parser = new PDFParse({ data: fs.readFileSync(rel(st.pdf)) });
  const shot = await parser.getScreenshot({ partial: want, desiredWidth: 1600, imageBuffer: true, imageDataUrl: false });
  for (const pg of shot.pages) {
    const img = await loadImage(Buffer.from(pg.data));
    const c = createCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    fs.writeFileSync(path.join(dir, `p${pg.pageNumber}.jpg`), c.toBuffer('image/jpeg', 90));
  }
  await parser.destroy();
  return done;
}

const resultsPath = path.join(outDir, 'results.json');
const results = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : {};
const save = () => fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

function stats(rows, key) {
  const errs = rows.filter((r) => r[key] != null).map((r) => r[key] - r.teacher);
  if (!errs.length) return null;
  const abs = errs.map(Math.abs);
  const mae = abs.reduce((a, b) => a + b, 0) / abs.length;
  return {
    n: errs.length,
    mae: +mae.toFixed(3),
    bias: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(3),
    maxErr: +Math.max(...abs).toFixed(2),
    within025: +(abs.filter((e) => e <= 0.25 + 1e-9).length / abs.length * 100).toFixed(1),
    within05: +(abs.filter((e) => e <= 0.5 + 1e-9).length / abs.length * 100).toFixed(1),
    within1: +(abs.filter((e) => e <= 1 + 1e-9).length / abs.length * 100).toFixed(1),
    accuracy: +((1 - mae / (manifest.maxScore || 10)) * 100).toFixed(1),
  };
}

(async () => {
  const maxScore = manifest.maxScore || 10;
  console.log(`Model chấm: ${(models || gradingModels()).join(' → ')}`);
  for (const st of manifest.students) {
    if (only && !only.includes(st.name)) continue;
    if (results[st.name] && results[st.name].final != null) { console.log(`✓ (đã có) ${st.name}`); continue; }
    const files = await studentFiles(st);
    const t0 = Date.now();
    console.log(`… chấm ${st.name} (${files.length} trang)`);
    try {
      const r = await gradeSubmission(rel(manifest.answer), files, maxScore, manifest.gradingNote || '', {
        partsConfig: manifest.partsConfig || null, // null = chấm toàn bộ bài theo file đáp án (như bài cũ)
        annotatePrefix: `eval_${slug(st.name)}_${Date.now()}`,
        models,
      });
      const rv = r.marks.review;
      for (const p of r.marks.pages) fs.copyFileSync(path.join(GRADED_DIR, p.name), path.join(outDir, 'graded', `${slug(st.name)}_${p.name.split('_').pop()}`));
      results[st.name] = {
        teacher: st.teacher,
        run1: rv.run1 && rv.run1.score, run1Model: rv.run1 && rv.run1.model,
        run2: rv.run2 && rv.run2.score, run2Model: rv.run2 && rv.run2.model,
        final: r.score, finalModel: rv.final.model,
        spread: rv.spread, needsTeacher: rv.needs_teacher,
        seconds: Math.round((Date.now() - t0) / 1000),
        usage: rv.usage,
        details: r.details, comparison: rv.comparison, pageOrder: r.raw.final.page_order,
      };
      save();
      console.log(`  GV ${st.teacher} | lần1 ${results[st.name].run1} (${results[st.name].run1Model}) | lần2 ${results[st.name].run2} (${results[st.name].run2Model}) | CHỐT ${r.score} | lệch ${(r.score - st.teacher).toFixed(2)} | ${results[st.name].seconds}s`);
    } catch (err) {
      console.error(`  ✗ ${st.name}: ${err.message}`);
      results[st.name] = { teacher: st.teacher, error: err.message };
      save();
      if (err.quota) { console.error('Hết quota — dừng, chạy lại sau sẽ tiếp tục từ học sinh này.'); break; }
    }
  }

  // ── Thống kê ─────────────────────────────────────────────────────────────────────────
  const rows = manifest.students.map((s) => ({ name: s.name, ...(results[s.name] || {}), teacher: s.teacher })).filter((r) => r.final != null);
  console.log('\nHọc sinh                     | GV    | Lần 1 | Lần 2 | Chốt  | Lệch');
  rows.forEach((r) => console.log(`${r.name.padEnd(28)} | ${String(r.teacher).padEnd(5)} | ${String(r.run1 ?? '-').padEnd(5)} | ${String(r.run2 ?? '-').padEnd(5)} | ${String(r.final).padEnd(5)} | ${(r.final - r.teacher >= 0 ? '+' : '') + (r.final - r.teacher).toFixed(2)}`));
  const summary = { final: stats(rows, 'final'), run1: stats(rows, 'run1'), run2: stats(rows, 'run2') };
  // Độ chính xác theo từng model (gộp mọi lần chấm độc lập model đó thực hiện)
  const byModel = {};
  rows.forEach((r) => [['run1', r.run1Model], ['run2', r.run2Model]].forEach(([k, m]) => {
    if (!m || r[k] == null) return;
    (byModel[m] = byModel[m] || []).push({ teacher: r.teacher, v: r[k] });
  }));
  summary.byModel = Object.fromEntries(Object.entries(byModel).map(([m, arr]) => [m, stats(arr, 'v')]));
  // Token đã dùng
  const tok = { prompt: 0, output: 0, thoughts: 0, calls: 0 };
  rows.forEach((r) => (r.usage || []).forEach((u) => {
    tok.calls++; tok.prompt += u.usage.promptTokenCount || 0; tok.output += u.usage.candidatesTokenCount || 0; tok.thoughts += u.usage.thoughtsTokenCount || 0;
  }));
  summary.tokens = { ...tok, perStudent: rows.length ? { prompt: Math.round(tok.prompt / rows.length), output: Math.round((tok.output + tok.thoughts) / rows.length) } : null };
  summary.avgSeconds = rows.length ? Math.round(rows.reduce((a, r) => a + (r.seconds || 0), 0) / rows.length) : null;
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n' + JSON.stringify(summary, null, 2));
})();
