import { useEffect, useRef } from "react";

// Thumbnail of a photo that isn't uploaded yet (a File or Blob). Uses a
// temporary browser URL and frees it when the photo changes or is removed.
export default function PhotoPreview({ photo, alt }) {
  const imgRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return <img ref={imgRef} alt={alt} className="media-preview" />;
}
