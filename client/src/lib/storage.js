// Service photos and videos live in the "marketplace-images" bucket; this turns
// a stored public URL back into the file's path inside that bucket.
// Used when a service is deleted (by its owner or an admin) to delete its file too.
export function storagePathFromUrl(url) {
  const marker = "/marketplace-images/";
  const index = url ? url.indexOf(marker) : -1;
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}
