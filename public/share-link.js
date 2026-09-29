// Compact the full UUID without discarding bits or adding a database mapping.
export function shortResultCode(id) {
  const hex = id.replaceAll('-', '');
  return btoa(String.fromCharCode(...hex.match(/../g).map(byte => parseInt(byte, 16))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function resultIdFromCode(code) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return null;
  try {
    const hex = Array.from(atob(code.replaceAll('-', '+').replaceAll('_', '/') + '=='), char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return shortResultCode(id) === code ? id : null;
  } catch { return null; }
}
export function shareLink(origin, data) {
  return data?.state === 'result' && data.id ? `${origin}/s/${shortResultCode(data.id)}` : `${origin}/`;
}
