export const SHARE_IMAGE_VERSION = '14';
export const homeShare = {
  title: 'BAHM — An AI perspective on management behavior',
  description: 'Get an AI assessment of the management behavior. Describe the situation and get an honest view.'
};
export function resultDescription(story = '') {
  const suffix = ` — ${homeShare.description}`;
  const budget = 200 - Array.from(suffix).length - 2; // Opening and closing quotes.
  const characters = Array.from(story.replace(/\s+/gu, ' ').trim());
  let excerpt = characters.join('');
  if (characters.length > budget) {
    let end = characters.slice(0, budget).lastIndexOf(' ');
    if (end < 1) end = budget - 1;
    excerpt = characters.slice(0, end).join('').trimEnd() + '…';
  }
  return `"${excerpt}"${suffix}`;
}
export function shareData(origin, data) {
  const result = data?.state === 'result';
  const title = result ? `BAHM — ${data.verdict === 'yes' ? 'This behavior crosses the line' : 'This behavior doesn’t cross the line'}` : homeShare.title;
  const description = result ? resultDescription(data.story) : homeShare.description;
  return { title, description, url: `${origin}${data?.id ? `/results/${data.id}` : '/'}`, image: `${origin}/share/${result ? data.verdict : 'home'}.png?v=${SHARE_IMAGE_VERSION}`, imageAlt: result ? `BAHM. Powered by JEV. ${data.verdict === 'yes' ? 'Assessment result: this management behavior crosses the line.' : 'Assessment result: this management behavior doesn’t cross the line.'}` : 'BAHM. Is my manager crossing the line? An AI assessment of management behavior. Powered by JEV.' };
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function shareTags(meta) {
  const tags = { 'og:type': 'website', 'og:site_name': 'BAHM', 'og:locale': 'en_US', 'og:title': meta.title, 'og:description': meta.description, 'og:url': meta.url, 'og:image': meta.image, 'og:image:type': 'image/png', 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': meta.imageAlt, 'twitter:card': 'summary_large_image', 'twitter:title': meta.title, 'twitter:description': meta.description, 'twitter:image': meta.image, 'twitter:image:alt': meta.imageAlt };
  return `<title>${escapeHtml(meta.title)}</title>\n<meta name="description" content="${escapeHtml(meta.description)}">\n<link rel="canonical" href="${escapeHtml(meta.url)}">\n` + Object.entries(tags).map(([key, value]) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escapeHtml(value)}">`).join('\n');
}
