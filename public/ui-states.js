export const states = [
  ['empty', 'Empty story', 'Send disabled; counter hidden. Fixed manager question heading.'],
  ['logo', 'Expanded ASCII logo', 'Being A-Hole Manager on hover or keyboard focus.'],
  ['filled', 'Story ready', 'Send enabled; counter hidden.'],
  ['word-limit', 'Over 500 words', 'Send disabled; only the word counter is shown.'],
  ['loading', 'Sending', 'Loading inside the button; the story stays visible.'],
  ['off-topic', 'Off-topic story', 'Simplified management feedback.'],
  ['insufficient', 'More detail needed', 'Simplified context feedback.'],
  ['yes', 'Yes verdict', 'Original story above the verdict; illustrative scores.'],
  ['no', 'No verdict', 'Original story above the verdict; illustrative scores.'],
  ['yes-tentative', 'Yes · lower confidence', 'Confidence percentage only.'],
  ['no-tentative', 'No · lower confidence', 'Confidence percentage only.'],
  ['tooltip', 'Scale information tooltip', 'Full scale explanation on hover, keyboard focus or tap.'],
  ['error', 'Something went wrong', 'Generic service or connection failure. Story retained.'],
  ['daily-limit', 'Daily assessment limit', 'Daily capacity reached; resets at midnight UTC. Story retained.'],
  ['ip-limit', 'One assessment per minute', 'Wait one minute before another assessment. Story retained.']
];

export function renderPreview(id, { show, updateCount, showError, setLoading, renderResult, scales }) {
  const $ = id => document.getElementById(id);
  show('input');
  const story = 'During our team meeting, my manager blamed me for a missed deadline even though I had flagged the dependency a week earlier. They interrupted when I tried to explain, then told the team I needed to take more ownership. Afterwards, I asked for a private conversation about what happened.';
  $('situation').value = ['empty', 'logo'].includes(id) ? '' : id === 'word-limit' ? Array(501).fill('story').join(' ') : story;
  updateCount();
  if (id === 'error') showError();
  if (id === 'daily-limit') showError('daily_limit');
  if (id === 'ip-limit') showError('ip_limit');
  if (id === 'loading') setLoading(true);
  if (['off-topic', 'insufficient'].includes(id)) renderResult({ state: id });
  if (['yes', 'no', 'yes-tentative', 'no-tentative', 'tooltip'].includes(id)) {
    const no = id.startsWith('no');
    renderResult({ state: 'result', verdict: no ? 'no' : 'yes', confidence: id.includes('tentative') ? .54 : .89,
      scores: scales.map((scale, i) => ({ id: scale.id, value: (no ? [4.2, 4, 4, 4.3, 4.1, 3.7] : [2.1, 1.8, 3, 1.5, 1.3, 2.2])[i], confidence: .72 + i * .02 })) });
  }
  if (id === 'tooltip') document.querySelector('.scale-label').classList.add('tooltip-preview');
  document.activeElement?.blur();
  $('situation').readOnly = true;
  document.addEventListener('click', event => { if (event.target.closest('button, a')) event.preventDefault(); }, true);
  document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  document.querySelectorAll('button').forEach(button => button.addEventListener('click', event => event.stopImmediatePropagation(), true));
  document.documentElement.classList.add('ui-preview');
  if (id === 'logo') document.querySelector('.wordmark').classList.add('logo-expanded');

  document.documentElement.dataset.previewReady = id;
}
