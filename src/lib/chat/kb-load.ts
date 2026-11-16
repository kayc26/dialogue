// Load the knowledge-base passages after sign-in (ADR-0005: searched in the browser).
//
// Passages carry their document's diabetes type once migration 0003 adds the column
// (ADR-0013, QST-KB-RAG-FIXES: B). The site deploys on every push, before any database
// change, and asking the Data API for a column that doesn't exist yet is an error
// (400), which would take the whole patient view down. So the first read asks for the
// column, and a 400 retries without it: search then just doesn't rank by type.

import { DataError, getNonEmpty, type DataClient } from '../neon/data'
import type { KbPassage } from './retrieve'

const BASE = 'kb_chunks?select=id,doc_title,source_label,section,body,tags'

export async function loadPassages(data: DataClient, sleep?: (ms: number) => Promise<void>): Promise<KbPassage[]> {
  try {
    return await getNonEmpty<KbPassage>(data, `${BASE},diabetes_type`, { sleep })
  } catch (e) {
    if (e instanceof DataError && e.status === 400) return getNonEmpty<KbPassage>(data, BASE, { sleep })
    throw e
  }
}
