import { storyCard } from './story-cards.js';
const list = document.getElementById('gallery-stories');
const message = document.getElementById('gallery-message');
const more = document.getElementById('gallery-more');
let next = 0;
async function load() {
  more.disabled = true;
  message.textContent = 'Loading stories…';
  try {
    const response = await fetch(`/api/gallery?offset=${next}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const gallery = document.getElementById('gallery-view');
    gallery.dataset.visible = String(data.visible);
    gallery.hidden = !data.visible || document.getElementById('input-view').hidden;
    if (!data.visible) { list.replaceChildren(); more.hidden = true; return; }
    list.append(...data.stories.map(storyCard));
    next = data.next;
    more.hidden = next === null;
    more.textContent = 'More stories';
    message.textContent = list.children.length ? '' : 'The first stories are being handpicked. Check back soon.';
  } catch {
    message.textContent = 'Stories couldn’t load. Please try again.';
    more.textContent = 'Try again';
    more.hidden = false;
  } finally { more.disabled = false; }
}
more.addEventListener('click', load);
load();
