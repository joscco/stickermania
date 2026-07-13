const STICKER_UPLOAD_MAX_SIDE = 1024;

export async function prepareStickerUploadDataUrl(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longSide = Math.max(width, height);
  if (longSide <= STICKER_UPLOAD_MAX_SIDE) {
    return dataUrl;
  }

  const scale = STICKER_UPLOAD_MAX_SIDE / longSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load sticker upload image"));
    image.src = dataUrl;
  });
}
