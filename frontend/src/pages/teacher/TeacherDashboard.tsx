import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, Users, School, Plus, Edit, Trash2, ChevronRight } from 'lucide-react';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = () => api.get('/teacher/my-courses').then((r) => setCourses(r.data));

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '' });
    setFile(null);
    setPreview('');
    setModal(true);
  };

  const openEdit = (c: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(c);
    setForm({ title: c.title, description: c.description || '' });
    setFile(null);
    setPreview(c.thumbnail ? `/uploads/courses/${c.thumbnail}` : '');
    setModal(true);
  };

  const saveCourse = async () => {
    if (!form.title) { toast.error('Cần tiêu đề khóa học'); return; }
    setLoading(true);
    try {
      let courseId: number;
      if (editing) {
        await api.put(`/teacher/courses/${editing.id}`, { title: form.title, description: form.description });
        courseId = editing.id;
        toast.success('Đã cập nhật');
      } else {
        const { data } = await api.post('/teacher/courses', { title: form.title, description: form.description });
        courseId = data.id;
        toast.success('Đã tạo khóa học');
      }
      if (file) {
        const fd = new FormData();
        fd.append('thumbnail', file);
        await api.post(`/teacher/courses/${courseId}/thumbnail`, fd);
      }
      setModal(false);
      fetchCourses();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi tạo khóa học');
    } finally {
      setLoading(false);
    }
  };

  const deleteCourse = async (c: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xóa khóa học "${c.title}"?\n\nTất cả lớp học trong khóa cùng bài giảng, bài tập, bài nộp sẽ bị xóa. Học sinh chỉ thuộc các lớp này sẽ bị xóa vĩnh viễn (tài khoản + dữ liệu). Không thể khôi phục.`)) return;
    await api.delete(`/teacher/courses/${c.id}`);
    toast.success('Đã xóa');
    fetchCourses();
  };

  const totalClasses = courses.reduce((s, c) => s + (c.class_count || 0), 0);
  const totalStudents = courses.reduce((s, c) => s + (c.student_count || 0), 0);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Xin chào, {user?.full_name}</h1>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.88rem' }}>Quản lý khóa học và lớp học của bạn</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Tạo khóa học
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: '2rem' }}>
        {[
          { label: 'Khóa học', value: courses.length, icon: BookOpen, color: '#C62828', bg: '#FFEBEE' },
          { label: 'Lớp học', value: totalClasses, icon: School, color: '#1565C0', bg: '#E3F2FD' },
          { label: 'Tổng học sinh', value: totalStudents, icon: Users, color: '#2E7D32', bg: '#E8F5E9' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: bg }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <div className="stat-value" style={{ color }}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Courses */}
      <h2 className="section-title">Khóa học của tôi</h2>
      {courses.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#999' }}>
          <BookOpen size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>Chưa có khóa học nào. <button className="btn btn-outline btn-sm" onClick={openCreate} style={{ marginLeft: 8 }}>Tạo ngay</button></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {courses.map((c) => (
            <div key={c.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.11)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; }}
            >
              {c.thumbnail ? (
                <img src={`/uploads/courses/${c.thumbnail}`} alt={c.title} style={{ width: '100%', height: 130, objectFit: 'cover' }} />
              ) : (
                <div style={{ height: 100, background: 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={30} color="rgba(255,255,255,0.8)" />
                </div>
              )}
              <div style={{ padding: '1rem' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 700, color: '#1A1A2E' }}>{c.title}</h3>
                {c.description && <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#888', lineHeight: 1.4 }}>{c.description}</p>}
                <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: '#999', borderTop: '1px solid #F5F5F5', paddingTop: 10, marginTop: 10, marginBottom: 10 }}>
                  <span><School size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{c.class_count || 0} lớp</span>
                  <span><Users size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{c.student_count || 0} học sinh</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link to={`/teacher/courses/${c.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                    <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                      Vào khóa học <ChevronRight size={13} />
                    </button>
                  </Link>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={(e) => openEdit(c, e)} title="Sửa">
                    <Edit size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={(e) => deleteCourse(c, e)} title="Xóa">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Chỉnh sửa khóa học' : 'Tạo khóa học mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={saveCourse} disabled={loading}>
              {loading ? 'Đang lưu...' : editing ? 'Lưu' : 'Tạo'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="label">Tiêu đề khóa học *</label>
          <input className="input" placeholder="vd: Toán lớp 7" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Mô tả</label>
          <textarea className="input" placeholder="Mô tả khóa học..." value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
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
