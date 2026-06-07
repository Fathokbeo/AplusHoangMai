import { useState, useEffect } from 'react';
import PublicLayout from '../../components/PublicLayout';
import api from '../../lib/api';
import { Award, Calendar } from 'lucide-react';

export default function Achievements() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/public/achievements').then((r) => setItems(r.data)).catch(() => {}); }, []);

  return (
    <PublicLayout>
      <div style={{ background: 'linear-gradient(135deg, #E65100, #BF360C)', padding: '3rem 2rem', textAlign: 'center', color: 'white' }}>
        <Award size={40} style={{ marginBottom: 12 }} />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Kinh nghiệm & Thành tích</h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.85)' }}>Hành trình phát triển của trung tâm qua các năm</p>
      </div>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>Chưa có thông tin thành tích</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {items.map((a, i) => (
              <div key={a.id} style={{
                background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                display: 'flex', flexDirection: i % 2 === 0 ? 'row' : 'row-reverse', flexWrap: 'wrap',
              }}>
                {a.image && (
                  <img src={`/uploads/achievements/${a.image}`} alt={a.title} style={{ width: 320, maxWidth: '100%', height: 220, objectFit: 'cover', flex: '1 1 280px' }} />
                )}
                <div style={{ padding: '1.5rem', flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {a.year && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#E65100', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>
                      <Calendar size={18} /> {a.year}
                    </div>
                  )}
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#1A1A2E' }}>{a.title}</h3>
                  {a.description && <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', lineHeight: 1.6 }}>{a.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
