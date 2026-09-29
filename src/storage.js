import { interpretResponse } from './response-v1.js';

export const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);

export async function readAssessment(db, id) {
  // A stopped Worker must not leave a result processing forever. Normal calls time out at 25s.
  await db.prepare("UPDATE assessments SET status = 'failed' WHERE id = ? AND status = 'pending' AND created_at < ?")
    .bind(id, new Date(Date.now() - 120000).toISOString()).run();
  return db.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
}

export function presentAssessment(row) {
  const base = { id: row.id, ...(row.title ? { title: row.title } : {}), story: row.edited_story ?? row.story, ...(row.edited_story != null ? { edited: true } : {}), created_at: row.created_at, model: row.model, status: row.status };
  if (row.status !== 'completed') return base;
  if (row.schema_version !== 1) throw new Error('Unsupported saved response version');
  return { ...base, ...interpretResponse(JSON.parse(row.model_response)) };
}
