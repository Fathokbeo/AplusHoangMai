import { useState, useEffect } from 'react';
import PublicLayout from '../../components/PublicLayout';
import FacebookIcon from '../../components/FacebookIcon';
import api from '../../lib/api';
import { GraduationCap, UserCircle, Phone } from 'lucide-react';

function StaffGrid({ list }: { list: any[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
      {list.map((s) => (
        <div key={s.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
          {s.image ? (
            <img src={`/uploads/staff/${s.image}`} alt={s.name} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
          ) : (
            <div style={{ height: 220, background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCircle size={56} color="#1565C0" />
            </div>
          )}
          <div style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800, color: '#1A1A2E' }}>{s.name}</h3>
            {s.role_title && <div style={{ color: '#1565C0', fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>{s.role_title}</div>}
            {s.description && <p style={{ margin: 0, fontSize: '0.83rem', color: '#777', lineHeight: 1.5 }}>{s.description}</p>}
            {(s.phone || s.facebook_url) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {s.phone && (
                  <a href={`tel:${String(s.phone).replace(/[^+\d]/g, '')}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                    <Phone size={13} /> {s.phone}
                  </a>
                )}
                {s.facebook_url && (
                  <a href={s.facebook_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                    <FacebookIcon size={13} /> Facebook
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OurTeachers() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/public/staff').then((r) => setItems(r.data)).catch(() => {}); }, []);

  const teachers = items.filter((s) => s.staff_type !== 'assistant');
  const assistants = items.filter((s) => s.staff_type === 'assistant');

  return (
    <PublicLayout>
      <div style={{ background: 'linear-gradient(135deg, #1565C0, #0D47A1)', padding: '3rem 2rem', textAlign: 'center', color: 'white' }}>
        <GraduationCap size={40} style={{ marginBottom: 12 }} />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Đội ngũ Giáo viên & Trợ giảng</h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.85)' }}>Tận tâm, giàu kinh nghiệm, đồng hành cùng học sinh</p>
      </div>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem', background: 'white', borderRadius: 12 }}>Chưa có thông tin đội ngũ</div>
        ) : (
          <>
            {teachers.length > 0 && (
              <>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1A1A2E', marginBottom: '1.25rem' }}>Giáo viên</h2>
                <StaffGrid list={teachers} />
              </>
            )}
            {assistants.length > 0 && (
              <>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1A1A2E', margin: '2.5rem 0 1.25rem' }}>Trợ giảng</h2>
                <StaffGrid list={assistants} />
              </>
            )}
          </>
        )}
      </section>
    </PublicLayout>
  );
}
