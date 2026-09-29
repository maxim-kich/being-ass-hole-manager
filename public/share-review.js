import { shareLink } from './share-link.js';
import { shareData, shareTags } from './share-data.js';
import { exampleStories } from './share-examples/stories.js';
const $ = id => document.getElementById(id);
function render(example) {
  document.querySelectorAll('[data-example]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.example === example)));
  let data;
  let image;
  if (example !== 'home') {
    data = { id:'00000000-0000-4000-8000-000000000001', state:'result', verdict:example, story:exampleStories[example] };

  }
  const meta = shareData(location.origin, data);
  $('preview-note').textContent = example === 'home' ? 'Static BAHM content shared from the main page.' : 'Template example with a fictional story and a placeholder result URL.';
  $('preview-image').src = image || meta.image;
  $('preview-image').alt = meta.imageAlt;
  $('open-image').href = image || meta.image;
  for (const prefix of ['preview','content']) {
    $(`${prefix}-title`).textContent = meta.title;
    $(`${prefix}-description`).textContent = meta.description;
  }
  $('content-url').textContent = shareLink(location.origin, data);
  $('content-url').href = example === 'yes' || example === 'no' ? '#metadata' : shareLink(location.origin, data);
  $('content-alt').textContent = meta.imageAlt;
  $('metadata').textContent = shareTags(meta);
}
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => render(button.dataset.example)));
render('home');
