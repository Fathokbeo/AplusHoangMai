// Ô nhập dùng chung cho form khóa học:
//  - CategoryField: danh mục khóa học (THCS, THPT, HSA, TSA… hoặc tự gõ) — trang chủ chia hàng theo danh mục

const COURSE_CATEGORY_SUGGESTIONS = ['THCS', 'THPT', 'HSA', 'TSA'];

export function CategoryField({ value, onChange, existing = [] }: { value: string; onChange: (v: string) => void; existing?: string[] }) {
  const options = [...new Set([...COURSE_CATEGORY_SUGGESTIONS, ...existing.filter(Boolean)])];
  return (
    <div className="form-group">
      <label className="label">Danh mục</label>
      <input className="input" list="course-category-options" placeholder="vd: THCS, THPT, HSA, TSA…" maxLength={40}
        value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="course-category-options">
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {options.map((o) => (
          <button key={o} type="button" className="btn btn-sm" onClick={() => onChange(o)}
            style={{ padding: '2px 10px', fontSize: '0.75rem', background: value === o ? '#FFEBEE' : '#F5F5F5', color: value === o ? '#C62828' : '#666', border: 'none' }}>
            {o}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>Trang chủ xếp các khóa cùng danh mục thành 1 hàng.</div>
    </div>
  );
}
