// Test nộp NHIỀU file ảnh cho bài tập về nhà (không cần đáp án/AI)
const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:5000/api';

// PNG 1x1 hợp lệ (đỏ)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

async function req(method, url, { token, json, form } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body });
  const t = await res.text(); let data; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { status: res.status, data, ok: res.ok };
}

(async () => {
  const ts = Date.now();
  const adminTok = (await req('POST', '/auth/login', { json: { username: 'admin', password: 'admin123' } })).data.token;
  const gvU = `gvm_${ts}`;
  await req('POST', '/admin/users', { token: adminTok, json: { username: gvU, password: 'p', full_name: 'GV Multi', role: 'teacher' } });
  const gvTok = (await req('POST', '/auth/login', { json: { username: gvU, password: 'p' } })).data.token;
  const courseId = (await req('POST', '/teacher/courses', { token: gvTok, json: { title: 'KM_' + ts } })).data.id;
  const classId = (await req('POST', `/teacher/courses/${courseId}/classes`, { token: gvTok, json: { title: 'Lop M' } })).data.id;
  const hsId = (await req('POST', `/teacher/classes/${classId}/students`, { token: gvTok, json: { username: 'hsm_' + ts, password: 'p', full_name: 'HS Multi' } })).data.student_id;
  const hsTok = (await req('POST', '/auth/login', { json: { username: 'hsm_' + ts, password: 'p' } })).data.token;

  // Bài tập KHÔNG có đáp án → bỏ qua AI
  const hwId = (await req('POST', `/classes/${classId}/homework`, { token: gvTok, form: (() => { const f = new FormData(); f.append('title', 'BT Multi'); f.append('max_score', '10'); return f; })() })).data.id;

  // Nộp 2 file ảnh dưới field 'files'
  const fd = new FormData();
  fd.append('files', new Blob([PNG], { type: 'image/png' }), 'trang1.png');
  fd.append('files', new Blob([PNG], { type: 'image/png' }), 'trang2.png');
  const r = await req('POST', `/homework/${hwId}/submit`, { token: hsTok, form: fd });

  console.log('\n=== KẾT QUẢ NỘP 2 FILE ===');
  console.log('HTTP status:', r.status);
  console.log('Response   :', JSON.stringify(r.data));
  if (r.ok && r.data.submission) {
    console.log('submission.file_path:', r.data.submission.file_path);
    console.log('submission.files    :', r.data.submission.files);
    console.log(r.data.submission.files && JSON.parse(r.data.submission.files).length === 2 ? '✅ LƯU ĐÚNG 2 FILE' : '❌ KHÔNG LƯU ĐỦ 2 FILE');
  } else {
    console.log('❌ LỖI khi nộp — đây chính là lỗi người dùng gặp');
  }

  // cleanup
  await req('DELETE', `/admin/courses/${courseId}`, { token: adminTok });
  const ids = [hsId, (await req('GET', '/admin/users', { token: adminTok })).data.find(u => u.username === gvU)?.id].filter(Boolean);
  await req('POST', '/admin/users/bulk-delete', { token: adminTok, json: { ids } });
})().catch(e => { console.error('FATAL', e); process.exit(1); });
