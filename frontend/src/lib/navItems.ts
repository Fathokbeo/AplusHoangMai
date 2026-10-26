import {
  LayoutDashboard, Users, BookOpen, GraduationCap, Image, School, LayoutTemplate, UserCog, Sparkles, Home,
  type LucideIcon,
} from 'lucide-react';

// Danh sách mục menu theo vai trò — dùng chung cho thanh bên (máy tính) và thanh tab dưới đáy (điện thoại).
//   label: tên đầy đủ (thanh bên, bảng "Thêm"); short: tên ngắn dưới biểu tượng trên thanh tab
//   also: các đường dẫn con cũng tính là đang ở mục này (vd: đang xem 1 lớp → mục "Khóa học" sáng)
export type NavItem = { to: string; icon: LucideIcon; label: string; short: string; also?: string[] };

export const HOME_ITEM: NavItem = { to: '/', icon: Home, label: 'Trang chủ', short: 'Trang chủ' };

const ADMIN: NavItem[] = [
  { to: '/admin/overview', icon: LayoutDashboard, label: 'Tổng quan', short: 'Tổng quan' },
  { to: '/admin/users', icon: Users, label: 'Quản lý tài khoản', short: 'Tài khoản' },
  { to: '/admin/courses', icon: BookOpen, label: 'Khóa học', short: 'Khóa học' },
  { to: '/admin/classes', icon: School, label: 'Lớp học', short: 'Lớp học' },
  { to: '/teacher/assistants', icon: UserCog, label: 'Trợ giảng', short: 'Trợ giảng' },
  { to: '/admin/content', icon: LayoutTemplate, label: 'Nội dung trang', short: 'Nội dung' },
  { to: '/admin/ads', icon: Image, label: 'Quảng cáo', short: 'Quảng cáo' },
];

const TEACHER: NavItem[] = [
  { to: '/teacher/overview', icon: Sparkles, label: 'Tổng quát', short: 'Tổng quát' },
  { to: '/teacher', icon: LayoutDashboard, label: 'Khóa học của tôi', short: 'Khóa học', also: ['/teacher/courses', '/teacher/classes', '/teacher/homework'] },
  { to: '/teacher/students', icon: GraduationCap, label: 'Học sinh', short: 'Học sinh' },
  { to: '/teacher/assistants', icon: UserCog, label: 'Trợ giảng', short: 'Trợ giảng' },
];

const STUDENT: NavItem[] = [
  { to: '/student/overview', icon: Sparkles, label: 'Tổng quát', short: 'Tổng quát' },
  { to: '/student', icon: BookOpen, label: 'Khóa học của tôi', short: 'Khóa học', also: ['/student/courses', '/student/classes'] },
];

export function navItemsFor(role?: string): NavItem[] {
  return role === 'admin' ? ADMIN : role === 'teacher' ? TEACHER : STUDENT;
}

// Mục có đang được chọn không: trùng đường dẫn (mục gốc như "/teacher" phải trùng khít), hoặc nằm trong `also`
export function isNavActive(item: NavItem, pathname: string) {
  const exact = item.to.split('/').length <= 2;
  if (exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  return (item.also || []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
