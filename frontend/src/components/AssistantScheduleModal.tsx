import { Fragment, useEffect, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { DAYS, SHIFTS, PERIOD_LABELS, emptySchedule, normalizeSchedule } from '../lib/assistantSchedule';
import type { AssistantSchedule, Period } from '../lib/assistantSchedule';

const PERIOD_ORDER: Period[] = ['morning', 'afternoon', 'evening'];

interface Props {
  open: boolean;
  onClose: () => void;
  assistant: { id: number; full_name: string; schedule?: any } | null;
  editable: boolean;
  onSave?: (schedule: AssistantSchedule) => Promise<void>;
}

export default function AssistantScheduleModal({ open, onClose, assistant, editable, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AssistantSchedule>(emptySchedule());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeSchedule(assistant?.schedule));
    setEditing(false);
  }, [assistant]);

  const setCell = (day: keyof AssistantSchedule, shift: string, value: string) => {
    setDraft((prev) => ({ ...prev, [day]: { ...prev[day], [shift]: value } }));
  };

  const cancelEdit = () => {
    setDraft(normalizeSchedule(assistant?.schedule));
    setEditing(false);
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      toast.success('Đã lưu lịch làm việc');
      setEditing(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi lưu lịch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Lịch làm việc — ${assistant?.full_name || ''}`}
      size="xl"
      footer={editable ? (
        editing ? (
          <>
            <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Hủy</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu lịch'}</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Sửa lịch</button>
          </>
        )
      ) : (
        <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
      )}
    >
      <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: 10 }}>
        {editing ? 'Nhập nội dung cho từng ca (để trống nếu trợ giảng không làm việc ca đó).' : 'Ô trống nghĩa là trợ giảng không làm việc ca đó.'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Ca</th>
              {DAYS.map((d) => <th key={d.key} style={{ textAlign: 'center' }}>{d.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERIOD_ORDER.map((period) => (
              <Fragment key={period}>
                <tr>
                  <td colSpan={8} style={{ background: '#F9F9F9', fontWeight: 700, fontSize: '0.78rem', color: '#666', padding: '0.4rem 1rem' }}>
                    {PERIOD_LABELS[period]}
                  </td>
                </tr>
                {SHIFTS.filter((s) => s.period === period).map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontSize: '0.78rem', color: '#888', whiteSpace: 'nowrap' }}>{s.label}</td>
                    {DAYS.map((d) => (
                      <td key={d.key} style={{ textAlign: editing ? undefined : 'center' }}>
                        {editing ? (
                          <input
                            className="input"
                            style={{ padding: '4px 6px', fontSize: '0.8rem', minWidth: 92 }}
                            value={draft[d.key][s.key]}
                            onChange={(e) => setCell(d.key, s.key, e.target.value)}
                            placeholder="—"
                          />
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: draft[d.key][s.key] ? '#1A1A2E' : '#ccc' }}>
                            {draft[d.key][s.key] || '—'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
