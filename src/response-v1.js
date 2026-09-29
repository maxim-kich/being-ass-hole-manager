// Version 1 saved-response interpretation. Preserve this contract for existing records.
const scales = ['transparency', 'fairness', 'autonomy', 'accountability', 'respect', 'support'].map(id => ({ id }));

function validConfidence(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function choice(answers, id) {
  const answer = answers?.[id];
  if (answer?.type !== 'choice' || !['yes', 'no'].includes(answer.choice) || !validConfidence(answer.confidence)) throw new Error('Invalid choice response');
  return answer;
}

export function interpretResponse(payload) {
  const answers = payload?.answers;
  if (choice(answers, 'theme_alignment').choice === 'no') return { state: 'off-topic' };
  if (choice(answers, 'evidence_sufficiency').choice === 'no') return { state: 'insufficient' };
  const verdict = choice(answers, 'asshole');
  const scores = scales.map(({ id }) => {
    const answer = answers?.[id];
    if (answer?.type !== 'score' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > 4 || !validConfidence(answer.confidence)) throw new Error('Invalid score response');
    return { id, value: answer.score + 1, confidence: answer.confidence };
  });
  return { state: 'result', verdict: verdict.choice, confidence: verdict.confidence, scores };
}
