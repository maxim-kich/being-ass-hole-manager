import { validateSituation } from './shared.js';
import { storyCard } from './story-cards.js';
const $ = id => document.getElementById(id);
let next = 0;
let busy = false;
async function api(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, { ...options, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) signedIn(false);
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}
function signedIn(value) {
  $('login-view').hidden = value;
  $('admin-view').hidden = !value;
  $('logout').hidden = !value;
  if (!value) $('admin-stories').replaceChildren();
}
function reviewCard(story) {
  const wrapper = document.createElement('article');
  wrapper.className = 'review-card';
  let preview = storyCard(story);
  wrapper.append(preview);
  const controls = document.createElement('div');
  controls.className = 'review-controls';
  const status = document.createElement('span');
  const button = document.createElement('button');
  button.className = 'secondary';
  function update() {
    button.classList.toggle('remove-featured', story.featured);
    status.textContent = story.featured ? 'On the homepage' : story.state === 'result' ? 'Not featured' : ({ 'off-topic': 'Off topic', insufficient: 'Needs more detail', unavailable: 'Assessment unavailable' }[story.state] || story.status);
    button.textContent = story.featured ? 'Remove from homepage' : 'Feature on homepage';
    button.setAttribute('aria-pressed', String(story.featured));
    button.disabled = story.state !== 'result' && !story.featured;
  }
  update();
  button.addEventListener('click', async () => {
    button.disabled = true;
    $('admin-message').textContent = '';
    try {
      const data = await api(`stories/${story.id}/featured`, { method: story.featured ? 'DELETE' : 'PUT' });
      story.featured = data.featured;
      $('admin-message').textContent = story.featured ? 'Story added to the homepage.' : 'Story removed from the homepage.';
      if (($('filter').value === 'featured' && !story.featured) || ($('filter').value === 'unfeatured' && story.featured)) await load(true);
    } catch (error) { $('admin-message').textContent = error.message; }
    finally { update(); }
  });
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'secondary';
  editButton.textContent = 'Edit';
  editButton.disabled = story.status === 'pending';
  const editor = document.createElement('form');
  editor.className = 'story-editor';
  editor.id = `editor-${story.id}`;
  editor.hidden = true;
  editButton.setAttribute('aria-controls', editor.id);
  editButton.setAttribute('aria-expanded', 'false');
  const original = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Original submission';
  const originalText = document.createElement('blockquote');
  originalText.textContent = story.original_story;
  original.append(summary, originalText);
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Title (optional)';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 120;
  titleInput.id = `edit-title-${story.id}`;
  titleLabel.htmlFor = titleInput.id;
  const label = document.createElement('label');
  label.textContent = 'Edited publication version';
  const input = document.createElement('textarea');
  input.id = `edit-story-${story.id}`;
  label.htmlFor = input.id;
  input.required = true;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Shown on the result page and homepage. Remove identifying details without changing the meaning. The original and its AI assessment are preserved.';
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary';
  save.textContent = 'Save edited version';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  actions.append(save, cancel);
  function closeEditor() { editor.hidden = true; editButton.setAttribute('aria-expanded', 'false'); editButton.focus(); }
  editButton.addEventListener('click', () => {
    if (!editor.hidden) { closeEditor(); return; }
    titleInput.value = story.title || '';
    input.value = story.edited_story ?? story.original_story;
    error.textContent = '';
    editor.hidden = false;
    editButton.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  cancel.addEventListener('click', closeEditor);
  editor.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
    const invalid = validateSituation(input.value);
    if (invalid) { error.textContent = invalid; return; }
    save.disabled = cancel.disabled = editButton.disabled = true;
    input.readOnly = titleInput.readOnly = true;
    error.textContent = '';
    try {
      const data = await api(`stories/${story.id}/edit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: input.value, title: titleInput.value }) });
      Object.assign(story, { title: '' }, data);
      const replacement = storyCard(story);
      preview.replaceWith(replacement);
      preview = replacement;
      editor.hidden = true;
      editButton.setAttribute('aria-expanded', 'false');
      $('admin-message').textContent = 'Edited version saved. The original submission and AI assessment are unchanged.';
    } catch (failure) { error.textContent = failure.message; }
    finally { save.disabled = cancel.disabled = editButton.disabled = false; input.readOnly = titleInput.readOnly = false; if (editor.hidden) editButton.focus(); }
  });
  editor.append(original, titleLabel, titleInput, label, input, hint, error, actions);
  controls.append(status, editButton, button);
  wrapper.append(editor);
  wrapper.append(controls);
  return wrapper;
}
async function load(reset = false) {
  if (busy) return;
  busy = true;
  $('refresh').disabled = $('admin-more').disabled = $('filter').disabled = $('verdict-filter').disabled = $('outcome-filter').disabled = true;
  if (reset) next = 0;
  try {
    const data = await api(`stories?filter=${$('filter').value}&verdict=${$('verdict-filter').value}&outcome=${$('outcome-filter').value}&offset=${next}`);
    if (reset) {
      $('gallery-visible').disabled = true;
      const settings = await api('gallery-visibility');
      $('gallery-visible').checked = settings.visible;
      $('gallery-visible').disabled = false;
    }
    signedIn(true);
    if (reset) $('admin-stories').replaceChildren();
    $('admin-stories').append(...data.stories.map(reviewCard));
    next = data.next;
    $('admin-more').hidden = next === null;
    $('admin-empty').hidden = Boolean($('admin-stories').children.length);
  } finally { busy = false; $('refresh').disabled = $('admin-more').disabled = $('filter').disabled = $('verdict-filter').disabled = $('outcome-filter').disabled = false; }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-submit').disabled = true;
  $('admin-message').textContent = '';
  try {
    await api('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }) });
    $('password').value = '';
    await load(true);
  } catch (error) { $('admin-message').textContent = error.message; }
  finally { $('login-submit').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await api('logout', { method: 'POST' }); signedIn(false); $('admin-message').textContent = ''; $('password').focus(); }
  catch (error) { $('admin-message').textContent = error.message; }
});
for (const [id, event, reset] of [['filter', 'change', true], ['verdict-filter', 'change', true], ['outcome-filter', 'change', true], ['refresh', 'click', true], ['admin-more', 'click', false]]) $(id).addEventListener(event, () => load(reset).catch(error => { $('admin-message').textContent = error.message; }));
load(true).catch(error => { if (error.message !== 'Please sign in.') $('admin-message').textContent = error.message; });

$('gallery-visible').addEventListener('change', async event => {
  const toggle = event.currentTarget;
  const previous = !toggle.checked;
  toggle.disabled = true;
  $('admin-message').textContent = '';
  try {
    const data = await api('gallery-visibility', { method: toggle.checked ? 'PUT' : 'DELETE' });
    toggle.checked = data.visible;
    $('admin-message').textContent = data.visible ? 'Section shown on the homepage.' : 'Section hidden from the homepage.';
  } catch (error) {
    toggle.checked = previous;
    $('admin-message').textContent = error.message;
  } finally { toggle.disabled = false; }
});
