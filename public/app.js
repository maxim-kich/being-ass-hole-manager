import { requestErrors, genericError } from './request-errors.js';
import { shareLink } from './share-link.js';
import { scales, wordCount, validateSituation } from './shared.js';

const $ = id => document.getElementById(id);
const previewState = new URLSearchParams(location.search).get('ui-state') || document.documentElement.dataset.uiState;
const savedPath = location.pathname.startsWith('/results/');
const views = ['input', 'feedback', 'result', 'saved'];
let submission = null;
let activeRequest = null;
let loading = false;
let shareResult = null;
let shareResetTimer;
$('share').setAttribute('aria-live', 'polite');
$('share').addEventListener('click', async () => {
  const button = $('share');
  const url = shareLink(location.origin, shareResult);
  clearTimeout(shareResetTimer);
  $('share-status').textContent = '';
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Link copied';
    button.dataset.state = 'copied';
  } catch {
    button.textContent = 'Copy failed';
    const link = document.createElement('a'); link.href = url; link.textContent = 'Copy this share link';
    $('share-status').replaceChildren(link);
  }
  shareResetTimer = setTimeout(() => {
    button.textContent = 'Share';
    delete button.dataset.state;
    $('share-status').textContent = '';
  }, 2000);
});
function show(view, focusId) {
  $('gallery-view').hidden = view !== 'input' || $('gallery-view').dataset.visible !== 'true';
  $('main').classList.toggle('home-main', view === 'input');
  if (view !== 'result') shareResult = null;
  views.forEach(id => { $(`${id}-view`).hidden = id !== view; });
  if (focusId && !previewState) {
    $(focusId).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
function updateButton() {
  $('submit').disabled = loading || Boolean(validateSituation($('situation').value));
}
function updateCount() {
  const count = wordCount($('situation').value);
  $('word-count').textContent = `${count} / 500 words`;
  $('word-count').hidden = count <= 500;
  $('situation').setAttribute('aria-invalid', String(count > 500));
  $('form-error').hidden = true;
  updateButton();
}
function setLoading(value) {
  loading = value;
  $('submit').setAttribute('aria-busy', String(value));
  $('submit-label').textContent = value ? 'Sending…' : 'Send';
  $('submit').querySelector('.button-spinner').hidden = !value;
  $('situation').readOnly = value;
  updateButton();
}
function showError(code) {
  $('form-error').textContent = requestErrors[code] || genericError;
  $('form-error').hidden = false;
}
function editStory() {
  if (savedPath) { location.assign('/'); return; }
  show('input', 'situation');
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderResult(data, story = $('situation').value) {
  if (data.state === 'off-topic' || data.state === 'insufficient') {
    $('feedback-story').textContent = story;
    const offTopic = data.state === 'off-topic';
    $('feedback-title').textContent = offTopic ? 'Let’s keep it about management.' : 'A little more to go on.';
    $('feedback-copy').textContent = offTopic ? 'This check is for situations involving a manager, leader or someone using workplace authority.' : 'Tell us a little about what your manager says or does. A general pattern or brief example is enough; exact quotes aren’t needed.';
    show('feedback', 'feedback-title');
    return;
  }
  if (data.state !== 'result' || !['yes', 'no'].includes(data.verdict) || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1 || !Array.isArray(data.scores) || data.scores.length !== scales.length) throw new Error('Invalid assessment');
  const yes = data.verdict === 'yes';
  $('result-view').dataset.verdict = data.verdict;
  let storyTitle = document.getElementById('story-title');
  if (!storyTitle) { storyTitle = el('h2', 'story-title'); storyTitle.id = 'story-title'; $('submitted-story').before(storyTitle); }
  storyTitle.textContent = data.title || '';
  storyTitle.hidden = !data.title;
  $('submitted-story').textContent = story;
  $('submitted-story').setAttribute('aria-label', data.edited ? 'Edited story' : 'Your submitted story');
  $('verdict-title').textContent = yes ? 'Yes. That’s @-h*le behavior.' : 'No. This doesn’t cross the line.';
  $('confidence').textContent = `Model confidence: ${Math.round(data.confidence * 100)}%`;
  const cards = scales.map(scale => {
    const score = data.scores.find(item => item.id === scale.id);
    if (!score || !Number.isFinite(score.value) || score.value < 1 || score.value > 5 || !Number.isFinite(score.confidence) || score.confidence < 0 || score.confidence > 1) throw new Error('Invalid assessment');
    const card = el('article', 'scale');
    const title = el('div', 'scale-title');
    const label = el('div', 'scale-label');
    label.append(el('span', '', scale.label));
    const info = el('button', 'info-button');
    info.type = 'button';
    info.setAttribute('aria-label', `About ${scale.label.toLowerCase()}`);
    info.setAttribute('aria-describedby', `tooltip-${scale.id}`);
    const icon = el('span', '', 'i');
    icon.setAttribute('aria-hidden', 'true');
    info.append(icon);
    const tooltip = el('div', 'scale-tooltip');
    tooltip.id = `tooltip-${scale.id}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.append(el('p', '', scale.instructions));
    const levels = el('ol');
    levels.append(...scale.criteria.map(level => el('li', '', level)));
    tooltip.append(levels);
    info.addEventListener('keydown', event => {
      if (event.key === 'Escape') { info.blur(); label.classList.add('tooltip-dismissed'); }
    });
    label.addEventListener('mouseleave', () => label.classList.remove('tooltip-dismissed'));
    info.addEventListener('focus', () => label.classList.remove('tooltip-dismissed'));
    label.append(info, tooltip);
    title.append(label, el('span', '', `${score.value.toFixed(1)} / 5`));
    const progress = el('progress');
    progress.max = 4;
    progress.value = score.value - 1;
    progress.setAttribute('aria-label', `${scale.label}: ${score.value.toFixed(1)} out of 5`);
    card.append(title, progress, el('span', 'scale-description', scale.criteria[Math.round(score.value - 1)]), el('span', 'scale-meta', `${Math.round(score.confidence * 100)}% model confidence`));
    return card;
  });
  $('scales').replaceChildren(...cards);
  show('result', 'verdict-title');
}

$('situation').addEventListener('input', updateCount);
$('story-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (activeRequest || loading) return;
  const situation = $('situation').value;
  if (validateSituation(situation)) { updateCount(); return; }
  if (!submission || submission.story !== situation) submission = { id: crypto.randomUUID(), story: situation };
  const controller = new AbortController();
  activeRequest = controller;
  $('form-error').hidden = true;
  const timer = setTimeout(() => controller.abort('timeout'), 30000);
  setLoading(true);
  try {
    const response = await fetch('/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situation, id: submission.id }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('Assessment failed'), { code: response.status === 429 ? data.code : undefined });
    if (activeRequest === controller) location.assign(`/results/${data.id}`);
  } catch (error) {
    if (activeRequest !== controller) return;
    editStory();
    showError(error.code);
  } finally {
    clearTimeout(timer);
    if (activeRequest === controller) { activeRequest = null; setLoading(false); }
  }
});
$('feedback-edit').addEventListener('click', editStory);
$('reset').addEventListener('click', () => { $('situation').value = ''; $('submitted-story').textContent = ''; $('scales').replaceChildren(); updateCount(); editStory(); });
updateCount();

// Optional agent access prepares the same visible form; it never submits a story.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'prepare_management_story',
      title: 'Prepare a management story',
      description: 'Fill the visible story field for review. Does not submit it to JEV or run an assessment.',
      inputSchema: { type: 'object', properties: { situation: { type: 'string' } }, required: ['situation'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (activeRequest) throw new Error('Wait for the current assessment or cancel it first.');
        const error = validateSituation(input?.situation);
        if (error) throw new Error(error);
        $('situation').value = input.situation;
        updateCount();
        editStory();
        return { state: 'input', words: wordCount(input.situation), submitted: false };
      }
    }, { signal: lifecycle.signal })).catch(() => { /* Optional API; form remains available. */ });
  } catch { /* Unsupported implementations do not affect the form. */ }
}

// Fixed UI review fixtures use the same renderer without making assessment calls.
if (previewState && !savedPath) {
  const { renderPreview } = await import('./ui-states.js');
  renderPreview(previewState, { show, updateCount, showError, setLoading, renderResult, scales });
}


function savedMessage(title, copy, story = '') {
  $('saved-title').textContent = title;
  $('saved-copy').textContent = copy;
  $('saved-story').textContent = story;
  $('saved-story').hidden = !story;
  show('saved', 'saved-title');
}

async function loadSavedResult() {
  const match = location.pathname.match(/^\/results\/([0-9a-f-]+)$/);
  if (!match) { savedMessage('Result not found.', 'Check that you have the complete result URL.'); return; }
  const id = match[1];
  savedMessage('Loading your result…', 'Retrieving the saved assessment.');
  try {
    const response = await fetch(`/api/results/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (response.status === 404) {
      savedMessage('Result not found.', 'Check that you have the complete result URL.');
      return;
    }
    if (!response.ok) throw new Error('Could not load result');
    const data = await response.json();
    if (data.status === 'pending') {
      savedMessage('Assessment in progress.', 'This page will update when your result is ready.', data.story);
      setTimeout(loadSavedResult, 2500);
    } else if (data.status === 'failed') {
      savedMessage('Assessment could not be completed.', 'Your story was saved, but no usable assessment is available. You can start a new assessment.', data.story);
    } else {
      renderResult(data, data.story);
      if (data.state === 'result') shareResult = data;
    }
  } catch {
    savedMessage('Could not load this result.', 'Please refresh the page to try again.');
  }
}
if (savedPath) loadSavedResult();

if (!savedPath) {
  if (!previewState) { show('input'); await import('./gallery.js'); }
} else $('gallery-view').hidden = true;
