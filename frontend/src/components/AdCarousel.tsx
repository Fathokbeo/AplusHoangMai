import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Ad {
  id: number;
  image_path: string;
  title?: string;
  link?: string;
}

interface Props {
  ads: Ad[];
}

export default function AdCarousel({ ads }: Props) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => setCurrent((c) => (c + 1) % ads.length), [ads.length]);
  const prev = () => setCurrent((c) => (c - 1 + ads.length) % ads.length);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [ads.length, next]);

  if (!ads.length) return null;

  const ad = ads[current];
  const content = (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16 }}>
      <img
        src={`/uploads/ads/${ad.image_path}`}
        alt={ad.title || 'Quảng cáo'}
        style={{ width: '100%', height: 380, objectFit: 'cover', display: 'block' }}
      />
      {ad.title && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          padding: '2rem 1.5rem 1.5rem',
          color: 'white', fontWeight: 700, fontSize: '1.2rem'
        }}>
          {ad.title}
        </div>
      )}

      {ads.length > 1 && (
        <>
          <button
            onClick={(e) => { e.preventDefault(); prev(); }}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); next(); }}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
          >
            <ChevronRight size={18} />
          </button>
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {ads.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 20 : 8, height: 8, borderRadius: 99,
                  background: i === current ? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s'
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (ad.link) {
    return <a href={ad.link} target="_blank" rel="noopener noreferrer">{content}</a>;
  }
  return content;
}
