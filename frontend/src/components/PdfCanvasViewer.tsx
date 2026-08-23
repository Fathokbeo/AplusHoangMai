// Hiển thị PDF thuần bằng pdf.js (canvas) — KHÔNG dùng trình xem PDF gốc của trình duyệt (mỗi trình duyệt
// một kiểu thanh công cụ riêng, không tắt được và không đồng bộ được với nút phóng to/nhỏ của web).
// Mức phóng to (zoom, prop ngoài truyền vào) là HỆ SỐ nhân lên trên mức "vừa khít chiều rộng khung" —
// tự tính lại khi khung đổi kích thước (vd học sinh kéo thanh chia đề/bài làm), nên zoom luôn có ý nghĩa
// tương đối, không lệch khi đổi cỡ khung.
import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  zoom: number;
}

export default function PdfCanvasViewer({ url, zoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<any>(null);
  // Tác vụ vẽ (RenderTask) đang chạy của từng trang — phải hủy tác vụ CŨ trước khi vẽ lại cùng canvas
  // đó (đổi zoom/fitScale liên tiếp), nếu không pdf.js báo lỗi "same canvas during multiple render()".
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [fitScale, setFitScale] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Nạp file PDF khi đổi url
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setNumPages(0);
    docRef.current = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Tự tính lại "vừa khít chiều rộng" theo kích thước khung hiện tại (đổi khi kéo thanh chia panel)
  useEffect(() => {
    if (status !== 'ready' || !docRef.current || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    const recompute = async () => {
      const page = await docRef.current.getPage(1);
      if (cancelled) return;
      const naturalWidth = page.getViewport({ scale: 1 }).width;
      const available = Math.max(100, container.clientWidth - 32); // trừ padding 16px mỗi bên
      setFitScale(available / naturalWidth);
    };
    recompute();
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    return () => { cancelled = true; ro.disconnect(); };
  }, [status]);

  // Vẽ lại tất cả các trang khi có tài liệu, đổi mức "vừa khít" hoặc đổi zoom
  useEffect(() => {
    if (status !== 'ready' || !docRef.current || !containerRef.current) return;
    let cancelled = false;
    const scale = fitScale * zoom;
    const tasks = renderTasksRef.current;
    (async () => {
      const container = containerRef.current!;
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${i}"]`);
        if (!canvas) continue;
        const page = await docRef.current.getPage(i);
        if (cancelled) return;
        // Hủy lượt vẽ trước đó của đúng trang này (nếu còn đang chạy) trước khi bắt đầu lượt mới
        tasks.get(i)?.cancel();
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const task = page.render({ canvasContext: ctx, viewport });
        tasks.set(i, task);
        try {
          await task.promise;
        } catch (err: any) {
          if (err?.name !== 'RenderingCancelledException') throw err;
        }
      }
    })();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
      tasks.clear();
    };
  }, [status, numPages, fitScale, zoom]);

  if (status === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '0.85rem', flexDirection: 'column', gap: 8 }}>
        <span>Không tải được đề bài.</span>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#1565C0' }}>Mở file trong tab mới</a>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      {status === 'loading' && <div style={{ color: '#999', fontSize: '0.85rem', margin: 'auto' }}>Đang tải đề bài...</div>}
      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
        <canvas key={p} data-page={p} style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.18)', background: 'white', flexShrink: 0 }} />
      ))}
    </div>
  );
}
