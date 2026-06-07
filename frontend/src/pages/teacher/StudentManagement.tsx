import { useState, useEffect } from 'react';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Plus, Search, School, ArrowRightLeft } from 'lucide-react';

interface ClassRef { id: number; title: string; course_title: string | null; }
interface Student {
  id: number; username: string; full_name: string; parent_phone: string;
  created_at: string; classes: ClassRef[];
}

export default function StudentManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', parent_phone: '' });

  // Assign / move class modal
  const [classModal, setClassModal] = useState(false);
  const [target, setTarget] = useState<Student | null>(null);
  const [fromClassId, setFromClassId] = useState('');
  const [toClassId, setToClassId] = useState('');

  useEffect(() => { fetchStudents(); fetchClasses(); }, []);

  useEffect(() => {
    if (!search) { setFiltered(students); return; }
    const q = search.toLowerCase();
    setFiltered(students.filter((s) => s.full_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)));
  }, [students, search]);

  const fetchStudents = () => api.get('/teacher/students').then((r) => setStudents(r.data));
  const fetchClasses = () => api.get('/teacher/classes').then((r) => setClasses(r.data));

  const createStudent = async () => {
    if (!form.username || !form.password || !form.full_name) { toast.error('Điền đủ thông tin'); return; }
    setLoading(true);
    try {
      await api.post('/teacher/students', form);
      toast.success('Đã tạo học sinh');
      setModal(false);
      setForm({ username: '', password: '', full_name: '', parent_phone: '' });
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  // Mở modal chỉ định / đổi lớp
  const openClassModal = (s: Student) => {
    setTarget(s);
    setFromClassId(s.classes[0]?.id ? String(s.classes[0].id) : '');
    setToClassId('');
    setClassModal(true);
  };

  const saveClass = async () => {
    if (!target || !toClassId) { toast.error('Chọn lớp đích'); return; }
    setLoading(true);
    try {
      await api.put(`/teacher/students/${target.id}/move`, {
        from_class_id: fromClassId || null,
        to_class_id: toClassId,
      });
      toast.success(fromClassId ? 'Đã chuyển lớp' : 'Đã chỉ định lớp');
      setClassModal(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Quản lý học sinh</h1>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={16} /> Thêm học sinh</button>
      </div>

      <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: 360 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
        <input className="input" style={{ paddingLeft: 32 }} placeholder="Tìm học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Lớp học</th><th>SĐT Phụ huynh</th><th>Thao tác</th></tr></thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.id}>
                <td style={{ color: '#999' }}>{i + 1}</td>
                <td><strong>{s.full_name}</strong></td>
                <td style={{ color: '#888', fontFamily: 'monospace' }}>{s.username}</td>
                <td>
                  {s.classes && s.classes.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.classes.map((c) => (
                        <span key={c.id} className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                          {c.course_title ? `${c.course_title} · ` : ''}{c.title}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>Chưa có lớp</span>
                  )}
                </td>
                <td style={{ color: '#888' }}>{s.parent_phone || '—'}</td>
                <td>
                  {s.classes && s.classes.length > 0 ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => openClassModal(s)} title="Đổi lớp">
                      <ArrowRightLeft size={13} /> Đổi lớp
                    </button>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => openClassModal(s)} title="Chỉ định lớp">
                      <School size={13} /> Chỉ định lớp
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Không có học sinh</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Tạo học sinh */}
      <Modal open={modal} onClose={() => setModal(false)} title="Thêm học sinh mới"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button><button className="btn btn-primary" onClick={createStudent} disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo'}</button></>}>
        <div className="form-group">
          <label className="label">Họ tên *</label>
          <input className="input" placeholder="Nguyễn Văn A" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Tên đăng nhập *</label>
          <input className="input" placeholder="nguyenvana" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Mật khẩu *</label>
          <input className="input" type="text" placeholder="Mật khẩu" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">SĐT Phụ huynh</label>
          <input className="input" type="tel" placeholder="vd: 0912 345 678" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
        </div>
      </Modal>

      {/* Chỉ định / đổi lớp */}
      <Modal open={classModal} onClose={() => setClassModal(false)}
        title={target && target.classes.length > 0 ? `Đổi lớp cho ${target.full_name}` : `Chỉ định lớp cho ${target?.full_name || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setClassModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveClass} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        {target && target.classes.length > 0 && (
          <div className="form-group">
            <label className="label">Chuyển khỏi lớp</label>
            <select className="input" value={fromClassId} onChange={(e) => setFromClassId(e.target.value)}>
              <option value="">-- Giữ nguyên (chỉ thêm lớp mới) --</option>
              {target.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.course_title ? `${c.course_title} · ` : ''}{c.title}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="label">Vào lớp *</label>
          <select className="input" value={toClassId} onChange={(e) => setToClassId(e.target.value)}>
            <option value="">-- Chọn lớp --</option>
            {classes
              .filter((c) => !target?.classes.find((x) => x.id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.course_title ? `${c.course_title} · ` : ''}{c.title}</option>
              ))}
          </select>
          {classes.length === 0 && <div style={{ fontSize: '0.78rem', color: '#C62828', marginTop: 6 }}>Bạn chưa có lớp nào. Hãy tạo lớp trong khóa học trước.</div>}
        </div>
      </Modal>
    </div>
  );
}
