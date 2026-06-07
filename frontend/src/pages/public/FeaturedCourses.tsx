import { useState, useEffect } from 'react';
import PublicLayout from '../../components/PublicLayout';
import api from '../../lib/api';
import { BookOpen, Users } from 'lucide-react';

export default function FeaturedCourses() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/public/featured-courses').then((r) => setItems(r.data)).catch(() => {}); }, []);

  return (
    <PublicLayout>
      <div style={{ background: 'linear-gradient(135deg, #2E7D32, #1B5E20)', padding: '3rem 2rem', textAlign: 'center', color: 'white' }}>
        <BookOpen size={40} style={{ marginBottom: 12 }} />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Khóa học tiêu biểu</h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.85)' }}>Các khóa học thu hút đông đảo học sinh theo học</p>
      </div>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>Chưa có khóa học tiêu biểu</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {items.map((c) => (
              <div key={c.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                {c.image ? (
                  <img src={`/uploads/featured_courses/${c.image}`} alt={c.title} style={{ width: '100%', height: 170, objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: 170, background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={48} color="#2E7D32" />
                  </div>
                )}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{c.title}</h3>
                  {c.student_count && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2E7D32', fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>
                      <Users size={15} /> {c.student_count}
                    </div>
                  )}
                  {c.description && <p style={{ margin: 0, fontSize: '0.85rem', color: '#777', lineHeight: 1.5 }}>{c.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
