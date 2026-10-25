import { useSyncExternalStore } from 'react';
import { occasionAt, previewOccasion, getTheme, type Occasion } from './themes';

// Dịp lễ đang áp dụng: tự tính theo ngày (kiểm tra lại mỗi 30 phút), hoặc xem trước bằng ?theme=<mã>
// (giữ trong tab đang mở; ?theme=auto để quay lại tự động, ?theme=none để tắt hẳn).
// Khi có dịp lễ: gắn <html data-holiday="..."> + các biến màu/hình --hd-* để holiday.css đổi giao diện.

const PREVIEW_KEY = 'aplus-holiday-preview';

function readPreview(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (q !== null) {
      if (q === '' || q === 'auto') sessionStorage.removeItem(PREVIEW_KEY);
      else sessionStorage.setItem(PREVIEW_KEY, q);
    }
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

function compute(): Occasion | null {
  const p = readPreview();
  if (p === 'none' || p === 'off') return null;
  if (p) {
    const o = previewOccasion(p);
    if (o) return o;
  }
  return occasionAt(new Date());
}

const VARS = ['primary', 'primary-dark', 'soft', 'title', 'page-bg', 'sidebar', 'nav-active', 'nav-active-bg', 'topbar',
  'pattern', 'pattern-light', 'garland', 'sidebar-art', 'topbar-art', 'login-bg'];

function apply(o: Occasion | null) {
  const root = document.documentElement;
  if (!o) {
    delete root.dataset.holiday;
    delete root.dataset.holidayDark;
    delete root.dataset.holidayTopbarDark;
    VARS.forEach((v) => root.style.removeProperty(`--hd-${v}`));
    return;
  }
  const t = getTheme(o.theme);
  root.dataset.holiday = t.key;
  if (t.dark) root.dataset.holidayDark = '1'; else delete root.dataset.holidayDark;
  if (t.topbarDark) root.dataset.holidayTopbarDark = '1'; else delete root.dataset.holidayTopbarDark;
  const values: Record<string, string> = {
    primary: t.primary, 'primary-dark': t.primaryDark, soft: t.soft, title: t.title, 'page-bg': t.pageBg, sidebar: t.sidebar,
    'nav-active': t.navActive, 'nav-active-bg': t.navActiveBg, topbar: t.topbar, pattern: t.pattern, 'pattern-light': t.patternLight ?? t.pattern,
    garland: t.garland, 'sidebar-art': t.sidebarArt, 'topbar-art': t.topbarArt, 'login-bg': t.loginBg,
  };
  Object.entries(values).forEach(([k, v]) => root.style.setProperty(`--hd-${k}`, v));
}

let current: Occasion | null = null;
const listeners = new Set<() => void>();

export function refreshHoliday() {
  const next = compute();
  if (next?.id === current?.id && next?.message === current?.message) return;
  current = next;
  apply(current);
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  refreshHoliday();
  window.setInterval(refreshHoliday, 30 * 60e3);
  window.addEventListener('popstate', refreshHoliday);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useHoliday = () => useSyncExternalStore(subscribe, () => current);
