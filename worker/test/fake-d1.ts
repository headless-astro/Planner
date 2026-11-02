// A stand-in for Cloudflare D1 in tests: Node's built-in SQLite (D1 is SQLite too), with the
// real migrations applied and the small part of the D1 API the Worker uses.
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

/**
 * D1 binds numbered parameters (?1, ?2) by position, and Node's SQLite treats them as named.
 * So they become plain ? marks, with the values lined up to match.
 */
function plainParameters(sql: string, params: SQLInputValue[]): [string, SQLInputValue[]] {
  const order: number[] = []
  const text = sql.replace(/\?(\d+)/g, (_, number: string) => {
    order.push(Number(number) - 1)
    return '?'
  })
  return order.length ? [text, order.map((index) => params[index])] : [sql, params]
}

class Statement {
  private readonly sql: string
  private readonly params: SQLInputValue[]

  constructor(
    private readonly db: DatabaseSync,
    private readonly source: string,
    params: SQLInputValue[] = [],
  ) {
    ;[this.sql, this.params] = plainParameters(source, params)
  }

  bind(...params: unknown[]) {
    return new Statement(this.db, this.source, params as SQLInputValue[])
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined
    if (!row) return null
    return (column ? row[column] : { ...row }) as T
  }

  async all<T>() {
    const results = this.db
      .prepare(this.sql)
      .all(...this.params)
      .map((row) => ({ ...row }))
    return { success: true, meta: { changes: 0 }, results: results as T[] }
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }, results: [] }
  }
}

export function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const folder = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, folder), 'utf8'))
  const fake = {
    prepare: (sql: string) => new Statement(db, sql),
    // A D1 batch runs as one transaction.
    async batch(statements: Statement[]) {
      db.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        db.exec('COMMIT')
        return results
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    async exec(sql: string) {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
  }
  return fake as unknown as D1Database
}
