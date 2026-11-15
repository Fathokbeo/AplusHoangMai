// Thu nhỏ ảnh chụp từ điện thoại (thường vài MB) về cạnh dài tối đa 800px, JPEG — tải lên nhanh, hiển thị đủ nét.
export async function shrinkImage(file: File, maxSide = 800): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file; // trình duyệt không đọc được (vd. HEIC) → gửi nguyên ảnh
  }
}
