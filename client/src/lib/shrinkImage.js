// Phone photos are often 5–12 MB: over the 5 MB upload limit and slow to send
// on mobile data. This redraws a photo at most MAX_SIDE pixels wide or tall
// as a JPEG (usually 300–500 KB). The browser applies the photo's hidden
// "rotate me" info while drawing, so sideways phone photos come out upright.
const MAX_SIDE = 1600;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file couldn't be opened as a photo. Please use a JPG or PNG photo."));
    img.src = url;
  });
}

export async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("This photo couldn't be processed. Please try another one.");

    // Keep the original name (so the user recognizes it) but as a .jpg.
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
