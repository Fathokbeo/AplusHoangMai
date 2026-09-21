import { useEffect, useRef } from 'react';

// Cử chỉ vuốt mở/đóng thanh bên trên điện thoại:
//  - Đang đóng: đặt ngón ở sát mép trái màn hình rồi vuốt sang phải → mở.
//  - Đang mở: vuốt sang trái ở bất kỳ đâu → đóng.
//
// Mọi phép đo đều quy về "vùng nhìn thật" (visualViewport) nên vẫn đúng khi người dùng đã thu phóng
// hoặc kéo trang sang trái/phải — lúc đó mép trái màn hình không còn trùng với toạ độ 0 của trang.

const EDGE_WIDTH = 28;    // bề rộng dải cạnh trái nhận cử chỉ (px trên màn hình)
const MIN_DISTANCE = 55;  // quãng vuốt tối thiểu để tính là mở/đóng (px trên màn hình)
const OFF_AXIS_RATIO = 0.8; // lệch dọc quá mức này so với ngang thì coi là cuộn trang, bỏ qua

type Options = {
  enabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export default function useEdgeSwipe({ enabled, isOpen, onOpen, onClose }: Options) {
  // Giữ callback trong ref để không phải gắn lại listener sau mỗi lần render.
  const cb = useRef({ onOpen, onClose });
  cb.current = { onOpen, onClose };

  useEffect(() => {
    if (!enabled) return;

    let startX = 0, startY = 0, tracking = false;

    // Khi thu phóng, toạ độ chạm tính theo trang còn màn hình chỉ thấy một phần —
    // offsetLeft cho biết mép trái màn hình đang ở đâu, scale để quy đổi px trang ↔ px màn hình.
    const viewLeft = () => window.visualViewport?.offsetLeft ?? 0;
    const scale = () => window.visualViewport?.scale || 1;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      // Đang mở thì vuốt ở đâu cũng đóng được; đang đóng thì phải bắt đầu từ sát mép trái.
      tracking = isOpen || (startX - viewLeft()) <= EDGE_WIDTH / scale();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * OFF_AXIS_RATIO) { tracking = false; return; }
      const need = MIN_DISTANCE / scale();
      if (!isOpen && dx >= need) { tracking = false; cb.current.onOpen(); }
      else if (isOpen && dx <= -need) { tracking = false; cb.current.onClose(); }
    };

    const stop = () => { tracking = false; };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, [enabled, isOpen]);
}
