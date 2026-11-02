// Backups: everything that syncs, saved to a JSON file and merged back in.
import type { Table } from 'dexie'
import { toISODate } from './dates'
import { db, DIRTY, SYNCED_TABLES, type Synced, type SyncedTableName } from './db'

export interface Backup {
  app: 'planner'
  version: 1
  exportedAt: string
  tables: Partial<Record<SyncedTableName, unknown[]>>
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
}

const table = (name: SyncedTableName) => db.table(name) as Table<Synced, string>

/** Includes deleted records, so restoring a backup can't bring deleted things back. */
export async function exportBackup(): Promise<Backup> {
  const tables: Backup['tables'] = {}
  for (const name of SYNCED_TABLES) {
    // The sync mark is about this device only.
    tables[name] = (await table(name).toArray()).map((row) => {
      const { [DIRTY]: _sent, ...rest } = row as Synced & Record<string, unknown>
      return rest
    })
  }
  return { app: 'planner', version: 1, exportedAt: new Date().toISOString(), tables }
}

/**
 * Merges a backup into this device. A record is taken when it's new here or newer than the
 * copy here, so an import never overwrites more recent changes.
 */
export async function importBackup(data: unknown): Promise<ImportResult> {
  if (!isBackup(data)) throw new Error('This file is not a planner backup.')
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }
  await db.transaction('rw', SYNCED_TABLES.map(table), async () => {
    for (const name of SYNCED_TABLES) {
      const rows = data.tables[name]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (!isRecord(row)) {
          result.skipped++
          continue
        }
        const current = await table(name).get(row.id)
        if (!current) {
          await table(name).put(row)
          result.added++
        } else if (current.updatedAt < row.updatedAt) {
          await table(name).put(row)
          result.updated++
        } else {
          result.skipped++
        }
      }
    }
  })
  return result
}

function isBackup(data: unknown): data is Backup {
  if (typeof data !== 'object' || data === null) return false
  const backup = data as Partial<Backup>
  return backup.app === 'planner' && backup.version === 1 && typeof backup.tables === 'object' && backup.tables !== null
}

function isRecord(row: unknown): row is Synced {
  if (typeof row !== 'object' || row === null) return false
  const record = row as Partial<Synced>
  return typeof record.id === 'string' && typeof record.updatedAt === 'number'
}

/** Starts a download of the backup file in the browser. */
export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `planner-backup-${toISODate(new Date())}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
