/**
 * Resize a user-uploaded image file to a small JPEG data URL for set thumbnails.
 * Returns a promise resolving to a data URL string (~10-20KB).
 */
export function resizeImageToThumbnail(file: File, size = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const thumb = document.createElement('canvas');
      thumb.width = size;
      thumb.height = size;

      const ctx = thumb.getContext('2d');
      if (!ctx) { reject(new Error('Could not get canvas context')); return; }

      // Fill with dark background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, size, size);

      // Crop to center square from source
      const srcSize = Math.min(img.width, img.height);
      const sx = (img.width - srcSize) / 2;
      const sy = (img.height - srcSize) / 2;
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

      URL.revokeObjectURL(img.src);
      resolve(thumb.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Open a file picker for the user to select an image, resize it, and return the data URL.
 * Returns null if the user cancels.
 */
export function pickThumbnailImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const dataUrl = await resizeImageToThumbnail(file);
        resolve(dataUrl);
      } catch (e) {
        console.error('[thumbnailCapture] resize failed:', e);
        resolve(null);
      }
    };
    // Handle cancel (no file selected)
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
