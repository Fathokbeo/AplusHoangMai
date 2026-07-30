import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import VideoPlayer from '../../components/VideoPlayer';
import FileViewer from '../../components/FileViewer';
import PartsEditor from '../../components/PartsEditor';
import useIsMobile from '../../lib/useIsMobile';
import { toast } from '../../components/Toast';
import { sortByVietnameseName, matchesNameSearch, normalizeVietnamese } from '../../lib/vietnameseName';
import { parseAttachments, isViewableFile } from '../../lib/attachments';
import { emptyPartsConfig, normalizePartsConfig, computeMaxScore, anyPartEnabled, type PartsConfig, PART_LABELS, PART_ORDER, type PartKey } from '../../lib/homeworkParts';
import {
  Users, BookOpen, ClipboardList, Edit, Trash2,
  UserPlus, UserMinus, Play, File, ChevronLeft, Upload, Clock, Eye, Layers, Video, Search,
  ChevronDown, ChevronRight, Trophy, FileSpreadsheet, Download, Paperclip, FileText, X, Plus, GripVertical
} from 'lucide-react';

// Giờ nhập ở ô datetime-local là GIỜ ĐỊA PHƯƠNG. Lưu dạng ISO (UTC) để khi so "đến hạn"
// (đáp án/video mở, hạn nộp) khớp đúng múi giờ, không bị lệch.
function localInputToISO(v: string): string {
  if (!v) return '';
  const d = new Date(v); // chuỗi datetime-local được hiểu theo giờ địa phương trình duyệt
  return isNaN(d.getTime()) ? v : d.toISOString();
}
// Đổi ngược giá trị đã lưu (ISO mới, hoặc chuỗi giờ-địa-phương cũ) về giá trị cho ô datetime-local.
function isoToLocalInput(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// SĐT từ Excel: bỏ ký tự lạ; Excel hay cắt số 0 đầu của ô dạng số → tự thêm lại
function normalizePhone(v: any): string {
  let s = String(v ?? '').replace(/[^\d+]/g, '');
  if (/^\d{9}$/.test(s) && !s.startsWith('0')) s = '0' + s;
  return s;
}

// 'YYYY-MM' → 'Tháng M/YYYY' cho ô chọn tháng xếp hạng
function formatMonth(ym: string): string {
  const [y, m] = (ym || '').split('-');
  return y && m ? `Tháng ${parseInt(m)}/${y}` : ym;
}

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
  const [activeTab, setActiveTab] = useState<'students' | 'content' | 'ranking'>('content');
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
  const [hwForm, setHwForm] = useState({ title: '', description: '', due_date: '', answer_visible_date: '', max_score: '10', grading_note: '', chapter_id: '', solution_video_url: '', hw_order: '0' });
  const [hwParts, setHwParts] = useState<PartsConfig>(emptyPartsConfig());
  const [hwFiles, setHwFiles] = useState<{ pdf?: File; answer?: File }>({});
  const [chapterForm, setChapterForm] = useState({ title: '', chapter_order: '0', subject: 'algebra' as 'algebra' | 'geometry' });
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [selectedStudent, setSelectedStudent] = useState('');
  const [existingSearch, setExistingSearch] = useState('');
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [newStudent, setNewStudent] = useState({ username: '', password: '', full_name: '', parent_phone: '' });
  const pdfRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const draggedStudentId = useRef<number | null>(null);
  // Xếp hạng theo tháng
  const [ranking, setRanking] = useState<any>(null);
  const [rankingMonth, setRankingMonth] = useState('');
  const [rankingLoading, setRankingLoading] = useState(false);
  // File đính kèm bài giảng (chọn mới, chờ upload khi lưu)
  const [lessonFiles, setLessonFiles] = useState<{ doc: File[]; answer: File[] }>({ doc: [], answer: [] });
  const lessonDocRef = useRef<HTMLInputElement>(null);
  const lessonAnswerRef = useRef<HTMLInputElement>(null);
  const [viewFiles, setViewFiles] = useState<string[] | null>(null);
  // Nhập Excel tạo tài khoản hàng loạt
  const [excelModal, setExcelModal] = useState(false);
  const [excelRows, setExcelRows] = useState<any[]>([]);
  const [excelName, setExcelName] = useState('');
  const [excelResult, setExcelResult] = useState<any>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  useEffect(() => { fetchClass(); }, [id]);

  // Tải xếp hạng khi mở tab hoặc đổi tháng
  useEffect(() => {
    if (activeTab !== 'ranking') return;
    (async () => {
      setRankingLoading(true);
      try {
        const { data } = await api.get(`/teacher/classes/${id}/ranking`, { params: rankingMonth ? { month: rankingMonth } : {} });
        setRanking(data);
      } catch {
        toast.error('Lỗi tải xếp hạng');
      } finally {
        setRankingLoading(false);
      }
    })();
  }, [activeTab, rankingMonth, id]);

  // Khi mở lớp: nếu lớp chưa dùng chương thì mở sẵn nhóm "Chưa phân chương", còn lại để thu gọn
  useEffect(() => {
    if (cls) setExpandedChapters(new Set((cls.chapters?.length || 0) === 0 ? ['orphan'] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id]);

  const fetchClass = async () => {
    const { data } = await api.get(`/teacher/classes/${id}`);
    setCls(data);
    setSelectedIds(new Set()); // bỏ chọn sau mỗi lần tải lại
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
    setExistingSearch('');
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

  const toggleStudentSelect = (sid: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(sid) ? next.delete(sid) : next.add(sid);
    return next;
  });

  // Kéo thả để đổi thứ tự học sinh trong lớp — cập nhật lạc quan rồi lưu lên server.
  const reorderStudents = async (draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;
    const list = [...(cls.students || [])];
    const fromIdx = list.findIndex((s: any) => s.id === draggedId);
    const toIdx = list.findIndex((s: any) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setCls((prev: any) => ({ ...prev, students: list }));
    try {
      await api.put(`/teacher/classes/${id}/students/reorder`, { student_ids: list.map((s: any) => s.id) });
    } catch {
      toast.error('Lỗi lưu thứ tự, đang tải lại danh sách');
      fetchClass();
    }
  };

  // Xóa hàng loạt: HS chỉ thuộc lớp này bị xóa hẳn (tài khoản + dữ liệu); HS còn lớp khác chỉ gỡ khỏi lớp.
  const bulkDeleteStudents = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(
      `Xóa ${ids.length} học sinh đã chọn khỏi lớp?\n\n` +
      `• Học sinh CHỈ thuộc lớp này sẽ bị XÓA VĨNH VIỄN: tài khoản + toàn bộ bài nộp/dữ liệu (để tiết kiệm dữ liệu).\n` +
      `• Học sinh còn học lớp khác chỉ bị gỡ khỏi lớp này.\n\nKhông thể khôi phục.`
    )) return;
    try {
      const { data } = await api.post(`/teacher/classes/${id}/students/bulk-delete`, { student_ids: ids });
      toast.success(data.message || 'Đã xóa');
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi');
    }
  };

  // ── Nhập Excel tạo tài khoản hàng loạt ──────────────────────────────
  const openExcelModal = () => {
    setExcelRows([]); setExcelName(''); setExcelResult(null);
    setExcelModal(true);
  };

  // Tải file Excel mẫu: Họ và tên, Tên đăng nhập, Mật khẩu, Số điện thoại
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Họ và tên', 'Tên đăng nhập', 'Mật khẩu', 'Số điện thoại'],
      ['Nguyễn Văn An', 'nguyenvanan', '123456', '0912345678'],
      ['Trần Thị Bình', 'tranthibinh', 'abc123', ''],
    ]);
    ws['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
    XLSX.writeFile(wb, 'Mau danh sach hoc sinh.xlsx');
  };

  // Đọc file Excel: tìm dòng tiêu đề, nhận diện cột theo tên (không phân biệt hoa thường/dấu)
  const handleExcelFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      const norm = (s: any) => normalizeVietnamese(String(s ?? ''));
      const headerIdx = aoa.findIndex((r) => r.some((c) => norm(c).includes('ten dang nhap')));
      if (headerIdx < 0) {
        toast.error('Không tìm thấy dòng tiêu đề chứa cột "Tên đăng nhập". Hãy dùng file mẫu.');
        return;
      }
      const header = aoa[headerIdx].map(norm);
      const col = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      const iName = col('ho va ten', 'ho ten');
      const iUser = col('ten dang nhap');
      const iPass = col('mat khau');
      const iPhone = col('so dien thoai', 'sdt', 'dien thoai');

      const rows: any[] = aoa.slice(headerIdx + 1)
        .map((r, k) => ({
          row: headerIdx + 2 + k, // số dòng thật trong file Excel (1-based)
          full_name: String(iName >= 0 ? r[iName] ?? '' : '').trim(),
          username: String(iUser >= 0 ? r[iUser] ?? '' : '').trim(),
          password: String(iPass >= 0 ? r[iPass] ?? '' : '').trim(),
          parent_phone: normalizePhone(iPhone >= 0 ? r[iPhone] : ''),
        }))
        .filter((r) => r.full_name || r.username || r.password);

      if (rows.length === 0) { toast.error('File không có dòng dữ liệu nào'); return; }

      // Đánh dấu lỗi thấy được ngay (thiếu thông tin, trùng trong file); trùng hệ thống do server kiểm tra khi tạo
      const seen = new Set<string>();
      rows.forEach((r) => {
        if (!r.full_name || !r.username || !r.password) r.error = 'Thiếu họ tên / tên đăng nhập / mật khẩu';
        else if (seen.has(r.username)) r.error = 'Trùng tên đăng nhập trong file';
        if (r.username) seen.add(r.username);
      });

      setExcelRows(rows);
      setExcelName(file.name);
      setExcelResult(null);
    } catch {
      toast.error('Không đọc được file. Hãy chọn file Excel (.xlsx, .xls)');
    }
  };

  const importExcel = async () => {
    const valid = excelRows.filter((r) => !r.error);
    if (valid.length === 0) { toast.error('Không có dòng hợp lệ để tạo'); return; }
    setLoading(true);
    try {
      const { data } = await api.post(`/teacher/classes/${id}/students/bulk`, {
        students: valid.map(({ row, full_name, username, password, parent_phone }) => ({ row, full_name, username, password, parent_phone })),
      });
      setExcelResult(data);
      toast.success(data.message);
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi nhập danh sách');
    } finally {
      setLoading(false);
    }
  };

  // Số thứ tự mặc định kế tiếp: chương đầu = 1, sau đó nối tiếp tăng dần (vẫn sửa tay được).
  const nextOrder = (items: any[] | undefined, field: string) =>
    ((items && items.length) ? Math.max(0, ...items.map((x: any) => Number(x[field]) || 0)) : 0) + 1;

  // Số thứ tự chương kế tiếp, TÍNH RIÊNG theo môn (Đại số/Hình học độc lập nhau). excludeId: bỏ qua
  // chính chương đang sửa khi đổi môn, để không tự cộng thêm chương đó vào phép đếm.
  const nextChapterOrder = (chaptersList: any[] | undefined, subject: 'algebra' | 'geometry', excludeId?: number) =>
    nextOrder((chaptersList || []).filter((c: any) => (c.subject || 'algebra') === subject && c.id !== excludeId), 'chapter_order');

  // Bài giảng/bài tập CÙNG một chương (chapterId null/'' = nhóm "Chưa phân chương"). Dùng để đánh số
  // ĐỘC LẬP theo từng chương — bài giảng và bài tập cũng đánh số riêng, không liên quan nhau.
  const chapterScoped = (items: any[] | undefined, chapterId: any) => {
    const norm = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
    const cid = norm(chapterId);
    return (items || []).filter((x: any) => norm(x.chapter_id) === cid);
  };
  // Số thứ tự mặc định cho bài MỚI trong chương (= số bài hiện có trong chương đó + 1).
  const nextOrderInChapter = (items: any[] | undefined, chapterId: any) => chapterScoped(items, chapterId).length + 1;
  // Vị trí hiện tại của một bài trong danh sách CÙNG CHƯƠNG — luôn khớp đúng số hiển thị trên thẻ
  // ngoài giao diện (thẻ đánh số theo vị trí trong danh sách, không theo giá trị lưu trong CSDL).
  const positionInChapter = (items: any[] | undefined, chapterId: any, itemId: number) => {
    const scoped = chapterScoped(items, chapterId);
    const idx = scoped.findIndex((x: any) => x.id === itemId);
    return idx >= 0 ? idx + 1 : scoped.length + 1;
  };

  // Chapter CRUD
  const openCreateChapter = () => {
    setEditingChapter(null);
    setChapterForm({ title: '', chapter_order: String(nextChapterOrder(cls?.chapters, 'algebra')), subject: 'algebra' });
    setChapterModal(true);
  };

  const openEditChapter = (ch: any) => {
    setEditingChapter(ch);
    setChapterForm({ title: ch.title, chapter_order: String(ch.chapter_order), subject: ch.subject === 'geometry' ? 'geometry' : 'algebra' });
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

  // Lesson CRUD — truyền chapterId để form chọn sẵn chương (nút + ở từng chương)
  const openCreateLesson = (chapterId?: number) => {
    setEditingLesson(null);
    setLessonForm({ title: '', description: '', video_url: '', video_type: 'youtube', lesson_order: String(nextOrderInChapter(cls?.lessons, chapterId ?? null)), chapter_id: chapterId ? String(chapterId) : '' });
    setLessonFiles({ doc: [], answer: [] });
    setLessonModal(true);
  };

  const openEditLesson = (l: any) => {
    setEditingLesson(l);
    setLessonForm({ title: l.title, description: l.description || '', video_url: l.video_url || '', video_type: l.video_type || 'youtube', lesson_order: String(positionInChapter(cls?.lessons, l.chapter_id, l.id)), chapter_id: l.chapter_id ? String(l.chapter_id) : '' });
    setLessonFiles({ doc: [], answer: [] });
    setLessonModal(true);
  };

  // Upload các file đính kèm đã chọn (tài liệu bài giảng / đáp án BT trên lớp) cho một bài giảng
  const uploadLessonAttachments = async (lessonId: number) => {
    for (const kind of ['doc', 'answer'] as const) {
      const files = lessonFiles[kind];
      if (files.length === 0) continue;
      const body = new FormData();
      files.forEach((f) => body.append('files', f));
      body.append('kind', kind);
      await api.post(`/teacher/lessons/${lessonId}/attachments`, body);
    }
  };

  const saveLesson = async () => {
    if (!lessonForm.title) { toast.error('Cần tiêu đề bài giảng'); return; }
    setLoading(true);
    try {
      if (editingLesson) {
        await api.put(`/teacher/lessons/${editingLesson.id}`, lessonForm);
        await uploadLessonAttachments(editingLesson.id);
        toast.success('Đã cập nhật');
      } else {
        const { data } = await api.post(`/teacher/classes/${id}/lessons`, lessonForm);
        await uploadLessonAttachments(data.id);
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

  // Xóa một file đính kèm đã lưu của bài giảng đang sửa
  const deleteAttachment = async (file: string) => {
    if (!editingLesson) return;
    try {
      const { data } = await api.delete(`/teacher/lessons/${editingLesson.id}/attachments/${file}`);
      setEditingLesson({ ...editingLesson, attachments: JSON.stringify(data.attachments) });
      fetchClass();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi xóa file');
    }
  };

  // Thêm file vào danh sách chờ upload của bài giảng (gộp, loại trùng tên+kích thước)
  const addLessonFiles = (kind: 'doc' | 'answer', incoming: FileList) => {
    const arr = Array.from(incoming);
    setLessonFiles((prev) => {
      const merged = [...prev[kind]];
      arr.forEach((f) => { if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f); });
      return { ...prev, [kind]: merged.slice(0, 10) };
    });
  };

  const deleteLesson = async (lessonId: number) => {
    if (!confirm('Xóa bài giảng này?')) return;
    await api.delete(`/teacher/lessons/${lessonId}`);
    toast.success('Đã xóa');
    fetchClass();
  };

  // Homework CRUD — truyền chapterId để form chọn sẵn chương (nút + ở từng chương)
  const openCreateHw = (chapterId?: number) => {
    setEditingHw(null);
    setHwForm({
      title: '', description: '', due_date: '', answer_visible_date: '', max_score: '10', grading_note: '',
      chapter_id: chapterId ? String(chapterId) : '', solution_video_url: '',
      hw_order: String(nextOrderInChapter(cls?.homework, chapterId ?? null)),
    });
    setHwParts(emptyPartsConfig());
    setHwFiles({});
    setHwModal(true);
  };

  const openEditHw = (h: any) => {
    setEditingHw(h);
    setHwForm({
      title: h.title, description: h.description || '',
      due_date: isoToLocalInput(h.due_date),
      answer_visible_date: isoToLocalInput(h.answer_visible_date),
      max_score: String(h.max_score),
      grading_note: h.grading_note || '',
      chapter_id: h.chapter_id ? String(h.chapter_id) : '',
      solution_video_url: h.solution_video_url || '',
      hw_order: String(positionInChapter(cls?.homework, h.chapter_id, h.id)),
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
      // Thang điểm = thang giáo viên chọn (để quy đổi). Mặc định đã bám theo tổng điểm các câu.
      // Mốc thời gian: đổi giờ địa phương -> ISO để so "đến hạn" đúng múi giờ.
      Object.entries(hwForm).forEach(([k, v]) =>
        body.append(k, (k === 'due_date' || k === 'answer_visible_date') ? localInputToISO(v) : v));
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

  // Học sinh: giữ thứ tự lớp đã lưu (kéo thả), lọc theo ô tìm kiếm
  const orderedStudents = cls.students || [];
  const visibleStudents = orderedStudents.filter((s: any) => matchesNameSearch(s.full_name || '', studentSearch));
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((s: any) => selectedIds.has(s.id));
  const toggleSelectAllStudents = () => setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleStudents.map((s: any) => s.id)));

  // Học sinh có thể thêm vào lớp (chưa trong lớp), xếp theo tên riêng rồi lọc theo ô tìm kiếm trong modal thêm
  const availableStudents = sortByVietnameseName(
    (allStudents || []).filter((s: any) => !cls.students?.find((x: any) => x.id === s.id) && matchesNameSearch(s.full_name || '', existingSearch)),
    (s: any) => s.full_name || ''
  );

  // Nội dung lớp gom theo chương, tách riêng Đại số (hiển thị trước) và Hình học (sau) — mỗi môn
  // đánh số thứ tự độc lập. Cuối cùng là nhóm "Chưa phân chương" nếu có bài lẻ chưa gán chương.
  const lessonsAll: any[] = cls.lessons || [];
  const homeworkAll: any[] = cls.homework || [];
  const toChapterGroup = (ch: any) => ({
    key: String(ch.id), chapter: ch,
    lessons: lessonsAll.filter((l: any) => l.chapter_id === ch.id),
    homework: homeworkAll.filter((h: any) => h.chapter_id === ch.id),
  });
  const algebraGroups = chapters.filter((ch: any) => (ch.subject || 'algebra') === 'algebra').map(toChapterGroup);
  const geometryGroups = chapters.filter((ch: any) => ch.subject === 'geometry').map(toChapterGroup);
  const orphanLessons = lessonsAll.filter((l: any) => !l.chapter_id || !chapters.some((c: any) => c.id === l.chapter_id));
  const orphanHomework = homeworkAll.filter((h: any) => !h.chapter_id || !chapters.some((c: any) => c.id === h.chapter_id));
  const orphanGroup = (orphanLessons.length || orphanHomework.length)
    ? { key: 'orphan', chapter: null, lessons: orphanLessons, homework: orphanHomework }
    : null;

  const toggleChapter = (key: string) => setExpandedChapters((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderLessonCard = (l: any, i: number) => {
    const atts = parseAttachments(l.attachments);
    const docCount = atts.filter((a) => a.kind !== 'answer').length;
    const ansCount = atts.filter((a) => a.kind === 'answer').length;
    return (
      <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1rem 1.25rem' }}>
        <div style={{ width: 36, height: 36, background: '#E3F2FD', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, color: '#1565C0', fontSize: '0.9rem' }}>{i + 1}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.title}</div>
          {l.description && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{l.description}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {l.video_url && (
              <span className="badge badge-blue">
                <Play size={10} style={{ marginRight: 4 }} />
                {l.video_type === 'youtube' ? 'YouTube' : l.video_type === 'local' ? 'Video nội bộ' : 'Video URL'}
              </span>
            )}
            {docCount > 0 && <span className="badge badge-orange"><Paperclip size={10} style={{ marginRight: 3 }} />Tài liệu ×{docCount}</span>}
            {ansCount > 0 && <span className="badge badge-green"><FileText size={10} style={{ marginRight: 3 }} />Đáp án BT ×{ansCount}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(l.video_url || atts.length > 0) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setViewingLesson(l); setViewLessonModal(true); }}>
              <Eye size={13} /> Xem
            </button>
          )}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditLesson(l)}><Edit size={14} /></button>
          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} onClick={() => deleteLesson(l.id)}><Trash2 size={14} /></button>
        </div>
      </div>
    );
  };

  const renderHomeworkCard = (h: any, i: number) => (
    <div key={h.id} className="card" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, background: '#F3E5F5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, color: '#6A1B9A', fontSize: '0.9rem' }}>{i + 1}</span>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <BookOpen size={14} color="#1565C0" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài giảng ({lc})</span>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#1565C0', border: '1px dashed #90CAF9' }}
                  title={group.chapter ? `Thêm bài giảng vào "${group.chapter.title}"` : 'Thêm bài giảng (chưa phân chương)'}
                  onClick={() => openCreateLesson(group.chapter?.id)}>
                  <Plus size={14} />
                </button>
              </div>
              {lc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài giảng</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.lessons.map((l: any, i: number) => renderLessonCard(l, i))}</div>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <ClipboardList size={14} color="#6A1B9A" /><span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bài tập ({hc})</span>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#6A1B9A', border: '1px dashed #CE93D8' }}
                  title={group.chapter ? `Thêm bài tập vào "${group.chapter.title}"` : 'Thêm bài tập (chưa phân chương)'}
                  onClick={() => openCreateHw(group.chapter?.id)}>
                  <Plus size={14} />
                </button>
              </div>
              {hc === 0 ? <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Chưa có bài tập</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.homework.map((h: any, i: number) => renderHomeworkCard(h, i))}</div>
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
    { key: 'ranking', label: 'Xếp hạng', icon: Trophy },
  ];

  // Nhóm huy chương top 3 của tháng đang xem (đồng hạng → cùng huy chương)
  const rankedStudents: any[] = ranking?.students || [];
  const medalGroups = [
    { rank: 1, medal: '🥇', label: 'Hạng Nhất', color: '#F9A825', bg: '#FFF8E1', border: '#FFE082' },
    { rank: 2, medal: '🥈', label: 'Hạng Nhì', color: '#757575', bg: '#F5F5F5', border: '#E0E0E0' },
    { rank: 3, medal: '🥉', label: 'Hạng Ba', color: '#8D6E63', bg: '#EFEBE9', border: '#D7CCC8' },
  ].map((g) => ({ ...g, students: rankedStudents.filter((s) => s.rank === g.rank) }));

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem' }}>
        <Link to={cls.course_id_ref ? `/teacher/courses/${cls.course_id_ref}` : '/teacher'} style={{ color: '#888', textDecoration: 'none', display: 'flex', alignItems: 'center', marginTop: 4 }}>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={openExcelModal} title="Tạo tài khoản hàng loạt từ file Excel">
                <FileSpreadsheet size={15} /> Nhập Excel
              </button>
              <button className="btn btn-primary" onClick={openAddStudent}><UserPlus size={15} /> Thêm học sinh</button>
            </div>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: -6, marginBottom: 12 }}>
            {studentSearch ? 'Xóa ô tìm kiếm để kéo thả sắp xếp lại thứ tự học sinh.' : 'Kéo biểu tượng ⠿ ở đầu mỗi dòng để sắp xếp lại thứ tự học sinh.'}
          </div>

          {/* Thanh thao tác hàng loạt */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 10, padding: '0.6rem 1rem', marginBottom: 12 }}>
              <span style={{ fontSize: '0.88rem', color: '#C62828', fontWeight: 600 }}>Đã chọn {selectedIds.size} học sinh</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>
                <button className="btn btn-primary btn-sm" style={{ background: '#C62828' }} onClick={bulkDeleteStudents}>
                  <Trash2 size={14} /> Xóa {selectedIds.size} học sinh
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width: 28 }}></th>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllStudents} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                </th>
                <th>#</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Số điện thoại</th><th></th>
              </tr></thead>
              <tbody>
                {visibleStudents.map((s: any, i: number) => (
                  <tr key={s.id}
                    draggable={!studentSearch}
                    onDragStart={() => { draggedStudentId.current = s.id; }}
                    onDragOver={(e) => { if (!studentSearch) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedStudentId.current != null) reorderStudents(draggedStudentId.current, s.id);
                      draggedStudentId.current = null;
                    }}
                    style={selectedIds.has(s.id) ? { background: '#FFF8F8' } : undefined}>
                    <td style={{ textAlign: 'center', cursor: studentSearch ? 'default' : 'grab' }}
                      title={studentSearch ? 'Xóa ô tìm kiếm để kéo thả sắp xếp' : 'Kéo để đổi vị trí'}>
                      <GripVertical size={14} color={studentSearch ? '#e0e0e0' : '#bbb'} />
                    </td>
                    <td>
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudentSelect(s.id)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </td>
                    <td style={{ color: '#999' }}>{i + 1}</td>
                    <td><strong>{s.full_name}</strong></td>
                    <td style={{ color: '#888', fontFamily: 'monospace' }}>{s.username}</td>
                    <td style={{ color: '#888' }}>{s.parent_phone || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} title="Gỡ khỏi lớp" onClick={() => removeStudent(s.id, s.full_name)}>
                        <UserMinus size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!cls.students || cls.students.length === 0) && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Chưa có học sinh</td></tr>
                )}
                {cls.students?.length > 0 && visibleStudents.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Không tìm thấy học sinh phù hợp</td></tr>
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
            <button className="btn btn-secondary" onClick={() => openCreateLesson()}><BookOpen size={15} /> Thêm bài giảng</button>
            <button className="btn btn-primary" onClick={() => openCreateHw()}><ClipboardList size={15} /> Thêm bài tập</button>
          </div>
          {algebraGroups.length === 0 && geometryGroups.length === 0 && !orphanGroup ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '2rem', background: 'white', borderRadius: 12 }}>
              Chưa có nội dung. Hãy thêm chương, bài giảng hoặc bài tập.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1A1A2E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1565C0', display: 'inline-block' }} /> Đại số
                </div>
                {algebraGroups.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#aaa' }}>Chưa có chương Đại số</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {algebraGroups.map((g, i) => renderChapterAccordion(g, i))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1A1A2E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#6A1B9A', display: 'inline-block' }} /> Hình học
                </div>
                {geometryGroups.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#aaa' }}>Chưa có chương Hình học</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {geometryGroups.map((g, i) => renderChapterAccordion(g, i))}
                  </div>
                )}
              </div>
              {orphanGroup && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {renderChapterAccordion(orphanGroup, 0)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ranking tab: xếp hạng theo tháng, top 3 gắn huy chương vàng/bạc/đồng */}
      {activeTab === 'ranking' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.82rem', color: '#888', lineHeight: 1.5 }}>
              Xếp hạng theo <strong>điểm TB các bài tập trong tháng</strong> (quá hạn không nộp = 0 điểm). Sang tháng mới bảng tự reset — chọn tháng để xem lại.
            </div>
            <select className="input" style={{ width: 'auto', minWidth: 160 }} value={rankingMonth || ranking?.month || ''}
              onChange={(e) => setRankingMonth(e.target.value)}>
              {(ranking?.months || []).map((m: string) => (
                <option key={m} value={m}>{formatMonth(m)}{m === ranking?.current_month ? ' (hiện tại)' : ''}</option>
              ))}
            </select>
          </div>

          {rankingLoading && !ranking ? (
            <div style={{ padding: '2rem', color: '#999', textAlign: 'center' }}>Đang tải...</div>
          ) : (
            <>
              {/* Podium top 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {medalGroups.map((g) => (
                  <div key={g.rank} className="card" style={{ padding: '1rem 1.25rem', background: g.bg, border: `1px solid ${g.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '1.6rem' }}>{g.medal}</span>
                      <span style={{ fontWeight: 800, color: g.color, fontSize: '0.95rem' }}>{g.label}</span>
                    </div>
                    {g.students.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: '#aaa' }}>Chưa có</div>
                    ) : g.students.map((s: any) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{s.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>{s.username}</div>
                        </div>
                        <span style={{ fontWeight: 800, color: g.color, fontSize: '1.05rem' }}>{s.avg}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Bảng xếp hạng đầy đủ */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Hạng</th>
                      <th>Học sinh</th>
                      <th>Điểm TB</th>
                      <th>Số bài tính điểm</th>
                      <th>Đã có điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedStudents.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          {s.rank ? (
                            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                              {s.rank <= 3 ? <span style={{ marginRight: 4 }}>{s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : '🥉'}</span> : null}
                              {s.rank}
                            </span>
                          ) : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td><strong>{s.full_name}</strong><div style={{ fontSize: '0.78rem', color: '#999' }}>{s.username}</div></td>
                        <td>
                          {s.avg !== null
                            ? <span style={{ fontWeight: 700, color: s.avg >= 8 ? '#2E7D32' : s.avg >= 5 ? '#E65100' : '#C62828' }}>{s.avg}/10</span>
                            : <span style={{ color: '#ccc' }}>Chưa có</span>}
                        </td>
                        <td style={{ color: '#888' }}>{s.counted}</td>
                        <td style={{ color: '#888' }}>{s.graded}</td>
                      </tr>
                    ))}
                    {rankedStudents.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Lớp chưa có học sinh</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
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
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Gõ tên để tìm học sinh..."
                value={existingSearch}
                onChange={(e) => setExistingSearch(e.target.value)}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
              {availableStudents.map((s: any) => (
                <div key={s.id}
                  onClick={() => setSelectedStudent(String(s.id))}
                  style={{
                    padding: '0.5rem 0.75rem', cursor: 'pointer',
                    background: selectedStudent === String(s.id) ? '#FFEBEE' : 'transparent',
                    borderBottom: '1px solid #f5f5f5',
                  }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.full_name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#999' }}>{s.username}</div>
                </div>
              ))}
              {availableStudents.length === 0 && (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: '#999', fontSize: '0.85rem' }}>Không tìm thấy học sinh</div>
              )}
            </div>
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
          <label className="label">Phân môn</label>
          <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', padding: 4, borderRadius: 10 }}>
            {(['algebra', 'geometry'] as const).map((subj) => (
              <button key={subj} type="button" className="btn"
                style={{
                  flex: 1, border: 'none',
                  background: chapterForm.subject === subj ? 'white' : 'transparent',
                  boxShadow: chapterForm.subject === subj ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  color: chapterForm.subject === subj ? '#C62828' : '#888',
                }}
                onClick={() => setChapterForm({
                  ...chapterForm, subject: subj,
                  chapter_order: String(nextChapterOrder(cls?.chapters, subj, editingChapter?.id)),
                })}>
                {subj === 'algebra' ? 'Đại số' : 'Hình học'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="label">Thứ tự</label>
          <input className="input" type="number" min={0} value={chapterForm.chapter_order} onChange={(e) => setChapterForm({ ...chapterForm, chapter_order: e.target.value })} />
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>Số nhỏ hiển thị trước. Đại số và Hình học đánh số độc lập với nhau.</div>
        </div>
      </Modal>

      {/* Lesson Modal */}
      <Modal open={lessonModal} onClose={() => setLessonModal(false)} title={editingLesson ? 'Sửa bài giảng' : 'Thêm bài giảng'} size="lg"
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 2fr)', gap: 12 }}>
          <div className="form-group">
            <label className="label">Loại video</label>
            <select className="input" value={lessonForm.video_type} onChange={(e) => setLessonForm({ ...lessonForm, video_type: e.target.value, video_url: '' })}>
              <option value="youtube">YouTube</option>
              <option value="url">URL trực tiếp</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Link video (tùy chọn)</label>
            <input className="input" placeholder={lessonForm.video_type === 'youtube' ? 'https://youtube.com/watch?v=... (không bắt buộc)' : 'https://... (không bắt buộc)'} value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} />
          </div>
        </div>
        {lessonForm.video_url && (
          <div style={{ marginBottom: '1rem', borderRadius: 8, overflow: 'hidden' }}>
            <VideoPlayer url={lessonForm.video_url} type={lessonForm.video_type as any} />
          </div>
        )}

        {/* File đính kèm: tài liệu bài giảng & đáp án bài tập trên lớp (không cần video vẫn đăng được) */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          {([
            { kind: 'doc' as const, label: 'File bài giảng / tài liệu', ref: lessonDocRef, hint: 'PDF, ảnh, Word, PowerPoint...' },
            { kind: 'answer' as const, label: 'Đáp án bài tập trên lớp', ref: lessonAnswerRef, hint: 'PDF, ảnh, Word...' },
          ]).map(({ kind, label, ref, hint }) => (
            <div className="form-group" key={kind}>
              <label className="label">{label}</label>
              <div className="dropzone" style={{ padding: '1rem' }} onClick={() => ref.current?.click()}>
                {lessonFiles[kind].length > 0
                  ? <span style={{ color: '#2E7D32', fontSize: '0.85rem' }}>✓ {lessonFiles[kind].length === 1 ? lessonFiles[kind][0].name : `Đã chọn ${lessonFiles[kind].length} file`}</span>
                  : <span style={{ fontSize: '0.82rem' }}><Upload size={16} style={{ verticalAlign: 'middle' }} /> Chọn file</span>}
              </div>
              <input ref={ref} type="file" multiple hidden
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                onChange={(e) => { if (e.target.files?.length) addLessonFiles(kind, e.target.files); e.target.value = ''; }} />
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{hint} — chọn được nhiều file</div>
              {lessonFiles[kind].length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {lessonFiles[kind].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', background: '#F1F8E9', borderRadius: 6, padding: '0.35rem 0.55rem' }}>
                      <FileText size={13} color="#2E7D32" style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#2E7D32', fontWeight: 600 }}>{f.name}</span>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} title="Bỏ file này"
                        onClick={() => setLessonFiles((prev) => ({ ...prev, [kind]: prev[kind].filter((_, k) => k !== i) }))}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* File đã lưu của bài giảng (khi sửa): xem / tải / xóa */}
        {editingLesson && parseAttachments(editingLesson.attachments).length > 0 && (
          <div className="form-group">
            <label className="label">File đã đính kèm</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {parseAttachments(editingLesson.attachments).map((a) => (
                <div key={a.file} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 6, padding: '0.4rem 0.6rem' }}>
                  <Paperclip size={13} color={a.kind === 'answer' ? '#2E7D32' : '#E65100'} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name} <span className={`badge ${a.kind === 'answer' ? 'badge-green' : 'badge-orange'}`} style={{ marginLeft: 6 }}>{a.kind === 'answer' ? 'Đáp án BT' : 'Tài liệu'}</span>
                  </span>
                  {isViewableFile(a.file)
                    ? <button className="btn btn-ghost btn-sm" onClick={() => setViewFiles([`/uploads/lessons/${a.file}`])}><Eye size={13} /> Xem</button>
                    : <a className="btn btn-ghost btn-sm" href={`/uploads/lessons/${a.file}`} download={a.name}><Download size={13} /> Tải</a>}
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#C62828' }} title="Xóa file"
                    onClick={() => { if (confirm(`Xóa file "${a.name}"?`)) deleteAttachment(a.file); }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="label">Thứ tự</label>
          <input className="input" type="number" min={0} value={lessonForm.lesson_order} onChange={(e) => setLessonForm({ ...lessonForm, lesson_order: e.target.value })} />
        </div>
      </Modal>

      {/* View Lesson Modal */}
      <Modal open={viewLessonModal} onClose={() => setViewLessonModal(false)} title={viewingLesson?.title || ''} size="xl">
        {viewingLesson?.video_url && <VideoPlayer url={viewingLesson.video_url} type={viewingLesson.video_type} />}
        {viewingLesson?.description && <p style={{ color: '#555', marginTop: 12, lineHeight: 1.6 }}>{viewingLesson.description}</p>}
        {viewingLesson && parseAttachments(viewingLesson.attachments).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Paperclip size={14} /> Tài liệu đính kèm
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {parseAttachments(viewingLesson.attachments).map((a) => (
                <div key={a.file} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                  <FileText size={15} color={a.kind === 'answer' ? '#2E7D32' : '#E65100'} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name} <span className={`badge ${a.kind === 'answer' ? 'badge-green' : 'badge-orange'}`} style={{ marginLeft: 6 }}>{a.kind === 'answer' ? 'Đáp án BT trên lớp' : 'Tài liệu bài giảng'}</span>
                  </span>
                  {isViewableFile(a.file) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setViewFiles([`/uploads/lessons/${a.file}`])}><Eye size={13} /> Xem</button>
                  )}
                  <a className="btn btn-ghost btn-sm" href={`/uploads/lessons/${a.file}`} download={a.name}><Download size={13} /> Tải về</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Homework Modal */}
      <Modal open={hwModal} onClose={() => setHwModal(false)} title={editingHw ? 'Sửa bài tập' : 'Thêm bài tập về nhà'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setHwModal(false)}>Hủy</button><button className="btn btn-primary" onClick={saveHw} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-group">
          <label className="label">Tiêu đề *</label>
          <input className="input" placeholder="Tên bài tập" value={hwForm.title} onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
          <div className="form-group">
            <label className="label">Chương</label>
            <select className="input" value={hwForm.chapter_id} onChange={(e) => setHwForm({ ...hwForm, chapter_id: e.target.value })}>
              <option value="">— Chưa phân chương —</option>
              {chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Thứ tự</label>
            <input className="input" type="number" min={0} value={hwForm.hw_order} onChange={(e) => setHwForm({ ...hwForm, hw_order: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Mô tả / Hướng dẫn</label>
          <textarea className="input" rows={3} value={hwForm.description} onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Kiểu nộp bài</label>
          <div style={{ fontSize: '0.75rem', color: '#888', margin: '2px 0 10px', lineHeight: 1.6 }}>
            Chọn các phần học sinh sẽ làm. Thứ tự khi làm bài: Trắc nghiệm → Đúng/Sai → Trả lời ngắn → Tự luận.
            Trắc nghiệm/Đúng-Sai/Trả lời ngắn được <strong>chấm tự động</strong> theo đáp án &amp; điểm bạn đặt.
            Câu nào <strong>để trống đáp án</strong> → AI tự đọc từ <strong>File đáp án (PDF)</strong> bên dưới để chấm. Phần tự luận do AI chấm theo file đáp án.
          </div>
          <PartsEditor value={hwParts} onChange={setHwParts}
            gradingNote={hwForm.grading_note} onGradingNoteChange={(v) => setHwForm({ ...hwForm, grading_note: v })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <div className="form-group">
            <label className="label">Thang điểm{anyPartEnabled(hwParts) ? ' (quy đổi về)' : ''}</label>
            <input className="input" type="number" min={1} step={0.5}
              value={hwForm.max_score}
              onChange={(e) => setHwForm({ ...hwForm, max_score: e.target.value })} />
            {anyPartEnabled(hwParts) && (
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4, lineHeight: 1.5 }}>
                Tổng điểm các câu: <strong>{computeMaxScore(hwParts)}</strong>. Điểm cuối = (điểm đạt ÷ tổng) × thang điểm.{' '}
                {computeMaxScore(hwParts) > 0 && String(computeMaxScore(hwParts)) !== String(hwForm.max_score) && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 6px', height: 'auto' }}
                    onClick={() => setHwForm({ ...hwForm, max_score: String(computeMaxScore(hwParts)) })}>
                    Đặt = {computeMaxScore(hwParts)} (không quy đổi)
                  </button>
                )}
              </div>
            )}
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
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
      </Modal>

      {/* Excel Import Modal: tạo tài khoản học sinh hàng loạt */}
      <Modal open={excelModal} onClose={() => setExcelModal(false)} title="Nhập Excel — tạo tài khoản hàng loạt" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setExcelModal(false)}>Đóng</button>
            {excelRows.length > 0 && !excelResult && (
              <button className="btn btn-primary" onClick={importExcel} disabled={loading || excelRows.filter((r) => !r.error).length === 0}>
                {loading ? 'Đang tạo...' : `Tạo ${excelRows.filter((r) => !r.error).length} tài khoản`}
              </button>
            )}
          </>
        }>
        {/* Bước 1: hướng dẫn + chọn file */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> Tải file mẫu
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => excelRef.current?.click()}>
            <FileSpreadsheet size={14} /> {excelName ? 'Chọn file khác' : 'Chọn file Excel'}
          </button>
          <input ref={excelRef} type="file" accept=".xlsx,.xls" hidden
            onChange={(e) => { if (e.target.files?.[0]) handleExcelFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
        <div style={{ padding: '0.6rem 0.8rem', background: '#F5F5F5', borderRadius: 8, fontSize: '0.8rem', color: '#666', lineHeight: 1.6, marginBottom: 14 }}>
          File Excel cần các cột: <strong>Họ và tên</strong>, <strong>Tên đăng nhập</strong>, <strong>Mật khẩu</strong>, <strong>Số điện thoại</strong> (tùy chọn).
          Mỗi dòng là một học sinh — tất cả sẽ được tạo tài khoản và thêm thẳng vào lớp này.
        </div>

        {/* Bước 2: xem trước dữ liệu đã đọc */}
        {excelName && !excelResult && (
          <>
            <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>
              <FileSpreadsheet size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              <strong>{excelName}</strong> — {excelRows.length} dòng, {excelRows.filter((r) => !r.error).length} hợp lệ
              {excelRows.some((r) => r.error) && <span style={{ color: '#C62828' }}> · {excelRows.filter((r) => r.error).length} dòng lỗi (bỏ qua khi tạo)</span>}
            </div>
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Dòng</th><th>Họ và tên</th><th>Tên đăng nhập</th><th>Mật khẩu</th><th>SĐT</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {excelRows.map((r) => (
                    <tr key={r.row} style={r.error ? { background: '#FFF8F8' } : undefined}>
                      <td style={{ color: '#999' }}>{r.row}</td>
                      <td><strong>{r.full_name || '—'}</strong></td>
                      <td style={{ fontFamily: 'monospace' }}>{r.username || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.password || '—'}</td>
                      <td>{r.parent_phone || '—'}</td>
                      <td>
                        {r.error
                          ? <span className="badge badge-red">{r.error}</span>
                          : <span className="badge badge-green">Sẵn sàng</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Bước 3: kết quả sau khi tạo */}
        {excelResult && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="card" style={{ flex: 1, padding: '0.8rem 1rem', background: '#E8F5E9', minWidth: 140 }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#2E7D32' }}>{excelResult.created}</div>
                <div style={{ fontSize: '0.8rem', color: '#2E7D32' }}>Tài khoản đã tạo & thêm vào lớp</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '0.8rem 1rem', background: excelResult.failed > 0 ? '#FFEBEE' : '#F5F5F5', minWidth: 140 }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: excelResult.failed > 0 ? '#C62828' : '#888' }}>{excelResult.failed}</div>
                <div style={{ fontSize: '0.8rem', color: excelResult.failed > 0 ? '#C62828' : '#888' }}>Dòng lỗi</div>
              </div>
            </div>
            {excelResult.errors?.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Dòng</th><th>Tên đăng nhập</th><th>Lý do</th></tr></thead>
                  <tbody>
                    {excelResult.errors.map((e: any, i: number) => (
                      <tr key={i}>
                        <td style={{ color: '#999' }}>{e.row}</td>
                        <td style={{ fontFamily: 'monospace' }}>{e.username || '—'}</td>
                        <td style={{ color: '#C62828' }}>{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* File Viewer (xem file đính kèm bài giảng) */}
      {viewFiles && <FileViewer files={viewFiles} onClose={() => setViewFiles(null)} />}
    </div>
  );
}
