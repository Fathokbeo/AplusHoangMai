import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { toast } from '../../components/Toast';
import { KeyRound, Plus, Trash2, Eye, EyeOff, ShieldCheck, RefreshCw, Bot } from 'lucide-react';

// Trang "AI chấm bài": kho API key Gemini. Thêm nhiều key cùng lúc; hệ thống tự đổi key / đổi model mạnh
// khi một key chạm giới hạn. Key luôn hiển thị dạng che — server không bao giờ trả key đầy đủ.
type ModelState = { model: string; until: number | null; reason: string | null };
type KeyRow = {
  id: number | null; source: 'db' | 'env'; label: string; masked: string; active: boolean; calls: number;
  last_ok?: number | null; bad?: { until: number; reason: string } | null; models: ModelState[];
  last_error?: { at: number; model: string | null; message: string } | null;
};

const hhmm = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

function keyStatus(k: KeyRow, models: string[]) {
  if (!k.active) return { text: 'Đang tắt', cls: 'badge-gray' };
  if (k.bad) return { text: 'Key lỗi', cls: 'badge-red' };
  const limited = k.models.filter((m) => m.until).length;
  if (models.length && limited >= models.length) return { text: 'Hết lượt mọi model', cls: 'badge-orange' };
  if (limited) return { text: `Hết lượt ${limited}/${models.length} model`, cls: 'badge-orange' };
  return { text: 'Sẵn sàng', cls: 'badge-green' };
}

export default function AiKeys() {
  const [data, setData] = useState<{ models: string[]; keys: KeyRow[] } | null>(null);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = () => api.get('/admin/ai-keys').then((r) => setData(r.data)).catch(() => toast.error('Không tải được danh sách key'));
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // trạng thái hết lượt / dùng lại được thay đổi theo thời gian
    return () => clearInterval(t);
  }, []);

  const add = async () => {
    if (!text.trim()) { toast.error('Dán ít nhất 1 key'); return; }
    setSaving(true);
    try {
      const { data: r } = await api.post('/admin/ai-keys', { keys: text, label });
      toast.success(r.message);
      setText(''); setLabel('');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Không thêm được key');
    } finally { setSaving(false); }
  };

  const toggle = async (k: KeyRow) => {
    await api.put(`/admin/ai-keys/${k.id}`, { active: !k.active });
    load();
  };

  const remove = async (k: KeyRow) => {
    if (!confirm(`Xoá key ${k.masked}${k.label ? ` (${k.label})` : ''}? Không hoàn tác được.`)) return;
    await api.delete(`/admin/ai-keys/${k.id}`);
    toast.success('Đã xoá key');
    load();
  };

  const testAll = async () => {
    setTesting(true);
    try {
      const { data: r } = await api.post('/admin/ai-keys/test');
      const map: Record<string, { ok: boolean; message: string }> = {};
      (r.results || []).forEach((x: any) => { map[x.masked] = { ok: x.ok, message: x.message }; });
      setTests(map);
      const bad = (r.results || []).filter((x: any) => !x.ok).length;
      if (bad) toast.error(`${bad} key không dùng được`); else toast.success('Tất cả key đều dùng được');
      load();
    } catch { toast.error('Không kiểm tra được'); } finally { setTesting(false); }
  };

  const models = data?.models || [];
  const keys = data?.keys || [];
  const ready = keys.filter((k) => k.active && !k.bad && k.models.some((m) => !m.until)).length;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={22} /> AI chấm bài</h1>
        <button className="btn btn-ghost btn-sm" onClick={testAll} disabled={testing || !keys.length}>
          <ShieldCheck size={14} /> {testing ? 'Đang kiểm tra...' : 'Kiểm tra tất cả key'}
        </button>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: 16, fontSize: '0.85rem', color: '#555', lineHeight: 1.6 }}>
        Thêm được nhiều API key Gemini. Khi một key hết lượt (giới hạn theo phút hoặc theo ngày) hệ thống tự chuyển sang key khác;
        hết lượt ở mọi key thì chuyển sang model mạnh tiếp theo. <strong>Chỉ dùng model mạnh để chấm bài</strong>, theo thứ tự ưu tiên:
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {models.map((m, i) => <span key={m} className="badge badge-purple">{i + 1}. {m}</span>)}
        </div>
        <div style={{ marginTop: 8 }}>
          Đang có <strong>{ready}</strong>/{keys.filter((k) => k.active).length} key sẵn sàng.
          Mỗi key free tier chỉ được khoảng 20 lượt/ngày cho mỗi model (1 bài cần 2–3 lượt) — key của project đã bật thanh toán thì không bị giới hạn này và chấm theo lô rẻ hơn 50%.
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><KeyRound size={16} /> Thêm key</div>
        <textarea className="input" rows={4} placeholder={'Dán API key Gemini, mỗi key 1 dòng\n(lấy ở https://aistudio.google.com/apikey)'}
          value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 220px' }} placeholder="Ghi chú (tuỳ chọn), vd: Tài khoản cô Hương" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary" onClick={add} disabled={saving}><Plus size={15} /> {saving ? 'Đang thêm...' : 'Thêm key'}</button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Trạng thái</th>
              <th>Từng model</th>
              <th>Đã gọi</th>
              <th style={{ textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => {
              const st = keyStatus(k, models);
              const t = tests[k.masked];
              return (
                <tr key={`${k.source}-${k.id ?? i}-${k.masked}`} style={{ opacity: k.active ? 1 : 0.55 }}>
                  <td>
                    <code style={{ fontSize: '0.82rem' }}>{k.masked}</code>
                    <div style={{ fontSize: '0.74rem', color: '#999' }}>
                      {k.label || (k.source === 'env' ? 'Biến môi trường (.env / Render)' : 'Không ghi chú')}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${st.cls}`} style={{ whiteSpace: 'nowrap' }}>{st.text}</span>
                    {k.bad && <div style={{ fontSize: '0.72rem', color: '#C62828', marginTop: 3, maxWidth: 260 }}>{k.bad.reason}</div>}
                    {t && <div style={{ fontSize: '0.72rem', color: t.ok ? '#2E7D32' : '#C62828', marginTop: 3, maxWidth: 260 }}>Kiểm tra: {t.message}</div>}
                  </td>
                  <td style={{ fontSize: '0.74rem' }}>
                    {k.active ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {k.models.map((m) => (
                          <span key={m.model} style={{ color: m.until ? '#E65100' : '#2E7D32', whiteSpace: 'nowrap' }}>
                            {m.until ? '⏳' : '✓'} {m.model}{m.until ? ` — ${m.reason}, dùng lại lúc ${hhmm(m.until)}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{k.calls || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {k.source === 'db' && k.id != null ? (
                        <>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggle(k)} title={k.active ? 'Tạm tắt key' : 'Bật lại key'}>
                            {k.active ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => remove(k)} title="Xoá key"><Trash2 size={14} /></button>
                        </>
                      ) : <span style={{ fontSize: '0.72rem', color: '#aaa' }}>Sửa trong .env</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && keys.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có API key nào — AI chưa chấm bài được</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#999', display: 'flex', alignItems: 'center', gap: 4 }}>
        <RefreshCw size={11} /> Trạng thái tự làm mới mỗi 30 giây. Số lượt gọi tính từ lần khởi động server gần nhất.
      </div>
    </div>
  );
}
