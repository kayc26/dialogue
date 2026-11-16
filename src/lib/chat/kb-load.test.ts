// Loading the knowledge base must survive the window between a deploy and the database
// migration that adds `diabetes_type` (migration 0003): the site deploys on every push,
// and asking for a missing column is a 400 that would otherwise take the patient view
// down. ADR-0013, QST-KB-RAG-FIXES: B.

import { describe, expect, it } from 'vitest'
import { DataError, type DataClient } from '../neon/data'
import { loadPassages } from './kb-load'

const row = { id: 'ada-t2-guide-001', doc_title: 'T2', source_label: 'ADA', section: null, body: 'Text.', tags: [] }
const noSleep = () => Promise.resolve()

function client(hasColumn: boolean, other?: number): { data: DataClient; asked: string[] } {
  const asked: string[] = []
  const data: DataClient = {
    get: <T,>(path: string) => {
      asked.push(path)
      if (other) return Promise.reject(new DataError(other, `Data API ${other}`))
      if (path.includes('diabetes_type') && !hasColumn) return Promise.reject(new DataError(400, 'Data API 400'))
      return Promise.resolve([hasColumn ? { ...row, diabetes_type: 'type2' } : row] as T)
    },
  }
  return { data, asked }
}

describe('loading passages', () => {
  it('reads each passage with its diabetes type once the column exists', async () => {
    const { data, asked } = client(true)
    expect(await loadPassages(data, noSleep)).toEqual([{ ...row, diabetes_type: 'type2' }])
    expect(asked).toHaveLength(1)
  })

  it('before the migration, a missing column falls back to passages without a type, not an error', async () => {
    const { data, asked } = client(false)
    expect(await loadPassages(data, noSleep)).toEqual([row])
    expect(asked[1]).not.toContain('diabetes_type')
  })

  it('other failures still surface (a signed-out 401 is not a missing column)', async () => {
    const { data } = client(true, 401)
    await expect(loadPassages(data, noSleep)).rejects.toMatchObject({ status: 401 })
  })
})
