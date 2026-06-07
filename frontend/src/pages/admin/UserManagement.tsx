import { useState, useEffect } from 'react';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Plus, Edit, Trash2, Search, UserCheck, UserX, Eye, EyeOff } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

interface User {
  id: number;
  username: string;
  full_name: string;
  parent_phone: string;
  role: string;
  active: number;
  created_at: string;
  plain_password: string | null;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', parent_phone: '', role: 'student' });
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPw, setShowPw] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const r = searchParams.get('role');
    if (r) setRoleFilter(r);
    fetchUsers();
  }, []);

  useEffect(() => {
    let f = users;
    if (roleFilter !== 'all') f = f.filter((u) => u.role === roleFilter);
    if (search) f = f.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()));
    setFiltered(f);
    setSelected(new Set()); // reset selection khi đổi filter
  }, [users, search, roleFilter]);

  const fetchUsers = async () => {
    const { data } = await api.get('/admin/users');
    setUsers(data);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', password: '', full_name: '', parent_phone: '', role: 'student' });
    setModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, password: '', full_name: u.full_name, parent_phone: u.parent_phone || '', role: u.role });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.full_name || (!editing && (!form.username || !form.password))) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        const payload: any = { full_name: form.full_name, parent_phone: form.parent_phone };
        if (form.password) payload.password = form.password;
        await api.put(`/admin/users/${editing.id}`, payload);
        toast.success('Đã cập nhật tài khoản');
      } else {
        await api.post('/admin/users', form);
        toast.success('Đã tạo tài khoản');
      }
      setModal(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (u: User) => {
    await api.put(`/admin/users/${u.id}`, { active: !u.active });
    toast.success(u.active ? 'Đã vô hiệu hóa' : 'Đã kích hoạt');
    fetchUsers();
  };

  const deleteUser = async (u: User) => {
    if (!confirm(`Xóa VĨNH VIỄN tài khoản "${u.full_name}"?\nToàn bộ dữ liệu liên quan sẽ bị xóa và không thể khôi phục.`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success('Đã xóa vĩnh viễn');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Xóa VĨNH VIỄN ${ids.length} tài khoản đã chọn?\nToàn bộ dữ liệu liên quan sẽ bị xóa và không thể khôi phục.`)) return;
    try {
      const { data } = await api.post('/admin/users/bulk-delete', { ids });
      toast.success(data.message || `Đã xóa ${ids.length} tài khoản`);
      setSelected(new Set());
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.id)));
  };

  const toggleReveal = (id: number) => {
    const next = new Set(revealed);
    next.has(id) ? next.delete(id) : next.add(id);
    setRevealed(next);
  };

  const roleLabels: any = { admin: 'Admin', teacher: 'Giáo viên', student: 'Học sinh' };
  const roleBadge: any = { admin: 'badge-red', teacher: 'badge-blue', student: 'badge-green' };

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Quản lý tài khoản</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Tạo tài khoản
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Tìm kiếm..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width: 'auto', minWidth: 140 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="teacher">Giáo viên</option>
          <option value="student">Học sinh</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => setShowPw(!showPw)} title={showPw ? 'Ẩn tất cả mật khẩu' : 'Hiện tất cả mật khẩu'}>
          {showPw ? <EyeOff size={15} /> : <Eye size={15} />} {showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.88rem', color: '#C62828', fontWeight: 600 }}>Đã chọn {selected.size} tài khoản</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
            <button className="btn btn-primary btn-sm" style={{ background: '#C62828' }} onClick={bulkDelete}>
              <Trash2 size={14} /> Xóa {selected.size} tài khoản
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 16, height: 16 }} />
              </th>
              <th>Họ tên</th>
              <th>Tên đăng nhập</th>
              <th>Mật khẩu</th>
              <th>SĐT Phụ huynh</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isRevealed = showPw || revealed.has(u.id);
              return (
              <tr key={u.id} style={selected.has(u.id) ? { background: '#FFF8F8' } : undefined}>
                <td>
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                </td>
                <td><strong>{u.full_name}</strong></td>
                <td style={{ color: '#888', fontFamily: 'monospace' }}>{u.username}</td>
                <td style={{ fontFamily: 'monospace', color: '#555' }}>
                  {u.plain_password ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{isRevealed ? u.plain_password : '••••••'}</span>
                      {!showPw && (
                        <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 2 }} onClick={() => toggleReveal(u.id)} title={isRevealed ? 'Ẩn' : 'Hiện'}>
                          {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </span>
                  ) : <span style={{ color: '#bbb' }}>—</span>}
                </td>
                <td style={{ color: '#888' }}>{u.parent_phone || '—'}</td>
                <td><span className={`badge ${roleBadge[u.role]}`}>{roleLabels[u.role]}</span></td>
                <td>
                  <span className={`badge ${u.active ? 'badge-green' : 'badge-gray'}`}>
                    {u.active ? 'Hoạt động' : 'Vô hiệu'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Sửa" onClick={() => openEdit(u)}><Edit size={14} /></button>
                    <button className="btn btn-ghost btn-sm btn-icon" title={u.active ? 'Vô hiệu hóa' : 'Kích hoạt'} onClick={() => toggleActive(u)}>
                      {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Xóa vĩnh viễn" style={{ color: '#C62828' }} onClick={() => deleteUser(u)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            )})}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Không có tài khoản nào</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo tài khoản'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="label">Họ và tên *</label>
          <input className="input" placeholder="Nguyễn Văn A" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        {!editing && (
          <div className="form-group">
            <label className="label">Tên đăng nhập *</label>
            <input className="input" placeholder="vd: nguyenvana" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
        )}
        <div className="form-group">
          <label className="label">{editing ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu *'}</label>
          <input className="input" type="text" placeholder="Mật khẩu" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">SĐT Phụ huynh</label>
          <input className="input" type="tel" placeholder="vd: 0912 345 678" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
        </div>
        {!editing && (
          <div className="form-group">
            <label className="label">Vai trò *</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="student">Học sinh</option>
              <option value="teacher">Giáo viên</option>
            </select>
          </div>
        )}
      </Modal>
    </div>
  );
}
