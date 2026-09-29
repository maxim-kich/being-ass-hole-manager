export const MAX_WORDS = 500;
export function wordCount(text) { return text.trim().match(/\S+/gu)?.length ?? 0; }
export function validateSituation(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Describe what happened before asking for an assessment.';
  if (wordCount(value) > MAX_WORDS) return 'Please shorten your story to 500 words or fewer.';
  return null;
}

export const scales = [
  { id: 'transparency', label: 'Transparency', instructions: 'How openly and honestly are relevant reasons and information communicated?', criteria: ['Deceptive or deliberately concealing key information.', 'Opaque or materially withholding information.', 'Partial explanation with important gaps.', 'Mostly open and honest.', 'Highly open about reasons, constraints and uncertainty.'] },
  { id: 'fairness', label: 'Fairness', instructions: 'How fairly and consistently are relevant standards applied?', criteria: ['Clearly arbitrary, biased, retaliatory or favoritist.', 'Mostly inconsistent or unfair.', 'Mixed or questionable consistency.', 'Mostly fair and consistent.', 'Highly impartial and appropriately consistent.'] },
  { id: 'autonomy', label: 'Autonomy', instructions: 'How much appropriate control does the employee retain over their work?', criteria: ['Highly controlling or micromanaging.', 'Mostly controlling.', 'Mixed autonomy and control.', 'Mostly autonomy-supportive.', 'High appropriate ownership and discretion.'] },
  { id: 'accountability', label: 'Accountability', instructions: 'How well does the manager own their decisions, mistakes and responsibilities?', criteria: ['Actively shifts blame.', 'Mostly avoids responsibility.', 'Mixed ownership.', 'Mostly accountable.', 'Clearly owns responsibility and corrective action.'] },
  { id: 'respect', label: 'Respect', instructions: 'How respectfully does the manager treat the employee in their words and actions?', criteria: ['Demeaning, insulting or humiliating.', 'Frequently dismissive or belittling.', 'Mixed respectful and dismissive behavior.', 'Mostly considerate and respectful.', 'Consistently preserves dignity, including during disagreement.'] },
  { id: 'support', label: 'Support', instructions: 'How well does the manager provide appropriate guidance, resources and help with obstacles?', criteria: ['Deliberately obstructs work or withholds necessary support.', 'Neglects clear needs for guidance or resources.', 'Provides uneven or incomplete support.', 'Usually provides useful guidance and resources.', 'Actively removes obstacles and provides appropriate, timely support.'] }
];
