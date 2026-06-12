import { useState, useEffect } from 'react';

// Trả về true khi màn hình ở cỡ điện thoại (mặc định <= 640px).
// Dùng để điều chỉnh các bố cục viết bằng inline-style (CSS media query không ghi đè được inline).
export default function useIsMobile(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return isMobile;
}
