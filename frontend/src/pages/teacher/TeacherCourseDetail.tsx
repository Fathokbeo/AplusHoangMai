import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { ArrowLeft, School, Users, BookOpen, Plus, Trash2, ChevronRight } from 'lucide-react';

export default function TeacherCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchCourse(); }, [courseId]);

  const fetchCourse = async () => {
    try {
      const { data } = await api.get(`/teacher/courses/${courseId}`);
      setCourse(data);
    } catch {
      toast.error('Không thể tải khóa học');
      navigate('/teacher');
    }
  };

  const createClass = async () => {
    if (!form.title) { toast.error('Cần tiêu đề lớp học'); return; }
    setLoading(true);
    try {
      await api.post(`/teacher/courses/${courseId}/classes`, { title: form.title, description: form.description });
      toast.success('Đã tạo lớp học');
      setModal(false);
      setForm({ title: '', description: '' });
      fetchCourse();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const deleteClass = async (cls: any) => {
    if (!confirm(`Xóa lớp "${cls.title}"?`)) return;
    await api.delete(`/teacher/classes/${cls.id}`);
    toast.success('Đã xóa lớp học');
    fetchCourse();
  };

  if (!course) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#999' }}>Đang tải...</div>
  );

  const classes: any[] = course.classes || [];

  return (
    <div className="fade-in">
      {/* Back */}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher')} style={{ marginBottom: '1rem', gap: 6 }}>
        <ArrowLeft size={15} /> Quay lại
      </button>

      {/* Course header */}
      <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '1.5rem' }}>
        {course.thumbnail ? (
          <img src={`/uploads/courses/${course.thumbnail}`} alt={course.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
        ) : (
          <div style={{ height: 140, background: 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={40} color="rgba(255,255,255,0.8)" />
          </div>
        )}
        <div style={{ padding: '1.25rem' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: '#1A1A2E' }}>{course.title}</h1>
          {course.description && <p style={{ margin: '0 0 12px', color: '#666', fontSize: '0.9rem' }}>{course.description}</p>}
          <div style={{ display: 'flex', gap: 16, fontSize: '0.83rem', color: '#888' }}>
            <span><School size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{classes.length} lớp học</span>
            <span><Users size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{classes.reduce((s: number, c: any) => s + (c.student_count || 0), 0)} học sinh</span>
          </div>
        </div>
      </div>

      {/* Classes header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1A1A2E' }}>Các lớp học</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
          <Plus size={14} /> Thêm lớp
        </button>
      </div>

      {classes.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#999' }}>
          <School size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ marginBottom: 12 }}>Chưa có lớp học nào trong khóa này</div>
          <button className="btn btn-outline btn-sm" onClick={() => setModal(true)}>Tạo lớp đầu tiên</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {classes.map((cls: any) => (
            <div key={cls.id} className="card" style={{ padding: '1rem', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, background: '#FFEBEE', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <School size={18} color="#C62828" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '0.93rem', fontWeight: 700, color: '#1A1A2E' }}>{cls.title}</h3>
                  {cls.description && <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#888', lineHeight: 1.4 }}>{cls.description}</p>}
                  <div style={{ display: 'flex', gap: 10, fontSize: '0.76rem', color: '#aaa' }}>
                    <span><Users size={11} style={{ verticalAlign: 'middle' }} /> {cls.student_count}</span>
                    <span><BookOpen size={11} style={{ verticalAlign: 'middle' }} /> {cls.lesson_count}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <Link to={`/teacher/classes/${cls.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                  <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                    Quản lý <ChevronRight size={13} />
                  </button>
                </Link>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteClass(cls)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Thêm lớp học"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={createClass} disabled={loading}>
              {loading ? 'Đang tạo...' : 'Tạo lớp'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="label">Tên lớp học *</label>
          <input className="input" placeholder="vd: Lớp Toán 7A" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Mô tả</label>
          <textarea className="input" placeholder="Mô tả lớp học..." value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </div>
      </Modal>
    </div>
  );
}
