import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Plus, Edit, Trash2, BookOpen, School, Users, ChevronRight } from 'lucide-react';

interface Course {
  id: number;
  title: string;
  description: string;
  thumbnail: string;
  creator_name: string;
  created_by: number | null;
  class_count: number;
  active: number;
  created_at: string;
}

export default function CourseManagement() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', teacher_id: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCourses();
    api.get('/admin/users?role=teacher').then((r) => setTeachers(r.data));
  }, []);

  const fetchCourses = async () => {
    const { data } = await api.get('/admin/courses');
    setCourses(data);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', teacher_id: '' });
    setFile(null);
    setPreview('');
    setModal(true);
  };

  const openEdit = (c: Course) => {
    setEditing(c);
    // Chỉ pre-select khi khóa đang thuộc một giáo viên (created_by là GV); admin-quản-lý → bỏ trống.
    const ownedByTeacher = teachers.some((t) => t.id === c.created_by);
    setForm({ title: c.title, description: c.description || '', teacher_id: ownedByTeacher ? String(c.created_by) : '' });
    setFile(null);
    setPreview(c.thumbnail ? `/uploads/courses/${c.thumbnail}` : '');
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error('Cần tiêu đề khóa học'); return; }
    setLoading(true);
    try {
      let courseId: number;
      const payload = { title: form.title, description: form.description, teacher_id: form.teacher_id || null };
      if (editing) {
        await api.put(`/admin/courses/${editing.id}`, payload);
        courseId = editing.id;
        toast.success('Đã cập nhật');
      } else {
        const { data } = await api.post('/admin/courses', payload);
        courseId = data.id;
        toast.success('Đã tạo khóa học');
      }
      if (file) {
        const fd = new FormData();
        fd.append('thumbnail', file);
        await api.post(`/admin/courses/${courseId}/thumbnail`, fd);
      }
      setModal(false);
      fetchCourses();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const deleteCourse = async (c: Course) => {
    if (!confirm(`Xóa khóa học "${c.title}"?\n\nTất cả lớp học trong khóa cùng bài giảng, bài tập, bài nộp sẽ bị xóa. Học sinh chỉ thuộc các lớp này sẽ bị xóa vĩnh viễn (tài khoản + dữ liệu). Không thể khôi phục.`)) return;
    await api.delete(`/admin/courses/${c.id}`);
    toast.success('Đã xóa');
    fetchCourses();
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Quản lý khóa học</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Tạo khóa học
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {courses.map((c) => (
          <div key={c.id} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            {c.thumbnail ? (
              <img src={`/uploads/courses/${c.thumbnail}`} alt={c.title} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
            ) : (
              <div style={{ height: 140, background: 'linear-gradient(135deg, #C62828, #1565C0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={36} color="rgba(255,255,255,0.7)" />
              </div>
            )}
            <div style={{ padding: '1rem' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>{c.title}</h3>
              {c.description && <p style={{ margin: '0 0 10px', fontSize: '0.83rem', color: '#888', lineHeight: 1.5 }}>{c.description}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', color: '#999', marginBottom: 10 }}>
                <span><School size={12} style={{ verticalAlign: 'middle' }} /> {c.class_count} lớp</span>
                <span><Users size={12} style={{ verticalAlign: 'middle' }} /> {c.creator_name}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Link to={`/admin/courses/${c.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                  <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                    <School size={13} /> Lớp học <ChevronRight size={12} />
                  </button>
                </Link>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(c)} title="Sửa">
                  <Edit size={14} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteCourse(c)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {courses.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>
            <BookOpen size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div>Chưa có khóa học nào</div>
          </div>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Chỉnh sửa khóa học' : 'Tạo khóa học mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="label">Tiêu đề *</label>
          <input className="input" placeholder="Tên khóa học" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Mô tả</label>
          <textarea className="input" placeholder="Mô tả khóa học..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
        <div className="form-group">
          <label className="label">Giáo viên phụ trách</label>
          <select className="input" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
            <option value="">— Admin quản lý (không chỉ định) —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name} ({t.username})</option>
            ))}
          </select>
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
            Khóa học sẽ hiện trong "Khóa học của tôi" của giáo viên được chọn để họ tự quản lý.
          </div>
        </div>
        <div className="form-group">
          <label className="label">Ảnh đại diện</label>
          <div className="dropzone" onClick={() => fileRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight: 120, borderRadius: 6, objectFit: 'contain' }} />
            ) : (
              <div style={{ fontSize: '0.88rem' }}>Click để chọn ảnh</div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
          }} />
        </div>
      </Modal>
    </div>
  );
}
