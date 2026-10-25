// Giao diện theo các dịp lễ: màu sắc, hoa văn nền, dải trang trí, tranh minh họa + lời chúc,
// và khoảng thời gian tự bật cho từng dịp. Xem trước bất kỳ dịp nào: thêm ?theme=<mã> vào địa chỉ
// (vd ?theme=tet, ?theme=noel; ?theme=auto để quay lại tự động theo ngày).
import { tetDate, midAutumnDate, canChi } from './lunar';
import * as M from './motifs';

export type ThemeKey = 'tet' | 'women' | 'national' | 'midautumn' | 'halloween' | 'teacher' | 'noel';

export interface HolidayTheme {
  key: ThemeKey;
  name: string;
  dark: boolean;           // nền tối (Trung thu, Halloween): vùng làm việc thành tấm sáng nổi trên nền
  primary: string;         // màu nút chính, viền nổi bật
  primaryDark: string;
  soft: string;            // nền nhạt cho dải lời chúc / ô nổi bật
  title: string;           // màu tiêu đề trang
  pageBg: string;          // màu nền dưới hoa văn
  sidebar: string;         // nền thanh bên (CSS background)
  navActive: string;       // chữ mục đang chọn trên thanh bên
  navActiveBg: string;
  topbar: string;          // nền thanh công cụ trên cùng
  topbarDark?: boolean;
  pattern: string;         // hoa văn nền (url(...))
  patternLight?: string;   // hoa văn dùng trên nền SÁNG (trang công khai, khung nộp bài) — chủ đề tối cần bản riêng
  garland: string;         // dải trang trí dưới thanh công cụ (lặp ngang)
  sidebarArt: string;      // tranh minh họa cuối thanh bên
  topbarArt: string;       // cụm sticker giữa thanh công cụ
  loginBg: string;         // nền trang đăng nhập
}

export interface Occasion {
  id: string;              // mã xem trước (?theme=...)
  theme: ThemeKey;
  label: string;           // tên dịp
  message: string;         // lời chúc trên dải thông báo
}

// ── Hoa văn từng chủ đề ───────────────────────────────────────────────────────
const W = 340;
const P = (items: M.Placement[], o: number) => M.tile(W, W, items, o);

const THEMES: Record<ThemeKey, HolidayTheme> = {
  tet: {
    key: 'tet', name: 'Tết', dark: false,
    primary: '#D32F2F', primaryDark: '#B71C1C', soft: '#FFF3E0', title: '#B71C1C', pageBg: '#FFF8F1',
    sidebar: 'linear-gradient(180deg, #7F0000 0%, #B71C1C 55%, #8E0000 100%)',
    navActive: '#FFE082', navActiveBg: 'rgba(255, 213, 79, 0.16)',
    topbar: 'linear-gradient(90deg, #FFF8E1 0%, #FFFFFF 35%, #FFFFFF 65%, #FFF8E1 100%)',
    pattern: P([[M.mai(), 40, 50, 10], [M.lixi(), 170, 70, -14, 0.9], [M.dao(), 290, 40, 20, 0.9], [M.banhChung(), 90, 180, 8, 0.85],
      [M.firework('#FFB300'), 230, 170, 0, 1], [M.dao(0.7), 30, 280, 0], [M.mai(0.8), 300, 270, 30], [M.lixi(), 180, 290, 12, 0.75], [M.mai(0.55), 140, 130, 0]], 0.13),
    garland: M.tile(56, 18, [[M.mai(0.42), 14, 9], [M.dao(0.42), 42, 9]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.branch('mai'), 105, 60, 0, 1.25], [M.lantern(), 40, 70, 0, 1], [M.lixi(), 160, 140, 12, 1.2], [M.banhChung(), 70, 150, -6, 1.15], [M.dao(0.7), 185, 40, 0]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.lantern(), 24, 24, 0, 0.62], [M.mai(0.7), 70, 30], [M.lixi(), 120, 30, -10, 0.65], [M.dao(0.7), 170, 30], [M.lantern(), 216, 24, 0, 0.62]])),
    loginBg: 'linear-gradient(135deg, #7F0000 0%, #B71C1C 50%, #E65100 100%)',
  },
  women: {
    key: 'women', name: 'Ngày Phụ nữ', dark: false,
    primary: '#D81B60', primaryDark: '#AD1457', soft: '#FCE4EC', title: '#AD1457', pageBg: '#FFF4F8',
    sidebar: 'linear-gradient(180deg, #AD1457 0%, #D81B60 55%, #C2185B 100%)',
    navActive: '#FFFFFF', navActiveBg: 'rgba(255, 255, 255, 0.18)',
    topbar: 'linear-gradient(90deg, #FCE4EC 0%, #FFFFFF 35%, #FFFFFF 65%, #FCE4EC 100%)',
    pattern: P([[M.tulip(), 40, 60, -10], [M.heart('#F48FB1'), 150, 50, 12, 0.9], [M.rose(), 270, 70, 8], [M.dao(0.9), 90, 170, 0],
      [M.heart('#F06292'), 220, 180, -10, 0.7], [M.tulip('#BA68C8'), 310, 200, 14, 0.9], [M.rose(), 40, 280, -6, 0.85], [M.heart('#F8BBD0'), 160, 280, 0, 1.1], [M.dao(0.6), 280, 300, 0]], 0.14),
    garland: M.tile(48, 18, [[M.heart('#F06292'), 12, 9, 0, 0.42], [M.dao(0.36), 36, 9]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.bouquet(), 110, 95, 0, 2.1], [M.heart('#F8BBD0'), 40, 50, -12, 1.2], [M.heart('#F48FB1'), 185, 60, 14, 1], [M.dao(0.8), 30, 150], [M.tulip('#FFFFFF'), 190, 150, 10, 1]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.heart('#F06292'), 24, 28, -10, 0.7], [M.tulip(), 70, 24, 0, 0.7], [M.rose(), 120, 22, 0, 0.75], [M.tulip('#BA68C8'), 170, 24, 0, 0.7], [M.heart('#F48FB1'), 216, 28, 10, 0.7]])),
    loginBg: 'linear-gradient(135deg, #880E4F 0%, #D81B60 55%, #F48FB1 100%)',
  },
  national: {
    key: 'national', name: 'Lễ Quốc gia', dark: false,
    primary: '#DA251D', primaryDark: '#B3120B', soft: '#FFF8E1', title: '#B3120B', pageBg: '#FFF8F2',
    sidebar: 'linear-gradient(180deg, #9E0E08 0%, #DA251D 55%, #B3120B 100%)',
    navActive: '#FFEB3B', navActiveBg: 'rgba(255, 222, 0, 0.16)',
    topbar: 'linear-gradient(90deg, #FFF8E1 0%, #FFFFFF 35%, #FFFFFF 65%, #FFF8E1 100%)',
    pattern: P([[M.flag(), 50, 50, -8, 0.9], [M.star(14, '#FFC400'), 170, 40, 10], [M.waveFlag(), 280, 70, 0, 0.8], [M.star(10, '#DA251D'), 100, 150, 0],
      [M.flag(), 210, 180, 6, 0.75], [M.firework('#DA251D'), 60, 260, 0, 0.9], [M.star(12, '#FFC400'), 300, 230, -14], [M.flag(), 160, 290, -4, 0.8], [M.firework('#FFC400'), 300, 320, 0, 0.7]], 0.12),
    garland: M.tile(44, 22, [[`<path d="M0 2 H44" stroke="#8D6E63" stroke-width="1.2"/><polygon points="4,2 18,2 11,18" fill="#DA251D"/><polygon points="${M.starPoints(3.2, 1.3, 11, 7.5)}" fill="#FFDE00"/><polygon points="26,2 40,2 33,18" fill="#FFDE00"/>`, 0, 0]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.waveFlag(), 80, 80, 0, 2], [M.star(14, '#FFDE00'), 175, 40], [M.star(9, '#FFDE00'), 190, 90], [M.firework('#FFDE00'), 170, 150, 0, 1.1], [M.star(7, '#FFF59D'), 30, 160]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.flag(true), 34, 24, 0, 0.62], [M.star(9, '#FFC400'), 82, 28], [M.flag(true), 124, 24, 0, 0.62], [M.star(9, '#FFC400'), 172, 28], [M.flag(true), 214, 24, 0, 0.62]])),
    loginBg: 'linear-gradient(135deg, #8E0B06 0%, #DA251D 55%, #F57F17 100%)',
  },
  midautumn: {
    key: 'midautumn', name: 'Trung thu', dark: true,
    primary: '#F57C00', primaryDark: '#E65100', soft: '#FFF3E0', title: '#E65100', pageBg: '#161A3A',
    sidebar: 'linear-gradient(180deg, #0F1230 0%, #1C2152 60%, #12153A 100%)',
    navActive: '#FFD54F', navActiveBg: 'rgba(255, 213, 79, 0.14)',
    topbar: 'linear-gradient(90deg, #1C2152 0%, #262C66 50%, #1C2152 100%)', topbarDark: true,
    pattern: P([[M.moon(20), 60, 60, 0, 1, 0.5], [M.lantern('#FF7043', '#FFD54F'), 180, 60, -8, 0.9], [M.starLantern(), 290, 80, 10, 0.8], [M.mooncake(), 100, 190, 0, 0.9],
      [M.lantern('#E53935', '#FFD54F'), 250, 200, 6, 0.85], [M.star(4, '#FFF59D'), 30, 150], [M.star(3, '#FFF59D'), 210, 120], [M.star(5, '#FFF59D'), 320, 150], [M.starLantern(), 50, 290, -12, 0.8],
      [M.mooncake(), 200, 300, 20, 0.7], [M.star(3, '#FFF59D'), 140, 260], [M.star(4, '#FFF59D'), 310, 300]], 0.32),
    patternLight: P([[M.lantern('#FF7043', '#FFB300'), 60, 60, -8, 0.9], [M.mooncake(), 180, 70, 0, 0.9], [M.starLantern(), 290, 80, 10, 0.8],
      [M.lantern('#E53935', '#FFB300'), 110, 200, 6, 0.85], [M.mooncake(), 250, 210, 20, 0.7], [M.starLantern(), 40, 300, -12, 0.8], [M.lantern('#FF7043', '#FFB300'), 200, 310, 0, 0.7]], 0.12),
    garland: M.tile(52, 30, [[`<path d="M0 3 Q26 12 52 3" stroke="#FFD54F" stroke-width="1" fill="none"/>`, 0, 0], [M.lantern('#FF7043', '#FFD54F'), 26, 15, 0, 0.32]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.moon(36), 150, 56], [M.lantern('#FF7043', '#FFD54F'), 50, 70, -6, 1.2], [M.starLantern(), 120, 140, -10, 1.15], [M.mooncake(), 185, 150, 0, 1], [M.star(3, '#FFF59D'), 30, 150], [M.star(4, '#FFF59D'), 95, 30]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.lantern('#FF7043', '#FFD54F'), 26, 24, 0, 0.6], [M.mooncake(), 74, 30, 0, 0.7], [M.moon(16), 120, 28], [M.starLantern(), 168, 26, 0, 0.6], [M.lantern('#E53935', '#FFD54F'), 214, 24, 0, 0.6]])),
    loginBg: 'linear-gradient(160deg, #0B0E26 0%, #1C2152 55%, #3B2A5C 100%)',
  },
  halloween: {
    key: 'halloween', name: 'Halloween', dark: true,
    primary: '#EF6C00', primaryDark: '#E65100', soft: '#F3E5F5', title: '#6A1B9A', pageBg: '#1A1128',
    sidebar: 'linear-gradient(180deg, #0E0818 0%, #26123D 60%, #140A22 100%)',
    navActive: '#FFB74D', navActiveBg: 'rgba(255, 152, 0, 0.16)',
    topbar: 'linear-gradient(90deg, #26123D 0%, #33194F 50%, #26123D 100%)', topbarDark: true,
    pattern: P([[M.pumpkin(), 50, 60, -8, 0.9], [M.ghost(), 170, 60, 8, 0.85], [M.bat('#B39DDB'), 280, 50, -10, 0.9], [M.witchHat(), 100, 170, 10, 0.8],
      [M.web(), 300, 170, 0, 1], [M.bat('#B39DDB'), 210, 150, 14, 0.6], [M.ghost(), 40, 280, -10, 0.7], [M.pumpkin(), 190, 280, 6, 0.8], [M.moon(14), 300, 290, 0, 1, 0.6]], 0.3),
    patternLight: P([[M.pumpkin(), 50, 60, -8, 0.9], [M.bat('#7E57C2'), 180, 50, -10, 0.9], [M.witchHat(), 290, 80, 10, 0.8], [M.web(), 100, 190, 0, 1],
      [M.pumpkin(), 240, 200, 6, 0.8], [M.bat('#7E57C2'), 40, 300, 14, 0.7], [M.witchHat(), 190, 300, -8, 0.7]], 0.12),
    garland: M.tile(44, 22, [[`<path d="M0 2 H44" stroke="#9575CD" stroke-width="1"/><polygon points="3,2 19,2 11,18" fill="#FB8C00"/><polygon points="25,2 41,2 33,18" fill="#7E57C2"/>`, 0, 0]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.moon(30), 160, 50], [M.bat('#9575CD'), 60, 40, -10, 1.2], [M.bat('#9575CD'), 110, 70, 12, 0.8], [M.ghost(), 50, 130, -6, 1.3], [M.pumpkin(), 130, 150, 0, 1.4], [M.witchHat(), 190, 145, 10, 0.9]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.bat('#B39DDB'), 26, 24, -10, 0.7], [M.pumpkin(), 74, 30, 0, 0.7], [M.ghost(), 120, 28, 0, 0.7], [M.witchHat(), 168, 32, 0, 0.6], [M.bat('#B39DDB'), 214, 24, 10, 0.7]])),
    loginBg: 'linear-gradient(160deg, #0E0818 0%, #2A1240 55%, #5A2A0A 100%)',
  },
  teacher: {
    key: 'teacher', name: 'Nhà giáo Việt Nam', dark: false,
    primary: '#2E7D32', primaryDark: '#1B5E20', soft: '#E8F5E9', title: '#1B5E20', pageBg: '#F4F8F1',
    sidebar: 'linear-gradient(180deg, #1B3526 0%, #2F5D45 55%, #1E3D2B 100%)',
    navActive: '#FFF59D', navActiveBg: 'rgba(255, 245, 157, 0.14)',
    topbar: 'linear-gradient(90deg, #E8F5E9 0%, #FFFFFF 35%, #FFFFFF 65%, #E8F5E9 100%)',
    pattern: P([[M.chalkboard(), 60, 60, -6, 0.9], [M.pencil(), 180, 50, 0, 1], [M.book(), 290, 70, 8, 0.9], [M.paper(), 100, 180, 10, 0.9],
      [M.apple(), 220, 170, 0, 0.9], [M.rose(), 310, 190, 12, 0.9], [M.pencil(), 50, 280, 60, 0.8], [M.book(), 180, 290, -10, 0.8], [M.chalkboard(), 300, 300, 6, 0.7]], 0.13),
    garland: M.tile(60, 18, [[M.pencil(), 18, 9, 35, 0.42], [M.apple(), 46, 9, 0, 0.42]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.chalkboard(), 110, 70, 0, 2.6], [M.book(), 50, 160, -6, 1.2], [M.pencil(), 130, 160, 0, 1.1], [M.rose(), 190, 150, 10, 1.1]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.pencil(), 26, 28, 0, 0.6], [M.book(), 74, 30, 0, 0.7], [M.chalkboard(), 120, 28, 0, 0.75], [M.paper(), 168, 28, 0, 0.7], [M.apple(), 214, 30, 0, 0.7]])),
    loginBg: 'linear-gradient(135deg, #12291C 0%, #2F5D45 55%, #4E7D3A 100%)',
  },
  noel: {
    // Giáng sinh "băng giá": tông xanh nước biển lạnh (thanh bên xanh đêm → sapphire, nền xanh băng nhạt),
    // điểm chút đỏ ở quả châu / hộp quà / mũi tuần lộc cho đúng không khí Noel.
    key: 'noel', name: 'Giáng sinh', dark: false,
    primary: '#1565C0', primaryDark: '#0D47A1', soft: '#E1F0FC', title: '#0D47A1', pageBg: '#EEF6FC',
    sidebar: 'linear-gradient(180deg, #071C36 0%, #0D3B66 50%, #1559A8 100%)',
    navActive: '#B3E5FC', navActiveBg: 'rgba(179, 229, 252, 0.16)',
    topbar: 'linear-gradient(90deg, #D6EAFA 0%, #FFFFFF 35%, #FFFFFF 65%, #D6EAFA 100%)',
    pattern: P([[M.snowflake('#5AA9E6'), 40, 50, 0, 1], [M.pine(false, ['#5D9BC9', '#6AA8D4', '#79B5DE']), 170, 70, 0, 0.9], [M.snowflake('#8EC5F0'), 290, 40, 20, 0.7],
      [M.reindeer(), 280, 150, 0, 0.85], [M.gift('#4A90D9', '#E3F2FD'), 80, 170, -8, 0.9], [M.snowflake('#5AA9E6'), 190, 190, 10, 0.8], [M.ornament('#D84343'), 40, 270, 0, 0.85],
      [M.snowflake('#8EC5F0'), 150, 290, 12, 0.6], [M.ornament('#4A90D9'), 230, 270, 0, 0.8], [M.snowflake('#5AA9E6'), 310, 300, 0, 1.1], [M.dot(3, '#8EC5F0'), 120, 120], [M.dot(2.5, '#8EC5F0'), 240, 110], [M.dot(3, '#8EC5F0'), 320, 220]], 0.18),
    garland: M.tile(60, 22, [[`<path d="M0 3 Q15 11 30 3 Q45 11 60 3" stroke="#B0C4D8" stroke-width="1.4" fill="none"/>`, 0, 0],
      [`<rect x="-2" y="-2" width="4" height="3" fill="#78909C"/><ellipse cy="5" rx="3.6" ry="5" fill="#E3F2FD" stroke="#90CAF9" stroke-width="1"/>`, 10, 8],
      [`<rect x="-2" y="-2" width="4" height="3" fill="#78909C"/><ellipse cy="5" rx="3.6" ry="5" fill="#29B6F6"/>`, 30, 9],
      [`<rect x="-2" y="-2" width="4" height="3" fill="#78909C"/><ellipse cy="5" rx="3.6" ry="5" fill="#E53935"/>`, 50, 8]]),
    sidebarArt: M.svgUrl(M.compose(220, 190, [[M.snowGround(240), 110, 176], [M.snowyPine(), 66, 104, 0, 2.3], [M.reindeer(), 162, 104, 0, 1.35],
      [M.gift('#1E88E5', '#E3F2FD'), 140, 166, -6, 1], [M.gift('#E53935', '#FFD54F'), 188, 168, 8, 0.8],
      [M.snowflake('#E3F2FD', 0.7), 26, 24], [M.snowflake('#BBDEFB', 0.5), 190, 26], [M.snowflake('#E3F2FD', 0.4), 128, 40],
      [M.dot(2, '#FFFFFF'), 100, 20], [M.dot(1.6, '#FFFFFF'), 158, 50], [M.dot(2, '#FFFFFF'), 20, 80], [M.dot(1.6, '#FFFFFF'), 206, 70]])),
    topbarArt: M.svgUrl(M.compose(240, 56, [[M.snowflake('#42A5F5', 0.8), 24, 28], [M.snowyPine(), 72, 28, 0, 0.75], [M.reindeer(), 120, 30, 0, 0.75],
      [M.gift('#1E88E5', '#E3F2FD'), 168, 30, 0, 0.7], [M.snowflake('#42A5F5', 0.8), 216, 28]])),
    loginBg: 'linear-gradient(160deg, #061A33 0%, #0D3B66 50%, #1E88E5 100%)',
  },
};

export const getTheme = (key: ThemeKey) => THEMES[key];

// ── Khoảng thời gian tự bật ───────────────────────────────────────────────────
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const within = (t: Date, from: Date, to: Date) => t >= from && t < addDays(to, 1); // tính hết ngày cuối
const around = (t: Date, center: Date, before: number, after: number) => within(t, addDays(center, -before), addDays(center, after));

// Dịp lễ (nếu có) ứng với một ngày. Thứ tự ưu tiên khi trùng lịch: Tết → 30/4, 2/9 → Phụ nữ → Nhà giáo → Halloween → Trung thu → Noel.
export function occasionAt(date = new Date()): Occasion | null {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const y = t.getFullYear();

  // 1. Tết: từ 31/12 năm trước (Tết Dương lịch) đến hết 2 tuần sau mùng 1 Tết Nguyên đán
  const tetYear = t.getMonth() === 11 ? y + 1 : y;
  const tet = tetDate(tetYear);
  if (within(t, day(tetYear - 1, 12, 31), addDays(tet, 14))) {
    const solarNewYear = t < day(tetYear, 1, 8);
    return solarNewYear ? OCCASIONS['tet-duong-lich'](tetYear) : OCCASIONS.tet(tetYear, t < tet);
  }
  // 3. 30/4 và 2/9: 3 ngày trước → 3 ngày sau
  if (around(t, day(y, 4, 30), 3, 3)) return OCCASIONS['30-4']();
  if (around(t, day(y, 9, 2), 3, 3)) return OCCASIONS['2-9']();
  // 2. 8/3 và 20/10: 3 ngày trước → 3 ngày sau
  if (around(t, day(y, 3, 8), 3, 3)) return OCCASIONS['8-3']();
  if (around(t, day(y, 10, 20), 3, 3)) return OCCASIONS['20-10']();
  // 6. Nhà giáo Việt Nam 20/11: 1 tuần trước → 1 tuần sau
  if (around(t, day(y, 11, 20), 7, 7)) return OCCASIONS['20-11']();
  // 5. Halloween 31/10: 3 ngày trước → 3 ngày sau
  if (around(t, day(y, 10, 31), 3, 3)) return OCCASIONS.halloween();
  // 4. Trung thu (15/8 âm): 1 tuần trước → 3 ngày sau
  if (around(t, midAutumnDate(y), 7, 3)) return OCCASIONS['trung-thu']();
  // 7. Noel 25/12: 5 ngày trước → 5 ngày sau
  if (around(t, day(y, 12, 25), 5, 5)) return OCCASIONS.noel();
  return null;
}

const OCCASIONS = {
  'tet-duong-lich': (y = new Date().getFullYear() + 1): Occasion => ({
    id: 'tet-duong-lich', theme: 'tet', label: 'Tết Dương lịch',
    message: `Chúc mừng năm mới ${y}! Chúc thầy cô và các bạn một năm mới nhiều sức khỏe, học tập thật tiến bộ.`,
  }),
  tet: (y = new Date().getFullYear(), before = false): Occasion => ({
    id: 'tet', theme: 'tet', label: 'Tết Nguyên đán',
    message: before
      ? `Tết ${canChi(y)} đang đến gần. Chúc thầy cô và các bạn một năm mới an khang thịnh vượng, học hành tấn tới!`
      : `Chúc mừng năm mới Xuân ${canChi(y)}! Vạn sự như ý, học hành tấn tới, điểm cao vững vàng!`,
  }),
  '8-3': (): Occasion => ({ id: '8-3', theme: 'women', label: 'Quốc tế Phụ nữ 8/3', message: 'Chúc mừng Ngày Quốc tế Phụ nữ 8/3! Gửi lời chúc tốt đẹp nhất tới các cô giáo, các mẹ và các bạn nữ.' }),
  '20-10': (): Occasion => ({ id: '20-10', theme: 'women', label: 'Phụ nữ Việt Nam 20/10', message: 'Chúc mừng Ngày Phụ nữ Việt Nam 20/10! Chúc các cô giáo và các bạn nữ luôn xinh đẹp, hạnh phúc và thành công.' }),
  '30-4': (): Occasion => ({ id: '30-4', theme: 'national', label: 'Giải phóng miền Nam 30/4', message: 'Kỷ niệm Ngày Giải phóng miền Nam, thống nhất đất nước 30/4. Tự hào truyền thống, cùng nhau học tập thật tốt!' }),
  '2-9': (): Occasion => ({ id: '2-9', theme: 'national', label: 'Quốc khánh 2/9', message: 'Chào mừng Quốc khánh nước Cộng hòa Xã hội Chủ nghĩa Việt Nam 2/9. Chúc các bạn kỳ nghỉ lễ vui vẻ, an toàn!' }),
  'trung-thu': (): Occasion => ({ id: 'trung-thu', theme: 'midautumn', label: 'Tết Trung thu', message: 'Trung thu vui vẻ! Chúc các bạn một mùa trăng rằm thật ấm áp bên gia đình, rước đèn thật vui!' }),
  halloween: (): Occasion => ({ id: 'halloween', theme: 'halloween', label: 'Halloween', message: 'Happy Halloween! Nhớ nộp bài đầy đủ, đúng hạn kẻo… ma bắt nhé!' }),
  '20-11': (): Occasion => ({ id: '20-11', theme: 'teacher', label: 'Nhà giáo Việt Nam 20/11', message: 'Chào mừng Ngày Nhà giáo Việt Nam 20/11. Tri ân thầy cô, những người lái đò thầm lặng!' }),
  noel: (): Occasion => ({ id: 'noel', theme: 'noel', label: 'Giáng sinh', message: 'Giáng sinh an lành! Merry Christmas! Chúc thầy cô và các bạn một mùa lễ hội thật ấm áp.' }),
};

// Mã xem trước: mã dịp ('tet', '8-3', 'noel'…) hoặc mã chủ đề ('women', 'national', 'midautumn'…)
const PREVIEW_ALIAS: Record<string, keyof typeof OCCASIONS> = {
  women: '20-10', 'phu-nu': '20-10', national: '2-9', 'quoc-khanh': '2-9', midautumn: 'trung-thu', teacher: '20-11', 'nha-giao': '20-11',
};
export const PREVIEW_IDS = Object.keys(OCCASIONS);

export function previewOccasion(id: string): Occasion | null {
  const key = (PREVIEW_ALIAS[id] || id) as keyof typeof OCCASIONS;
  return OCCASIONS[key] ? OCCASIONS[key]() : null;
}
