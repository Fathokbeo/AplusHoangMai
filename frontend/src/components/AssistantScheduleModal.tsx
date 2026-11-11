import { useEffect, useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import ScheduleGrid from './ScheduleGrid';
import { emptySchedule, normalizeSchedule } from '../lib/assistantSchedule';
import type { AssistantSchedule } from '../lib/assistantSchedule';

interface Props {
  open: boolean;
  onClose: () => void;
  assistant: { id: number; full_name: string; schedule?: any; class_count?: number } | null;
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
      {editing && (assistant?.class_count || 0) > 1 && (
        <div style={{ background: '#E3F2FD', color: '#1565C0', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.8rem', marginBottom: 10 }}>
          Lịch này dùng chung cho {assistant?.class_count} lớp của trợ giảng, sửa ở đây sẽ đồng bộ sang tất cả các lớp đó.
        </div>
      )}
      <ScheduleGrid value={draft} editing={editing} onChange={setDraft} />
    </Modal>
  );
}
