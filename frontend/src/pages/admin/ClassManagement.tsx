import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { toast } from '../../components/Toast';
import { Users, Trash2, ChevronRight } from 'lucide-react';

export default function ClassManagement() {
  const [classes, setClasses] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => { fetchClasses(); }, []);

  const fetchClasses = () => {
    api.get('/admin/classes').then((r) => setClasses(r.data));
  };

  const deleteClass = async (e: React.MouseEvent, c: any) => {
    e.stopPropagation();
    if (!confirm(
      `Xóa lớp "${c.title}"?\n\n` +
      `Toàn bộ bài giảng, bài tập và bài nộp của lớp sẽ bị xóa. ` +
      `Học sinh CHỈ thuộc lớp này sẽ bị XÓA VĨNH VIỄN (tài khoản + dữ liệu) để tiết kiệm dữ liệu; ` +
      `học sinh còn học lớp khác chỉ bị gỡ khỏi lớp này.\nKhông thể khôi phục.`
    )) return;
    await api.delete(`/teacher/classes/${c.id}`);
    toast.success('Đã xóa');
    fetchClasses();
  };

  return (
    <div className="fade-in">
      <h1 className="page-title">Tất cả lớp học</h1>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tên lớp</th>
              <th>Khóa học</th>
              <th>Giáo viên</th>
              <th>Học sinh</th>
              <th>Ngày tạo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/teacher/classes/${c.id}`)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  {c.description && <div style={{ fontSize: '0.8rem', color: '#888' }}>{c.description}</div>}
                </td>
                <td>{c.course_title ? <span className="badge badge-blue">{c.course_title}</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                <td>{c.teacher_name}</td>
                <td>
                  <span className="badge badge-green"><Users size={11} style={{ marginRight: 4 }} />{c.student_count}</span>
                </td>
                <td style={{ color: '#888', fontSize: '0.82rem' }}>{new Date(c.created_at).toLocaleDateString('vi-VN')}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <ChevronRight size={15} color="#ccc" />
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} title="Xóa lớp" onClick={(e) => deleteClass(e, c)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có lớp học nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
