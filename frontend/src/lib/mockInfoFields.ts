// Các ô thông tin khách điền trước khi làm đề thi thử — admin tự chỉnh (Admin → Thi thử → "Thông tin cần điền").
// Khớp với backend/src/services/mockInfoFields.js.

export type InfoFieldType = 'text' | 'grade' | 'score' | 'phone' | 'number';
export type InfoField = {
  key: string; label: string; type: InfoFieldType; placeholder?: string;
  required: boolean; enabled?: boolean; builtin?: boolean; locked?: boolean;
};

// Mặc định (khi chưa tải được cấu hình từ server) — giống cấu hình gốc
export const DEFAULT_INFO_FIELDS: InfoField[] = [
  { key: 'full_name', label: 'Họ và tên học sinh', type: 'text', placeholder: 'vd: Nguyễn Minh Anh', required: true },
  { key: 'grade', label: 'Khối lớp', type: 'grade', required: true },
  { key: 'class_name', label: 'Lớp', type: 'text', placeholder: 'vd: 9A2', required: true },
  { key: 'school', label: 'Trường', type: 'text', placeholder: 'vd: THCS Hoàng Mai', required: true },
  { key: 'gpa', label: 'Điểm trung bình kì gần nhất', type: 'score', placeholder: 'vd: 8.2', required: true },
  { key: 'parent_phone', label: 'Số điện thoại phụ huynh', type: 'phone', placeholder: 'vd: 0912 345 678', required: true },
];

export const MOCK_GRADES = [6, 7, 8, 9, 10, 11, 12];

export type InfoValues = Record<string, string>;

// Kiểm tra thông tin theo cấu hình → { key: thông báo lỗi }
export function validateInfoValues(fields: InfoField[], v: InfoValues): Record<string, string> {
  const e: Record<string, string> = {};
  fields.forEach((f) => {
    const raw = String(v[f.key] ?? '').trim();
    if (!raw) { if (f.required) e[f.key] = f.type === 'grade' ? 'Chọn khối lớp' : `Nhập ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`; return; }
    if (f.type === 'grade' && !MOCK_GRADES.includes(Number(raw))) e[f.key] = 'Chọn khối lớp';
    else if (f.type === 'score') { const n = Number(raw.replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 10) e[f.key] = 'Điểm từ 0 đến 10'; }
    else if (f.type === 'number') { if (!Number.isFinite(Number(raw.replace(',', '.')))) e[f.key] = 'Phải là số'; }
    else if (f.type === 'phone') { if (!/^(\+84|0)\d{9,10}$/.test(raw.replace(/[\s.-]/g, ''))) e[f.key] = 'Số điện thoại chưa đúng'; }
    else if (f.key === 'full_name' && raw.length < 2) e[f.key] = 'Nhập họ tên học sinh';
  });
  return e;
}

// Hiển thị 1 ô: "Khối 9", "ĐTB 8,2"...
export function displayValue(f: InfoField, value: any): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (f.type === 'grade') return `Khối ${s}`;
  if (f.type === 'score' || f.type === 'number') return s.replace('.', ',');
  return s;
}
