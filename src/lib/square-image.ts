// Solo navegador. Lee una imagen elegida por el usuario, la recorta al
// centro en cuadrado y la re-codifica a JPEG de size×size. Antes este mismo
// código estaba copiado en AdminSidebar, PortalSidebar y TopBar.

export type SquareImageError = "too_large" | "read_failed" | "unsupported";

export class SquareImageException extends Error {
  constructor(public code: SquareImageError) {
    super(code);
  }
}

// El archivo original solo se lee a un canvas y se re-codifica, así que este
// tope solo evita colgarse con una decodificación enorme — el límite real es
// el que revisa el servidor sobre el resultado comprimido (updateAvatar /
// updateOrgLogo). Las fotos de celular suelen pesar 8-15MB.
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export function readImageFileAsSquareDataUrl(file: File, size = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_INPUT_BYTES) {
      reject(new SquareImageException("too_large"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new SquareImageException("read_failed"));
    reader.onload = (event) => {
      const img = new window.Image();
      img.onerror = () => reject(new SquareImageException("unsupported"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = event.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function squareImageErrorMessage(error: unknown, lang: "es" | "en"): string {
  const code = error instanceof SquareImageException ? error.code : "read_failed";
  const messages: Record<SquareImageError, { es: string; en: string }> = {
    too_large: { es: "Imagen demasiado grande (máx. 20MB)", en: "Image too large (max 20MB)" },
    read_failed: { es: "No se pudo leer la imagen", en: "Could not read the image" },
    unsupported: { es: "Formato de imagen no compatible", en: "Unsupported image format" },
  };
  return messages[code][lang];
}
