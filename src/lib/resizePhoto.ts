// Phone photos can be 5-10 MB. We shrink them in the browser before upload so
// they send fast and fit under the server's size limit. Claude doesn't need
// more than ~1500 pixels to see a haircut clearly.
export async function resizePhoto(file: File, maxSide = 1500): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read photo"))), "image/jpeg", 0.85),
  );
}
