import FacebookIcon from './FacebookIcon';

// Logo các mạng xã hội (Facebook, Instagram, TikTok, Threads) + hàng nút tròn mang màu từng app.
// Dùng cho phần Liên hệ và thẻ giáo viên / trợ giảng ở trang chủ.

export function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />
    </svg>
  );
}

export function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.84 6.84 0 0 0-.86-.05A6.33 6.33 0 0 0 5.2 20.1a6.34 6.34 0 0 0 10.86-4.43V8.68a8.16 8.16 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1.24-.1z" />
    </svg>
  );
}

export function ThreadsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
      <path d="M17.69 11.13a7.6 7.6 0 0 0-.29-.13c-.17-3.15-1.89-4.95-4.78-4.97h-.04c-1.73 0-3.17.74-4.05 2.08l1.59 1.09c.66-1 1.69-1.21 2.46-1.21h.03c.95 0 1.67.28 2.13.82.34.39.56.93.67 1.62a12.1 12.1 0 0 0-2.71-.13c-2.73.16-4.48 1.75-4.36 3.96.06 1.12.62 2.08 1.57 2.71.8.53 1.84.79 2.91.73 1.42-.08 2.53-.62 3.3-1.6.59-.75.96-1.71 1.12-2.93.68.41 1.18.94 1.46 1.58.47 1.09.5 2.88-.96 4.33-1.27 1.27-2.8 1.82-5.11 1.84-2.56-.02-4.5-.84-5.76-2.44-1.18-1.5-1.79-3.67-1.81-6.44.02-2.77.63-4.94 1.81-6.44 1.26-1.6 3.2-2.42 5.76-2.44 2.58.02 4.55.85 5.86 2.45.64.79 1.12 1.78 1.44 2.93l1.86-.5c-.39-1.43-1.01-2.66-1.85-3.69C17.25 1.97 14.83.98 11.73.96h-.01c-3.09.02-5.47 1.02-7.06 2.98C3.24 5.68 2.51 8.1 2.49 11.15v.01c.02 3.05.75 5.47 2.17 7.21 1.59 1.96 3.97 2.96 7.06 2.98h.01c2.75-.02 4.68-.74 6.28-2.33 2.09-2.09 2.03-4.7 1.34-6.31-.49-1.15-1.43-2.08-2.66-2.58zm-4.75 4.47c-1.15.06-2.34-.45-2.4-1.56-.04-.82.58-1.73 2.47-1.84.22-.01.43-.02.64-.02.68 0 1.32.07 1.9.19-.22 2.71-1.49 3.17-2.61 3.23z" />
    </svg>
  );
}

const BRANDS = {
  facebook: { label: 'Facebook', color: '#1877F2', Icon: FacebookIcon },
  instagram: { label: 'Instagram', color: '#E1306C', Icon: InstagramIcon },
  tiktok: { label: 'TikTok', color: '#000000', Icon: TikTokIcon },
  threads: { label: 'Threads', color: '#000000', Icon: ThreadsIcon },
} as const;
export type SocialKey = keyof typeof BRANDS;

// Hàng nút tròn có logo từng mạng xã hội (chỉ hiện mạng nào có link)
export function SocialLinks({ links, size = 34 }: { links: Partial<Record<SocialKey, string | null | undefined>>; size?: number }) {
  const list = (Object.keys(BRANDS) as SocialKey[]).filter((k) => String(links[k] || '').trim());
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {list.map((k) => {
        const { label, color, Icon } = BRANDS[k];
        return (
          <a key={k} href={String(links[k]).trim()} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}
            style={{ width: size, height: size, borderRadius: '50%', background: color, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            <Icon size={Math.round(size * 0.5)} />
          </a>
        );
      })}
    </div>
  );
}
