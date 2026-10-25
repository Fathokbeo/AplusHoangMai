import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TeachingOverview from '../../components/TeachingOverview';
import { greeting, givenName, todayLabel } from '../../components/overviewUi';

// Trang "Tổng quát" của giáo viên: việc trong ngày, bài sắp đến hạn và các lớp đang dạy.
export default function TeacherOverview() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(' ');

  const onLoad = (ov: any) => {
    const parts: string[] = [];
    const today = (ov.today || []).length;
    parts.push(today ? `Hôm nay có ${today} bài đến hạn` : 'Hôm nay không có bài nào đến hạn');
    const toGrade = (ov.classes || []).reduce((s: number, c: any) => s + (c.to_grade || 0), 0);
    if (toGrade > 0) parts.push(`${toGrade} bài nộp đang chờ chấm`);
    setSummary(parts.join(' · ') + '.');
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#C62828', fontWeight: 600, textTransform: 'capitalize' }}>{todayLabel()}</div>
        <h1 className="page-title" style={{ margin: '2px 0 0' }}>{greeting()}, {givenName(user?.full_name)}!</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.9rem' }}>{summary}</p>
      </div>
      <TeachingOverview onLoad={onLoad} />
    </div>
  );
}
