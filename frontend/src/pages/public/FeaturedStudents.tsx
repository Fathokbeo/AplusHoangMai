import { useState, useEffect } from 'react';
import PublicLayout from '../../components/PublicLayout';
import api from '../../lib/api';
import { Trophy, Award } from 'lucide-react';

export default function FeaturedStudents() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/public/featured-students').then((r) => setItems(r.data)).catch(() => {}); }, []);

  return (
    <PublicLayout>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #C62828, #8E0000)', padding: '3rem 2rem', textAlign: 'center', color: 'white' }}>
        <Trophy size={40} style={{ marginBottom: 12 }} />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Học sinh tiêu biểu</h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.85)' }}>Những gương mặt xuất sắc đạt điểm cao trong các kỳ thi</p>
      </div>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>Chưa có thông tin học sinh tiêu biểu</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {items.map((s) => (
              <div key={s.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                {s.image ? (
                  <img src={`/uploads/featured_students/${s.image}`} alt={s.name} style={{ width: '100%', height: 240, objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: 240, background: 'linear-gradient(135deg, #FFEBEE, #FFCDD2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trophy size={48} color="#C62828" />
                  </div>
                )}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{s.name}</h3>
                  {s.exam && <span className="badge badge-red" style={{ marginBottom: 8 }}>{s.exam}</span>}
                  {s.achievement && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#C62828', fontWeight: 700, fontSize: '0.95rem', margin: '8px 0' }}>
                      <Award size={16} /> {s.achievement}
                    </div>
                  )}
                  {s.description && <p style={{ margin: 0, fontSize: '0.85rem', color: '#777', lineHeight: 1.5 }}>{s.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
