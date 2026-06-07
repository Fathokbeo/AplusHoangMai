import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Users } from 'lucide-react';

export default function ClassManagement() {
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    api.get('/admin/classes').then((r) => setClasses(r.data));
  }, []);

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
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
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
              </tr>
            ))}
            {classes.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có lớp học nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
