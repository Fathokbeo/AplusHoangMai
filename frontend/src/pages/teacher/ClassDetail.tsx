import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import VideoPlayer from '../../components/VideoPlayer';
import PartsEditor from '../../components/PartsEditor';
import useIsMobile from '../../lib/useIsMobile';
import { toast } from '../../components/Toast';
import { sortByVietnameseName, matchesNameSearch } from '../../lib/vietnameseName';
import { emptyPartsConfig, normalizePartsConfig, computeMaxScore, anyPartEnabled, type PartsConfig, PART_LABELS, PART_ORDER, type PartKey } from '../../lib/homeworkParts';
import {
  Users, BookOpen, ClipboardList, Edit, Trash2,
  UserPlus, UserMinus, Play, File, ChevronLeft, Upload, Clock, Eye, Bot, Layers, Video, Search,
  ChevronDown, ChevronRight
} from 'lucide-react';

// Badge hiển thị các phần đã bật của một bài tập (từ parts_config)
function partBadges(raw: any) {
  const cfg = normalizePartsConfig(raw);
  const active = PART_ORDER.filter((k: PartKey) => (k === 'essay' ? cfg.essay.enabled : (cfg as any)[k].enabled));
  if (active.length === 0) return null;
  return active.map((k) => {
    const count = k === 'essay' ? null : (cfg as any)[k].count;
    return <span key={k} className="badge badge-purple">{PART_LABELS[k]}{count ? ` ×${count}` : ''}</span>;
  });
}

export default function ClassDetail() {
  const { id } = useParams();
  const [cls, setCls] = useState<any>(null);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'students' | 'content'>('content');
  const [lessonModal, setLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [hwModal, setHwModal] = useState(false);
  const [editingHw, setEditingHw] = useState<any>(null);
  const [chapterModal, setChapterModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<any>(null);
  const [addStudentModal, setAddStudentModal] = useState(false);
  const [viewLessonModal, setViewLessonModal] = useState(false);
  const [viewingLesson, setViewingLesson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', video_url: '', video_type: 'youtube', lesson_order: '0', chapter_id: '' });
  const [hwForm, setHwForm] = useState({ title: '', description: '', due_date: '', answer_visible_date: '', max_score: '10', grading_note: '', chapter_id: '', solution_video_url: '' });
  const [hwParts, setHwParts] = useState<PartsConfig>(emptyPartsConfig());
  const [hwFiles, setHwFiles] = useState<{ pdf?: File; answer?: File }>({});
  const [chapterForm, setChapterForm] = useState({ title: '', chapter_order: '0' });
  const [studentSearch, setStudentSearch] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [selectedStudent, setSelectedStudent] = useState('');
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [newStudent, setNewStudent] = useState({ username: '', password: '', full_name: '', parent_phone: '' });
  const pdfRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  useEffect(() => { fetchClass(); }, [id]);

  // Khi mở lớp: nếu lớp chưa dùng chương thì mở sẵn nhóm "Chưa phân chương", còn lại để thu gọn
  useEffect(() => {
    if (cls) setExpandedChapters(new Set((cls.chapters?.length || 0) === 0 ? ['orphan'] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id]);

  const fetchClass = async () => {
    const { data } = await api.get(`/teacher/classes/${id}`);
    setCls(data);
  };

  const fetchAllStudents = async () => {
    const { data } = await api.get('/teacher/all-students');
    setAllStudents(data);
  };

  // Add/remove student
  const openAddStudent = () => {
    setAddMode('new');
    setNewStudent({ username: '', password: '', full_name: '', parent_phone: '' });
    setSelectedStudent('');
    fetchAllStudents();
    setAddStudentModal(true);
  };

  const addStudent = async () => {
    setLoading(true);
    try {
      if (addMode === 'new') {
        if (!newStudent.username || !newStudent.password || !newStudent.full_name) {
          toast.error('Điền đủ họ tên, tên đăng nhập và mật khẩu'); setLoading(false); return;
        }
        await api.post(`/teacher/classes/${id}/students`, newStudent);
      } else {
        if (!selectedStudent) { toast.error('Chọn học sinh'); setLoading(false); return; }
        await api.post(`/teacher/classes/${id}/students`, { student_id: selectedStudent });
      }
      toast.success('Đã thêm học sinh vào lớp');
      setAddStudentModal(false);
      setSelectedStudent('');
      setNewStudent({ username: '', password: '', full_name: '', parent_phone: '' });
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const removeStudent = async (studentId: number, name: string) => {
    if (!confirm(`Xóa học sinh "${name}" khỏi lớp?`)) return;
    await api.delete(`/teacher/classes/${id}/students/${studentId}`);
    toast.success('Đã xóa học sinh');
    fetchClass();
  };

  // Chapter CRUD
  const openCreateChapter = () => {
    setEditingChapter(null);
    setChapterForm({ title: '', chapter_order: String(cls?.chapters?.length || 0) });
    setChapterModal(true);
  };

  const openEditChapter = (ch: any) => {
    setEditingChapter(ch);
    setChapterForm({ title: ch.title, chapter_order: String(ch.chapter_order) });
    setChapterModal(true);
  };

  const saveChapter = async () => {
    if (!chapterForm.title) { toast.error('Cần tên chương'); return; }
    setLoading(true);
    try {
      if (editingChapter) {
        await api.put(`/teacher/chapters/${editingChapter.id}`, chapterForm);
        toast.success('Đã cập nhật chương');
      } else {
        await api.post(`/teacher/classes/${id}/chapters`, chapterForm);
        toast.success('Đã thêm chương');
      }
      setChapterModal(false);
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const deleteChapter = async (chapterId: number) => {
    if (!confirm('Xóa chương này? Bài giảng và bài tập trong chương sẽ chuyển về "Chưa phân chương" (không bị xóa).')) return;
    await api.delete(`/teacher/chapters/${chapterId}`);
    toast.success('Đã xóa chương');
    fetchClass();
  };

  // Lesson CRUD
  const openCreateLesson = () => {
    setEditingLesson(null);
    setLessonForm({ title: '', description: '', video_url: '', video_type: 'youtube', lesson_order: String(cls?.lessons?.length || 0), chapter_id: '' });
    setLessonModal(true);
  };

  const openEditLesson = (l: any) => {
    setEditingLesson(l);
    setLessonForm({ title: l.title, description: l.description || '', video_url: l.video_url || '', video_type: l.video_type || 'youtube', lesson_order: String(l.lesson_order), chapter_id: l.chapter_id ? String(l.chapter_id) : '' });
    setLessonModal(true);
  };

  const saveLesson = async () => {
    if (!lessonForm.title) { toast.error('Cần tiêu đề bài giảng'); return; }
    setLoading(true);
    try {
      if (editingLesson) {
        await api.put(`/teacher/lessons/${editingLesson.id}`, lessonForm);
        toast.success('Đã cập nhật');
      } else {
        await api.post(`/teacher/classes/${id}/lessons`, lessonForm);
        toast.success('Đã thêm bài giảng');
      }
      setLessonModal(false);
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const deleteLesson = async (lessonId: number) => {
    if (!confirm('Xóa bài giảng này?')) return;
    await api.delete(`/teacher/lessons/${lessonId}`);
    toast.success('Đã xóa');
    fetchClass();
  };

  // Homework CRUD
  const openCreateHw = () => {
    setEditingHw(null);
    setHwForm({ title: '', description: '', due_date: '', answer_visible_date: '', max_score: '10', grading_note: '', chapter_id: '', solution_video_url: '' });
    setHwParts(emptyPartsConfig());
    setHwFiles({});
    setHwModal(true);
  };

  const openEditHw = (h: any) => {
    setEditingHw(h);
    setHwForm({
      title: h.title, description: h.description || '',
      due_date: h.due_date ? h.due_date.slice(0, 16) : '',
      answer_visible_date: h.answer_visible_date ? h.answer_visible_date.slice(0, 16) : '',
      max_score: String(h.max_score),
      grading_note: h.grading_note || '',
      chapter_id: h.chapter_id ? String(h.chapter_id) : '',
      solution_video_url: h.solution_video_url || '',
    });
    setHwParts(normalizePartsConfig(h.parts_config));
    setHwFiles({});
    setHwModal(true);
  };

  const saveHw = async () => {
    if (!hwForm.title) { toast.error('Cần tiêu đề bài tập'); return; }
    setLoading(true);
    try {
      const body = new FormData();
      // Nếu có cấu hình phần, thang điểm = tổng điểm các phần (tự tính)
      const effectiveMax = anyPartEnabled(hwParts) ? String(computeMaxScore(hwParts)) : hwForm.max_score;
      Object.entries({ ...hwForm, max_score: effectiveMax }).forEach(([k, v]) => body.append(k, v));
      body.append('parts_config', JSON.stringify(hwParts));
      if (hwFiles.pdf) body.append('pdf_file', hwFiles.pdf);
      if (hwFiles.answer) body.append('answer_file', hwFiles.answer);

      if (editingHw) {
        await api.put(`/homework/${editingHw.id}`, body);
        toast.success('Đã cập nhật');
      } else {
        await api.post(`/classes/${id}/homework`, body);
        toast.success('Đã thêm bài tập');
      }
      setHwModal(false);
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const deleteHw = async (hwId: number) => {
    if (!confirm('Xóa bài tập này?')) return;
    await api.delete(`/homework/${hwId}`);
    toast.success('Đã xóa');
    fetchClass();
  };

  if (!cls) return <div style={{ padding: '2rem', color: '#999', textAlign: 'center' }}>Đang tải...</div>;

  const chapters: any[] = cls.chapters || [];

  // Học sinh: tự xếp theo tên riêng (tiếng Việt) rồi lọc theo ô tìm kiếm
  const sortedStudents = sortByVietnameseName(cls.students || [], (s: any) => s.full_name || '');
  const visibleStudents = sortedStudents.filter((s: any) => matchesNameSearch(s.full_name || '', studentSearch));

  // Nội dung lớp gom theo chương (theo thứ tự); cuối là nhóm "Chưa phân chương" nếu có bài lẻ
  const lessonsAll: any[] = cls.lessons || [];
  const homeworkAll: any[] = cls.homework || [];
  const contentGroups: any[] = chapters.map((ch: any) => ({
    key: String(ch.id), chapter: ch,
    lessons: lessonsAll.filter((l: any) => l.chapter_id === ch.id),
    homework: homeworkAll.filter((h: any) => h.chapter_id === ch.id),
  }));
  const orphanLessons = lessonsAll.filter((l: any) => !l.chapter_id || !chapters.some((c: any) => c.id === l.chapter_id));
  const orphanHomework = homeworkAll.filter((h: any) => !h.chapter_id || !chapters.some((c: any) => c.id === h.chapter_id));
  if (orphanLessons.length || orphanHomework.length) {
    contentGroups.push({ key: 'orphan', chapter: null, lessons: orphanLessons, homework: orphanHomework });
  }

  const toggleChapter = (key: string) => setExpandedChapters((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderLessonCard = (l: any, i: number) => (
    <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem' }}>
      <div style={{ width: 36, height: 36, background: '#E3F2FD', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{i + 1}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.title}</div>
        {l.description && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{l.description}</div>}
        {l.video_url && (
          <span className="badge badge-blue" style={{ marginTop: 6 }}>
            <Play size={10} style={{ marginRight: 4 }} />
            {l.video_type === 'youtube' ? 'YouTube' : l.video_type === 'local' ? 'Video nội bộ' : 'Video URL'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {l.video_url && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setViewingLesson(l); setViewLessonModal(true); }}>
            <Play size={13} /> Xem
          </button>
        )}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditLesson(l)}><Edit size={14} /></button>
        <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteLesson(l.id)}><Trash2 size={14} /></button>
      </div>
    </div>
  );

  const renderHomeworkCard = (h: any) => (
    <div key={h.id} className="card" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, background: '#F3E5F5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ClipboardList size={18} color="#6A1B9A" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>{h.title}</div>
          {h.description && <div style={{ fontSize: '0.82rem', color: '#888', marginBottom: 8 }}>{h.description}</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.78rem', color: '#888' }}>
            <span>Thang điểm: <strong style={{ color: '#1A1A2E' }}>{h.max_score}</strong></span>
            {h.due_date && <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> HH: {new Date(h.due_date).toLocaleString('vi-VN')}</span>}
            {h.pdf_file && <span className="badge badge-orange"><File size={10} style={{ marginRight: 3 }} />Có đề</span>}
            {h.answer_file && <span className="badge badge-green"><Eye size={10} style={{ marginRight: 3 }} />Có đáp án</span>}
            {h.solution_video_url && <span className="badge badge-red"><Video size={10} style={{ marginRight: 3 }} />Video chữa</span>}
            {partBadges(h.parts_config)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link to={`/teacher/homework/${h.id}`} className="btn btn-secondary btn-sm"><Eye size={13} /> Xem bài</Link>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditHw(h)}><Edit size={14} /></button>
          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteHw(h.id)}><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );

  // Một chương dạng accordion: bấm để mở/đóng, mở ra mới thấy bài giảng & bài tập
  const renderChapterAccordion = (group: any, idx: number) => {
    const open = expandedChapters.has(group.key);
    const lc = group.lessons.length, hc = group.homework.length;
    return (
      <div key={group.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div onClick={() => toggleChapter(group.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem', cursor: 'pointer' }}>
          {open ? <ChevronDown size={18} color="#888" /> : <ChevronRight size={18} color="#888" />}
          <div style={{ width: 36, height: 36, background: group.chapter ? '#E3F2FD' : '#F5F5F5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {group.chapter ? <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{idx + 1}</span> : <Layers size={16} color="#999" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: group.chapter ? '#1A1A2E' : '#777' }}>{group.chapter ? group.chapter.title : 'Chưa phân chương'}</div>
            <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>{lc} bài giảng · {hc} bài tập</div>
          </div>
          {group.chapter && (
            <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditChapter(group.chapter)}><Edit size={14} /></button>
              <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteChapter(group.chapter.id)}><Trash2 size={14} /></button>
            </div>
          )}
        </div>
        {open && (
          <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #F0F0F0' }}>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><BookOpen size={14} color="#1565C0" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài giảng ({lc})</span></div>
              {lc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài giảng</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.lessons.map((l: any, i: number) => renderLessonCard(l, i))}</div>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><ClipboardList size={14} color="#6A1B9A" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài tập ({hc})</span></div>
              {hc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài tập</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.homework.map((h: any) => renderHomeworkCard(h))}</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    { key: 'students', label: `Học sinh (${cls.students?.length || 0})`, icon: Users },
    { key: 'content', label: `Nội dung (${chapters.length} chương)`, icon: Layers },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem' }}>
        <Link to="/teacher" style={{ color: '#888', textDecoration: 'none', display: 'flex', alignItems: 'center', marginTop: 4 }}>
          <ChevronLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {cls.course_title && <span className="badge badge-blue">{cls.course_title}</span>}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{cls.title}</h1>
          {cls.description && <p style={{ color: '#888', margin: '4px 0 0', fontSize: '0.88rem' }}>{cls.description}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1.5rem', width: isMobile ? '100%' : 'fit-content', flexWrap: 'wrap' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as any)} className="btn"
            style={{ background: activeTab === key ? 'white' : 'transparent', boxShadow: activeTab === key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: activeTab === key ? '#C62828' : '#888', border: 'none', gap: 6 }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Students tab */}
      {activeTab === 'students' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Tìm học sinh (tên đệm, tên riêng...)"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={openAddStudent}><UserPlus size={15} /> Thêm học sinh</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Số điện thoại</th><th></th></tr></thead>
              <tbody>
                {visibleStudents.map((s: any, i: number) => (
                  <tr key={s.id}>
                    <td style={{ color: '#999' }}>{i + 1}</td>
                    <td><strong>{s.full_name}</strong></td>
                    <td style={{ color: '#888', fontFamily: 'monospace' }}>{s.username}</td>
                    <td style={{ color: '#888' }}>{s.parent_phone || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => removeStudent(s.id, s.full_name)}>
                        <UserMinus size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!cls.students || cls.students.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có học sinh</td></tr>
                )}
                {cls.students?.length > 0 && visibleStudents.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Không tìm thấy học sinh phù hợp</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content tab: danh sách chương → mở chương ra mới thấy bài giảng & bài tập */}
      {activeTab === 'content' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={openCreateChapter}><Layers size={15} /> Thêm chương</button>
            <button className="btn btn-secondary" onClick={openCreateLesson}><BookOpen size={15} /> Thêm bài giảng</button>
            <button className="btn btn-primary" onClick={openCreateHw}><ClipboardList size={15} /> Thêm bài tập</button>
          </div>
          {contentGroups.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>
              Chưa có nội dung. Hãy thêm chương, bài giảng hoặc bài tập.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contentGroups.map((g, i) => renderChapterAccordion(g, i))}
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      <Modal open={addStudentModal} onClose={() => setAddStudentModal(false)} title="Thêm học sinh vào lớp"
        footer={<><button className="btn btn-ghost" onClick={() => setAddStudentModal(false)}>Hủy</button><button className="btn btn-primary" onClick={addStudent} disabled={loading}>{loading ? 'Đang lưu...' : addMode === 'new' ? 'Tạo & thêm vào lớp' : 'Thêm vào lớp'}</button></>}>
        {/* Toggle chế độ */}
        <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10, marginBottom: '1rem' }}>
          <button className="btn" style={{ flex: 1, background: addMode === 'new' ? 'white' : 'transparent', boxShadow: addMode === 'new' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: addMode === 'new' ? '#C62828' : '#888', border: 'none' }} onClick={() => setAddMode('new')}>
            <UserPlus size={14} /> Tạo tài khoản mới
          </button>
          <button className="btn" style={{ flex: 1, background: addMode === 'existing' ? 'white' : 'transparent', boxShadow: addMode === 'existing' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', color: addMode === 'existing' ? '#C62828' : '#888', border: 'none' }} onClick={() => setAddMode('existing')}>
            <Users size={14} /> Chọn có sẵn
          </button>
        </div>

        {addMode === 'new' ? (
          <>
            <div className="form-group">
              <label className="label">Họ và tên *</label>
              <input className="input" placeholder="Nguyễn Văn A" value={newStudent.full_name} onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Tên đăng nhập *</label>
              <input className="input" placeholder="nguyenvana" value={newStudent.username} onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Mật khẩu *</label>
              <input className="input" type="text" placeholder="Mật khẩu" value={newStudent.password} onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Số điện thoại</label>
              <input className="input" type="tel" placeholder="vd: 0912 345 678 (tùy chọn)" value={newStudent.parent_phone} onChange={(e) => setNewStudent({ ...newStudent, parent_phone: e.target.value })} />
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="label">Chọn học sinh đã có</label>
            <select className="input" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
              <option value="">-- Chọn học sinh --</option>
              {allStudents.filter((s) => !cls.students?.find((x: any) => x.id === s.id)).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.username})</option>
              ))}
            </select>
          </div>
        )}
      </Modal>

      {/* Chapter Modal */}
      <Modal open={chapterModal} onClose={() => setChapterModal(false)} title={editingChapter ? 'Sửa chương' : 'Thêm chương'}
        footer={<><button className="btn btn-ghost" onClick={() => setChapterModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveChapter} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">Tên chương *</label>
          <input className="input" placeholder="vd: Chương 1 — Hàm số bậc nhất" value={chapterForm.title} onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Thứ tự</label>
          <input className="input" type="number" min={0} value={chapterForm.chapter_order} onChange={(e) => setChapterForm({ ...chapterForm, chapter_order: e.target.value })} />
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>Số nhỏ hiển thị trước. Các chương sắp xếp theo thứ tự này.</div>
        </div>
      </Modal>

      {/* Lesson Modal */}
      <Modal open={lessonModal} onClose={() => setLessonModal(false)} title={editingLesson ? 'Sửa bài giảng' : 'Thêm bài giảng'}
        footer={<><button className="btn btn-ghost" onClick={() => setLessonModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveLesson} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">Tiêu đề *</label>
          <input className="input" placeholder="Tên bài giảng" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Chương</label>
          <select className="input" value={lessonForm.chapter_id} onChange={(e) => setLessonForm({ ...lessonForm, chapter_id: e.target.value })}>
            <option value="">— Chưa phân chương —</option>
            {chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Mô tả</label>
          <textarea className="input" rows={2} value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Loại video</label>
          <select className="input" value={lessonForm.video_type} onChange={(e) => setLessonForm({ ...lessonForm, video_type: e.target.value, video_url: '' })}>
            <option value="youtube">YouTube</option>
            <option value="url">URL trực tiếp</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">Link video</label>
          <input className="input" placeholder={lessonForm.video_type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'} value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} />
        </div>
        {lessonForm.video_url && (
          <div style={{ marginBottom: '1rem', borderRadius: 8, overflow: 'hidden' }}>
            <VideoPlayer url={lessonForm.video_url} type={lessonForm.video_type as any} />
          </div>
        )}
        <div className="form-group">
          <label className="label">Thứ tự</label>
          <input className="input" type="number" min={0} value={lessonForm.lesson_order} onChange={(e) => setLessonForm({ ...lessonForm, lesson_order: e.target.value })} />
        </div>
      </Modal>

      {/* View Lesson Modal */}
      <Modal open={viewLessonModal} onClose={() => setViewLessonModal(false)} title={viewingLesson?.title || ''} size="xl">
        {viewingLesson?.video_url && (
          <>
            <VideoPlayer url={viewingLesson.video_url} type={viewingLesson.video_type} />
            {viewingLesson.description && <p style={{ color: '#555', marginTop: 12, lineHeight: 1.6 }}>{viewingLesson.description}</p>}
          </>
        )}
      </Modal>

      {/* Homework Modal */}
      <Modal open={hwModal} onClose={() => setHwModal(false)} title={editingHw ? 'Sửa bài tập' : 'Thêm bài tập về nhà'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setHwModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveHw} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">Tiêu đề *</label>
          <input className="input" placeholder="Tên bài tập" value={hwForm.title} onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Chương</label>
          <select className="input" value={hwForm.chapter_id} onChange={(e) => setHwForm({ ...hwForm, chapter_id: e.target.value })}>
            <option value="">— Chưa phân chương —</option>
            {chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Mô tả / Hướng dẫn</label>
          <textarea className="input" rows={3} value={hwForm.description} onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Kiểu nộp bài</label>
          <div style={{ fontSize: '0.75rem', color: '#888', margin: '2px 0 10px' }}>
            Chọn các phần học sinh sẽ làm. Thứ tự khi làm bài: Trắc nghiệm → Đúng/Sai → Trả lời ngắn → Tự luận.
            Trắc nghiệm/Đúng-Sai/Trả lời ngắn được <strong>chấm tự động</strong> theo đáp án &amp; điểm bạn đặt; phần tự luận do AI chấm theo file đáp án.
          </div>
          <PartsEditor value={hwParts} onChange={setHwParts} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="label">Thang điểm</label>
            <input className="input" type="number" min={1}
              value={anyPartEnabled(hwParts) ? computeMaxScore(hwParts) : hwForm.max_score}
              disabled={anyPartEnabled(hwParts)}
              title={anyPartEnabled(hwParts) ? 'Tự tính theo tổng điểm các phần' : ''}
              onChange={(e) => setHwForm({ ...hwForm, max_score: e.target.value })} />
            {anyPartEnabled(hwParts) && <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Tự tính = tổng điểm các phần.</div>}
          </div>
          <div className="form-group">
            <label className="label">Hạn nộp bài</label>
            <input className="input" type="datetime-local" value={hwForm.due_date} onChange={(e) => setHwForm({ ...hwForm, due_date: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Thời gian xem đáp án</label>
          <input className="input" type="datetime-local" value={hwForm.answer_visible_date} onChange={(e) => setHwForm({ ...hwForm, answer_visible_date: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Link video chữa bài (YouTube)</label>
          <input className="input" placeholder="https://youtube.com/watch?v=..." value={hwForm.solution_video_url} onChange={(e) => setHwForm({ ...hwForm, solution_video_url: e.target.value })} />
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Video size={12} /> Học sinh sẽ xem được video chữa cùng lúc với đáp án (theo "Thời gian xem đáp án").
          </div>
        </div>
        {hwForm.solution_video_url && (
          <div style={{ marginBottom: '1rem', borderRadius: 8, overflow: 'hidden' }}>
            <VideoPlayer url={hwForm.solution_video_url} type="youtube" />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="label">File đề bài (PDF)</label>
            <div className="dropzone" style={{ padding: '1rem' }} onClick={() => pdfRef.current?.click()}>
              {hwFiles.pdf ? <span style={{ color: '#2E7D32', fontSize: '0.85rem' }}>✓ {hwFiles.pdf.name}</span> : <span style={{ fontSize: '0.82rem' }}><Upload size={16} style={{ verticalAlign: 'middle' }} /> Chọn PDF đề</span>}
            </div>
            <input ref={pdfRef} type="file" accept=".pdf" hidden onChange={(e) => { if (e.target.files?.[0]) setHwFiles({ ...hwFiles, pdf: e.target.files[0] }); }} />
            {editingHw?.pdf_file && !hwFiles.pdf && <div style={{ fontSize: '0.75rem', color: '#2E7D32', marginTop: 4 }}>✓ Đã có file đề</div>}
          </div>
          <div className="form-group">
            <label className="label">File đáp án (PDF cho AI)</label>
            <div className="dropzone" style={{ padding: '1rem' }} onClick={() => answerRef.current?.click()}>
              {hwFiles.answer ? <span style={{ color: '#2E7D32', fontSize: '0.85rem' }}>✓ {hwFiles.answer.name}</span> : <span style={{ fontSize: '0.82rem' }}><Upload size={16} style={{ verticalAlign: 'middle' }} /> Chọn PDF đáp án</span>}
            </div>
            <input ref={answerRef} type="file" accept=".pdf" hidden onChange={(e) => { if (e.target.files?.[0]) setHwFiles({ ...hwFiles, answer: e.target.files[0] }); }} />
            {editingHw?.answer_file && !hwFiles.answer && <div style={{ fontSize: '0.75rem', color: '#2E7D32', marginTop: 4 }}>✓ Đã có đáp án (AI sẽ dùng file này)</div>}
          </div>
        </div>
        <div className="form-group">
          <label className="label">Ghi chú cho AI chấm bài (tùy chọn)</label>
          <textarea className="input" rows={3}
            placeholder="vd: Chỉ chấm câu 1 đến câu 5. Chấm chặt phần lập luận, mỗi bước sai trừ điểm. Ưu tiên cách giải tự luận, không chấm phần trắc nghiệm."
            value={hwForm.grading_note} onChange={(e) => setHwForm({ ...hwForm, grading_note: e.target.value })} />
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Bot size={12} /> AI sẽ chấm theo đúng hướng dẫn này (chấm phần nào, chấm theo kiểu gì). Học sinh không nhìn thấy ghi chú này.
          </div>
        </div>
      </Modal>
    </div>
  );
}
