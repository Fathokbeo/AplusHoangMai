import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from '../components/Toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) { toast.error('Vui lòng nhập đầy đủ thông tin'); return; }
    setLoading(true);
    try {
      await login(username, password);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'teacher') navigate('/teacher');
      else navigate('/student');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'fixed', top: -100, right: -100, width: 400, height: 400, background: 'rgba(198,40,40,0.08)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -150, left: -100, width: 500, height: 500, background: 'rgba(21,101,192,0.08)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420 }} className="fade-in">
        {/* Logo card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: 20,
          padding: '2rem',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img src="/logo.jpg" alt="Logo" style={{ height: 80, borderRadius: 12, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }} />
            <h1 style={{ color: 'white', fontWeight: 800, fontSize: '1.4rem', margin: '0 0 4px' }}>
              APLUS HOÀNG MAI
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', margin: 0 }}>
              Trung Tâm Giáo Dục
            </p>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: '1.5rem' }} />

          <h2 style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 1.25rem', textAlign: 'center' }}>
            Đăng nhập hệ thống
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" style={{ color: 'rgba(255,255,255,0.7)' }}>Tên đăng nhập</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input
                  className="input"
                  style={{ paddingLeft: 36, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="label" style={{ color: 'rgba(255,255,255,0.7)' }}>Mật khẩu</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  style={{ paddingLeft: 36, paddingRight: 40, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex', alignItems: 'center' }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: 8, justifyContent: 'center', background: '#C62828', letterSpacing: '0.03em' }}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '1.25rem', marginBottom: 0 }}>
            © 2024 Trung Tâm Giáo Dục APLUS Hoàng Mai
          </p>
        </div>
      </div>
    </div>
  );
}
