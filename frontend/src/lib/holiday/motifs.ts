// Hình vẽ SVG (tự vẽ, không dùng emoji để hiển thị giống nhau trên mọi máy) cho giao diện các dịp lễ.
// Mỗi hình vẽ quanh gốc (0,0) trong khoảng ±30 đơn vị; ghép lại thành hoa văn nền, dải trang trí, tranh minh họa.

export type Motif = string;

// ── Hình cơ bản ──────────────────────────────────────────────────────────────
export function starPoints(R: number, r = R * 0.42, cx = 0, cy = 0) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
export const star = (R = 14, fill = '#FFD600') => `<polygon points="${starPoints(R)}" fill="${fill}"/>`;

const petals = (n: number, len: number, w: number, fill: string) =>
  Array.from({ length: n }, (_, i) => `<ellipse cx="0" cy="${-len}" rx="${w}" ry="${len}" fill="${fill}" transform="rotate(${(360 / n) * i})"/>`).join('');

// Hoa mai (vàng) / hoa đào (hồng): 5 cánh + nhụy
export const flower = (petal: string, center: string, size = 1) =>
  `<g transform="scale(${size})">${petals(5, 10, 7.5, petal)}<circle r="5" fill="${center}"/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-8" r="1.3" fill="${center}" transform="rotate(${a + 36})"/>`).join('')}</g>`;
export const mai = (s = 1) => flower('#FFC928', '#E65100', s);
export const dao = (s = 1) => flower('#F8A5C2', '#C2185B', s);

// Cành hoa: thân cong + các bông
export const branch = (kind: 'mai' | 'dao') => {
  const f = kind === 'mai' ? mai : dao;
  return `<path d="M-60 30 C-30 18 -10 4 20 -6 S50 -22 62 -30" stroke="#6D4C41" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M-12 8 C-6 -6 0 -14 4 -24" stroke="#6D4C41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<path d="M28 -10 C34 -2 40 4 48 6" stroke="#6D4C41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<g transform="translate(-40 22)">${f(0.75)}</g><g transform="translate(4 -24)">${f(0.6)}</g><g transform="translate(20 -6)">${f(0.85)}</g>
<g transform="translate(48 6)">${f(0.55)}</g><g transform="translate(60 -30)">${f(0.7)}</g><g transform="translate(-14 10)">${f(0.5)}</g>
<circle cx="36" cy="-16" r="3" fill="#8BC34A"/><circle cx="-26" cy="16" r="2.6" fill="#8BC34A"/>`;
};

// Bao lì xì
export const lixi = () => `<rect x="-14" y="-20" width="28" height="40" rx="4" fill="#E53935"/>
<path d="M-14 -13 L0 -2 L14 -13" stroke="#FFD54F" stroke-width="2" fill="none"/>
<circle cy="7" r="6.5" fill="#FFD54F"/><polygon points="${starPoints(4.2, 1.8, 0, 7)}" fill="#E53935"/>`;

// Bánh chưng: lá dong xanh + lạt buộc
export const banhChung = () => `<rect x="-16" y="-16" width="32" height="32" rx="3" fill="#689F38"/>
<rect x="-12" y="-12" width="24" height="24" rx="2" fill="#7CB342"/>
<path d="M-5 -16v32M5 -16v32M-16 -5h32M-16 5h32" stroke="#F3E5AB" stroke-width="1.8"/>`;

// Pháo hoa
export const firework = (c = '#FFC107') => `<g stroke="${c}" stroke-width="2" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180;
  return `<line x1="${(6 * Math.cos(a)).toFixed(1)}" y1="${(6 * Math.sin(a)).toFixed(1)}" x2="${(16 * Math.cos(a)).toFixed(1)}" y2="${(16 * Math.sin(a)).toFixed(1)}"/>`;
}).join('')}</g><circle r="2.5" fill="${c}"/>`;

// Lồng đèn tròn đỏ (Tết / Trung thu)
export const lantern = (body = '#E53935', trim = '#FFC107') => `<line x1="0" y1="-34" x2="0" y2="-22" stroke="#5D4037" stroke-width="1.5"/>
<rect x="-8" y="-24" width="16" height="5" rx="1.5" fill="${trim}"/>
<ellipse rx="17" ry="18" fill="${body}"/>
<path d="M0 -18 C-10 -10 -10 10 0 18 M0 -18 C10 -10 10 10 0 18" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" fill="none"/>
<rect x="-8" y="17" width="16" height="5" rx="1.5" fill="${trim}"/>
<path d="M0 22 v10 M-3 24 v8 M3 24 v8" stroke="${trim}" stroke-width="1.5"/>`;

// Đèn ông sao (Trung thu)
export const starLantern = () => `<line x1="10" y1="12" x2="26" y2="34" stroke="#8D6E63" stroke-width="2.5" stroke-linecap="round"/>
<polygon points="${starPoints(20, 9)}" fill="#FF7043" stroke="#FFD54F" stroke-width="2" stroke-linejoin="round"/>
<polygon points="${starPoints(9, 4)}" fill="#FFD54F"/>`;

// Trăng tròn
export const moon = (r = 24) => `<circle r="${r + 8}" fill="#FFF59D" opacity="0.25"/><circle r="${r}" fill="#FFF3B0"/>
<circle cx="${-r * 0.3}" cy="${-r * 0.2}" r="${r * 0.18}" fill="#F7E38D"/><circle cx="${r * 0.35}" cy="${r * 0.25}" r="${r * 0.13}" fill="#F7E38D"/><circle cx="${r * 0.1}" cy="${-r * 0.45}" r="${r * 0.09}" fill="#F7E38D"/>`;

// Bánh trung thu
export const mooncake = () => `${Array.from({ length: 12 }, (_, i) => `<circle cx="0" cy="-17" r="5" fill="#C8873A" transform="rotate(${i * 30})"/>`).join('')}
<circle r="17" fill="#D9A050"/><circle r="12" fill="none" stroke="#A86A28" stroke-width="2"/>
<path d="M-6 0h12M0 -6v12" stroke="#A86A28" stroke-width="2"/>`;

// Cờ đỏ sao vàng
export const flag = (pole = false) => `${pole ? '<rect x="-27" y="-18" width="3" height="56" rx="1.5" fill="#8D6E63"/>' : ''}
<rect x="-24" y="-16" width="48" height="32" rx="${pole ? 0 : 2}" fill="#DA251D"/>
<polygon points="${starPoints(10, 4)}" fill="#FFDE00"/>`;
export const waveFlag = () => `<rect x="-30" y="-22" width="3" height="66" rx="1.5" fill="#8D6E63"/>
<path d="M-27 -20 C-12 -26 2 -14 18 -20 C24 -22 28 -21 30 -20 V12 C22 8 10 18 -4 12 C-14 8 -22 10 -27 12 Z" fill="#DA251D"/>
<polygon points="${starPoints(9, 3.7, 1, -4)}" fill="#FFDE00"/>`;

// Hoa tulip / trái tim / bó hoa (8/3, 20/10)
export const tulip = (c = '#F06292') => `<path d="M0 6 V30" stroke="#43A047" stroke-width="2.5"/>
<path d="M0 26 C-10 22 -14 14 -14 8 C-6 12 -2 18 0 26Z" fill="#66BB6A"/>
<path d="M-11 -10 C-12 2 -6 8 0 8 C6 8 12 2 11 -10 L6 -4 L0 -14 L-6 -4 Z" fill="${c}"/>`;
export const heart = (c = '#EC407A') => `<path d="M0 10 C-14 0 -16 -10 -9 -14 C-4 -17 0 -13 0 -9 C0 -13 4 -17 9 -14 C16 -10 14 0 0 10Z" fill="${c}"/>`;
export const rose = () => `<path d="M0 8 V30" stroke="#43A047" stroke-width="2.5"/><path d="M0 22 C8 18 12 14 13 10 C6 12 2 16 0 22Z" fill="#66BB6A"/>
<circle r="11" fill="#E91E63"/><path d="M-6 -2 C-2 -8 6 -6 6 0 C6 5 0 6 -2 2 C-3 -1 0 -2 2 -1" stroke="#AD1457" stroke-width="1.8" fill="none"/>`;
// Bó hoa: 5 bông tulip xòe hình quạt, chụm cuống + nơ
export const bouquet = () => `${[[-34, '#F48FB1'], [-17, '#FFFFFF'], [0, '#EC407A'], [17, '#CE93D8'], [34, '#F8BBD0']].map(([a, c]) =>
  `<g transform="rotate(${a} 0 34) translate(0 -6)">${tulip(String(c))}</g>`).join('')}
<path d="M-7 30 C-12 26 -16 30 -12 34 C-9 36 -5 34 0 32 C5 34 9 36 12 34 C16 30 12 26 7 30 Z" fill="#FFEB3B"/><circle cx="0" cy="32" r="3" fill="#FBC02D"/>`;

// Halloween: bí ngô, ma, mũ phù thủy, dơi, mạng nhện
export const pumpkin = () => `<path d="M0 -16 C2 -22 6 -24 9 -24" stroke="#558B2F" stroke-width="3" fill="none" stroke-linecap="round"/>
<ellipse cx="-9" rx="11" ry="14" fill="#F57C00"/><ellipse cx="9" rx="11" ry="14" fill="#F57C00"/><ellipse rx="11" ry="15" fill="#FB8C00"/>
<polygon points="-9,-5 -4,-5 -6.5,-10" fill="#3E2000"/><polygon points="4,-5 9,-5 6.5,-10" fill="#3E2000"/>
<path d="M-10 4 L-6 8 L-2 4 L2 8 L6 4 L10 8 C6 12 -6 12 -10 4Z" fill="#3E2000"/>`;
export const ghost = () => `<path d="M-14 18 V-4 C-14 -16 -7 -22 0 -22 C7 -22 14 -16 14 -4 V18 L9 13 L4 18 L0 13 L-4 18 L-9 13Z" fill="#FAFAFA"/>
<ellipse cx="-5" cy="-6" rx="2.6" ry="3.6" fill="#311B92"/><ellipse cx="5" cy="-6" rx="2.6" ry="3.6" fill="#311B92"/><ellipse cy="3" rx="3" ry="2.2" fill="#311B92"/>`;
export const witchHat = () => `<ellipse cy="12" rx="26" ry="6" fill="#311B92"/>
<path d="M-15 12 C-12 0 -8 -10 2 -28 C4 -18 8 -8 15 12Z" fill="#4A148C"/>
<path d="M-12.5 4 C-4 6 4 6 13 4 L14 9 C4 11 -4 11 -14 9Z" fill="#FFB300"/>`;
export const bat = (c = '#2B1B3D') => `<path d="M0 -2 C-4 -8 -10 -10 -24 -6 C-18 -4 -18 2 -16 4 C-12 0 -8 2 -6 6 C-4 2 -2 2 0 4 C2 2 4 2 6 6 C8 2 12 0 16 4 C18 2 18 -4 24 -6 C10 -10 4 -8 0 -2Z" fill="${c}"/>
<circle cx="-2" cy="-1" r="0.9" fill="#FFD54F"/><circle cx="2" cy="-1" r="0.9" fill="#FFD54F"/>`;
export const web = () => `<g stroke="#B39DDB" stroke-width="1" fill="none">${Array.from({ length: 6 }, (_, i) => {
  const a = (i * 60 * Math.PI) / 180;
  return `<line x1="0" y1="0" x2="${(26 * Math.cos(a)).toFixed(1)}" y2="${(26 * Math.sin(a)).toFixed(1)}"/>`;
}).join('')}${[8, 15, 22].map((r) => `<polygon points="${Array.from({ length: 6 }, (_, i) => `${(r * Math.cos((i * 60 * Math.PI) / 180)).toFixed(1)},${(r * Math.sin((i * 60 * Math.PI) / 180)).toFixed(1)}`).join(' ')}"/>`).join('')}</g>`;

// Nhà giáo: bảng phấn, bút chì, sách, giấy, quả táo
export const chalkboard = () => `<rect x="-28" y="-20" width="56" height="38" rx="3" fill="#8D6E63"/><rect x="-24" y="-16" width="48" height="30" fill="#2F5D45"/>
<path d="M-18 -8 h10 M-13 -13 v10 M-2 -8 h8 M12 -10 l6 6 M18 -10 l-6 6" stroke="#ECEFF1" stroke-width="1.8" stroke-linecap="round"/>
<path d="M-18 6 C-10 0 -2 10 6 4 S16 2 18 6" stroke="#FFF59D" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<rect x="-20" y="18" width="40" height="3" fill="#6D4C41"/><rect x="8" y="15" width="8" height="3" rx="1" fill="#FAFAFA"/>`;
export const pencil = () => `<g transform="rotate(-35)"><rect x="-24" y="-5" width="38" height="10" fill="#FFCA28"/><rect x="-24" y="-5" width="38" height="3.3" fill="#FFB300"/>
<rect x="-30" y="-5" width="7" height="10" rx="1.5" fill="#F48FB1"/><rect x="-24" y="-5" width="3" height="10" fill="#B0BEC5"/>
<polygon points="14,-5 26,0 14,5" fill="#F5DEB3"/><polygon points="22,-1.6 26,0 22,1.6" fill="#37474F"/></g>`;
export const book = () => `<path d="M0 -14 C-8 -18 -20 -18 -26 -14 V16 C-20 12 -8 12 0 16Z" fill="#42A5F5"/><path d="M0 -14 C8 -18 20 -18 26 -14 V16 C20 12 8 12 0 16Z" fill="#64B5F6"/>
<path d="M-21 -8 C-15 -10 -8 -10 -4 -8 M-21 -2 C-15 -4 -8 -4 -4 -2 M4 -8 C8 -10 15 -10 21 -8 M4 -2 C8 -4 15 -4 21 -2" stroke="#E3F2FD" stroke-width="1.4" fill="none"/>`;
export const paper = () => `<path d="M-16 -22 H8 L16 -14 V22 H-16Z" fill="#FFFFFF" stroke="#CFD8DC" stroke-width="1.2"/><path d="M8 -22 V-14 H16" fill="#ECEFF1" stroke="#CFD8DC" stroke-width="1.2"/>
<path d="M-10 -10 h18 M-10 -3 h20 M-10 4 h20 M-10 11 h14" stroke="#90A4AE" stroke-width="1.4"/>`;
export const apple = () => `<path d="M0 -10 C-4 -14 -16 -14 -16 0 C-16 12 -6 18 0 15 C6 18 16 12 16 0 C16 -14 4 -14 0 -10Z" fill="#E53935"/>
<path d="M0 -10 C0 -16 2 -19 4 -20" stroke="#5D4037" stroke-width="2" fill="none"/><path d="M2 -16 C8 -22 14 -18 12 -15 C8 -13 4 -14 2 -16Z" fill="#7CB342"/>`;

// Noel: bông tuyết, cây thông, tuần lộc, hộp quà, quả châu, kẹo gậy
export const snowflake = (c = '#90CAF9', s = 1) => `<g stroke="${c}" stroke-width="${2 / s}" stroke-linecap="round" transform="scale(${s})">${Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})"><line x1="0" y1="0" x2="0" y2="-16"/><line x1="0" y1="-9" x2="-5" y2="-13"/><line x1="0" y1="-9" x2="5" y2="-13"/></g>`).join('')}</g>`;
export const pine = (lights = true, tiers = ['#2E7D32', '#388E3C', '#43A047']) => `<rect x="-4" y="20" width="8" height="9" fill="#6D4C41"/>
<polygon points="0,-30 -14,-6 14,-6" fill="${tiers[0]}"/><polygon points="0,-18 -19,8 19,8" fill="${tiers[1]}"/><polygon points="0,-6 -24,22 24,22" fill="${tiers[2]}"/>
<polygon points="${starPoints(6, 2.6, 0, -31)}" fill="#FFD54F"/>
${lights ? '<circle cx="-6" cy="-4" r="2.3" fill="#E53935"/><circle cx="7" cy="2" r="2.3" fill="#FFD54F"/><circle cx="-9" cy="12" r="2.3" fill="#42A5F5"/><circle cx="10" cy="16" r="2.3" fill="#E53935"/><circle cx="1" cy="10" r="2.3" fill="#FFD54F"/>' : ''}`;
// Cây thông phủ tuyết: thêm lớp tuyết trắng trên từng tầng lá
export const snowyPine = (tiers = ['#1E6B57', '#237A63', '#2A8A70']) => `${pine(true, tiers)}
<path d="M-8 -16 C-4 -13 0 -16 4 -13 C6 -14 8 -14 9 -15 L0 -30Z" fill="#FFFFFF"/>
<path d="M-12 -4 C-7 -1 -3 -5 2 -2 C6 -4 10 -2 13 -4 L7 -12 C3 -9 -3 -11 -7 -10Z" fill="#FFFFFF" opacity="0.95"/>
<path d="M-17 10 C-11 13 -6 9 0 12 C6 9 11 13 17 10 L12 2 C6 5 -4 3 -12 4Z" fill="#FFFFFF" opacity="0.95"/>`;
export const snowGround = (w = 200) => `<path d="M${-w / 2} 6 C${-w / 4} -6 ${-w / 8} 2 0 -2 C${w / 6} -8 ${w / 3} 2 ${w / 2} -4 V14 H${-w / 2}Z" fill="#FFFFFF"/>`;

export const reindeer = () => `<path d="M-8 -14 C-12 -22 -18 -24 -22 -30 M-14 -21 C-20 -20 -24 -18 -26 -22 M8 -14 C12 -22 18 -24 22 -30 M14 -21 C20 -20 24 -18 26 -22" stroke="#6D4C41" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<ellipse cx="-12" cy="-10" rx="5" ry="2.6" fill="#A1887F" transform="rotate(-25 -12 -10)"/><ellipse cx="12" cy="-10" rx="5" ry="2.6" fill="#A1887F" transform="rotate(25 12 -10)"/>
<path d="M-10 -12 C-12 0 -8 14 0 16 C8 14 12 0 10 -12 C6 -16 -6 -16 -10 -12Z" fill="#A1887F"/>
<ellipse cy="10" rx="6" ry="4.5" fill="#D7CCC8"/><circle cy="13" r="3.6" fill="#E53935"/>
<circle cx="-4.5" cy="-3" r="1.7" fill="#3E2723"/><circle cx="4.5" cy="-3" r="1.7" fill="#3E2723"/>`;
export const gift = (box = '#E53935', ribbon = '#FFD54F') => `<rect x="-15" y="-8" width="30" height="24" rx="2" fill="${box}"/><rect x="-17" y="-14" width="34" height="8" rx="2" fill="${box}"/>
<rect x="-3" y="-14" width="6" height="30" fill="${ribbon}"/><path d="M0 -14 C-10 -24 -16 -16 -8 -14 M0 -14 C10 -24 16 -16 8 -14" stroke="${ribbon}" stroke-width="3" fill="none"/>`;
export const ornament = (c = '#E53935') => `<line x1="0" y1="-22" x2="0" y2="-14" stroke="#B0BEC5" stroke-width="1.2"/><rect x="-3.5" y="-16" width="7" height="4" rx="1" fill="#FFD54F"/>
<circle r="12" fill="${c}"/><path d="M-11 -3 C-4 1 4 1 11 -3" stroke="rgba(255,255,255,0.5)" stroke-width="2" fill="none"/><circle cx="-4" cy="-5" r="2.4" fill="rgba(255,255,255,0.55)"/>`;
export const candyCane = () => `<path d="M6 26 V-10 C6 -20 -8 -20 -8 -12" stroke="#FAFAFA" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M6 26 V-10 C6 -20 -8 -20 -8 -12" stroke="#E53935" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="4 4"/>`;

export const dot = (r = 2, c = '#FFF') => `<circle r="${r}" fill="${c}"/>`;

// ── Ghép hình ────────────────────────────────────────────────────────────────
export type Placement = [Motif, number, number, number?, number?, number?]; // [hình, x, y, xoay, tỉ lệ, độ mờ]

export function svgUrl(svg: string) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

export function compose(w: number, h: number, items: Placement[], opacity = 1) {
  const body = items.map(([m, x, y, rot = 0, s = 1, o]) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"${o !== undefined ? ` opacity="${o}"` : ''}>${m}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g opacity="${opacity}">${body}</g></svg>`;
}

export const tile = (w: number, h: number, items: Placement[], opacity = 1) => svgUrl(compose(w, h, items, opacity));
