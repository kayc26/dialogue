// An in-memory Web Storage stand-in with an optional byte quota, so tests can
// reproduce a real browser condition: localStorage filling up (~5 MB per origin).
import type { KeyValueStore } from '../types'

export class MemoryStorage implements KeyValueStore {
  readonly data = new Map<string, string>()
  constructor(private readonly quotaChars = Infinity) {}

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  setItem(key: string, value: string): void {
    let used = 0
    for (const [k, v] of this.data) if (k !== key) used += k.length + v.length
    if (used + key.length + value.length > this.quotaChars) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}
