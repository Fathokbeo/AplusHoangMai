import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, X, AlertCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((msg: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = 'info') {
  addToastFn?.(message, type);
}
toast.success = (msg: string) => toast(msg, 'success');
toast.error = (msg: string) => toast(msg, 'error');
toast.info = (msg: string) => toast(msg, 'info');

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    addToastFn = (message: string, type: ToastType) => {
      const id = ++toastId;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    };
    return () => { addToastFn = null; };
  }, []);

  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const colors = { success: '#2E7D32', error: '#C62828', info: '#1565C0' };
  const icons = { success: CheckCircle, error: XCircle, info: AlertCircle };

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
      {toasts.map(({ id, message, type }) => {
        const Icon = icons[type];
        return (
          <div
            key={id}
            style={{
              background: colors[type],
              color: 'white',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.25s ease',
              maxWidth: 360,
            }}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{message}</span>
            <button
              onClick={() => remove(id)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex' }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
