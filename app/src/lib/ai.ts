// AI analysis (F73–F76): an export any AI can read, analyses you keep, and the connector.
// "Connect an AI" is off unless you turn it on (D89). While it's on, the app sends its
// week-by-week summary to your server after it syncs, for the connector to read.
import { getAnalysis, type AnalysisSpan } from './analysis'
import { analysisMarkdown, type AnalysisParts } from './analysisText'
import { todayISO } from './dates'
import { db, type SavedAnalysis } from './db'
import { getMeta, getSetting, setMeta } from './repo'
import { alive, newId, now, softDelete, update } from './store'
import { getSyncConfig, serverCall, type SyncConfig } from './sync'

export interface AiSetting {
  connect: boolean
}

export const getAiSetting = () => getSetting<AiSetting>('ai', { connect: false })

// ── The export (F73) ──

export async function analysisExport(span: AnalysisSpan, parts: AnalysisParts, today = todayISO()): Promise<string> {
  const { weeks, guidelines } = await getAnalysis(today, span)
  return analysisMarkdown(weeks, parts, { generatedAt: new Date().toISOString(), guidelines })
}

/** Starts a download of a text file. */
export function downloadText(name: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Analyses you keep (F75) ──

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  return alive(await db.analyses.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
}

export async function addAnalysis(title: string, text: string, date = todayISO()): Promise<void> {
  await db.analyses.put({ id: newId(), date, title: title.trim() || 'Analysis', text: text.trim(), source: 'pasted', updatedAt: now() })
}

export async function renameAnalysis(id: string, title: string): Promise<void> {
  await update(db.analyses, id, { title: title.trim() || 'Analysis' })
}

export const deleteAnalysis = (id: string) => softDelete(db.analyses, id)

// ── Connecting an AI (F74) ──

const SENT = 'aiSent'
const SENT_AT = 'aiSentAt'
const AI_ERROR = 'aiError'
/** Everything goes again after a week, in case the server lost it. */
const RESEND_AFTER = 7 * 24 * 60 * 60_000

/** A short hash, to tell which weeks changed since they were last sent. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export async function setAiConnect(connect: boolean): Promise<void> {
  await db.settings.put({ id: 'ai', value: { connect } satisfies AiSetting, updatedAt: now() })
  await db.meta.bulkDelete([SENT, SENT_AT, AI_ERROR])
}

/** Sends the weeks that changed. Does nothing while Connect an AI is off or sync isn't set up. */
export async function sendAnalysis(config: SyncConfig | null = null, today = todayISO()): Promise<void> {
  const server = config ?? (await getSyncConfig())
  if (!server || !(await getAiSetting()).connect) return
  try {
    const { weeks, guidelines } = await getAnalysis(today, 'all')
    const sentAt = (await getMeta<number>(SENT_AT)) ?? 0
    const sent = Date.now() - sentAt > RESEND_AFTER ? {} : ((await getMeta<Record<string, string>>(SENT)) ?? {})
    const contextHash = hash(JSON.stringify(guidelines))
    const hashes = Object.fromEntries(weeks.map((week) => [week.monday, hash(JSON.stringify(week))]))
    const changed = weeks.filter((week) => sent[week.monday] !== hashes[week.monday])
    const gone = Object.keys(sent).some((key) => key !== 'context' && !(key in hashes))
    if (!changed.length && !gone && sent.context === contextHash) return
    // Big histories go in parts, well under what the server takes in one request.
    for (let start = 0; start === 0 || start < changed.length; start += 50) {
      await serverCall(server, '/ai/weeks', {
        weeks: changed.slice(start, start + 50).map((week) => ({ monday: week.monday, data: week })),
        keep: weeks.map((week) => week.monday),
        context: { guidelines, generatedAt: new Date().toISOString() },
      })
    }
    await setMeta(SENT, { ...hashes, context: contextHash })
    await setMeta(SENT_AT, Date.now())
    await db.meta.delete(AI_ERROR)
  } catch (error) {
    await setMeta(AI_ERROR, error instanceof Error ? error.message : String(error)).catch(() => undefined)
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** After a sync: send the summary a little later, so a burst of changes goes together. */
export function scheduleAnalysis(delay = 15_000): void {
  clearTimeout(timer)
  timer = setTimeout(() => void sendAnalysis(), delay)
}

export interface AiState {
  connect: boolean
  sentAt: number | null
  error: string | null
}

export async function getAiState(): Promise<AiState> {
  const [setting, sentAt, error] = await Promise.all([getAiSetting(), getMeta<number>(SENT_AT), getMeta<string>(AI_ERROR)])
  return { connect: setting.connect, sentAt: sentAt ?? null, error: error ?? null }
}

/** Whether the server has the connector (it needs the update from M15). */
export async function serverHasConnector(config: SyncConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.server}/`)
    const data = (await response.json()) as { connector?: unknown }
    return data.connector === true
  } catch {
    return false
  }
}

/** Turning it on: the setting syncs first (the server checks it), then the summary goes. */
export async function turnAiOn(config: SyncConfig, sync: () => Promise<void>): Promise<void> {
  await setAiConnect(true)
  await sync()
  await sendAnalysis(config)
}

/** Turning it off: the server deletes the summary and signs every AI out. */
export async function turnAiOff(config: SyncConfig | null, sync: () => Promise<void>): Promise<void> {
  await setAiConnect(false)
  if (!config) return
  await sync()
  await serverCall(config, '/ai/off', {})
}

export const getSignInCode = (config: SyncConfig) => serverCall<{ code: string; expires: number }>(config, '/ai/code', {})
