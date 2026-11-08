// The AI connector (F74): an MCP server at /mcp that Claude (or any MCP client) signs in to.
// It reads the week-by-week summary the app sent, and can save an analysis back to the planner.
// Stateless: each request gets a fresh server, so nothing is kept between calls.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import * as z from 'zod/v4'
import { ALL_PARTS, analysisMarkdown, dayName } from '../../app/src/lib/analysisText'
import { aiIsOn, listAnalyses, loadWeeks, MAX_TEXT, MAX_TITLE, readAnalysis, saveAnalysis } from './ai'
import type { Env } from './http'

/** What the sign-in stored for this connection. */
export interface ConnectorProps {
  space: string
  /** The AI's name, as it registered itself ("Claude"). */
  by?: string
}

const INSTRUCTIONS = `This connects to someone's personal planner: daily habits, tracks they work at (study, languages, exercise), food guidelines with a daily "How did eating go?" and a food diary, energy and work ratings, weigh-ins, and weekly reviews.

When they ask for an analysis or how things are going, call get_planner_data first. Look at trends across weeks: what's improving, what's slipping, what seems to help or get in the way (for example energy against eating, or crunch weeks against habits). Quote their own notes where useful. Be kind and concrete, and suggest small next steps. It's a personal planner, not medical advice.

Call list_saved_analyses to follow up on earlier analyses. Only call save_analysis when they ask you to save it, or agree when you offer.`

const OFF = 'Connecting an AI is turned off in this planner. It can be turned on in the app: Settings → AI analysis.'

const text = (value: string, isError = false) => ({ content: [{ type: 'text' as const, text: value }], ...(isError ? { isError } : {}) })

export function plannerServer(env: Env, props: ConnectorProps): McpServer {
  const server = new McpServer({ name: 'planner', title: 'Planner', version: '1.0.0' }, { instructions: INSTRUCTIONS })
  const { space } = props

  server.registerTool(
    'get_planner_data',
    {
      title: 'Read planner data',
      description:
        'The planner’s data for analysis, as Markdown: weekly trends (habits against targets, tracks, workouts, eating, energy, work, weight, meds), weekly review notes and daily notes, and the food diary with how eating went each day. Newest week last.',
      inputSchema: {
        weeks: z.number().int().min(1).max(520).optional().describe('How many weeks back, counting this one. Default 5 (this week and the 4 before).'),
        include: z
          .array(z.enum(['trends', 'notes', 'food']))
          .optional()
          .describe('Which parts: trends, notes, food (the food diary). Default all three.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ weeks, include }) => {
      if (!(await aiIsOn(env, space))) return text(OFF, true)
      const { weeks: data, context } = await loadWeeks(env, space, weeks ?? 5)
      if (!data.length) return text('No data yet: the planner sends it on its next sync. Ask them to open the app once, then try again.')
      const parts = include?.length ? { trends: include.includes('trends'), notes: include.includes('notes'), food: include.includes('food') } : ALL_PARTS
      return text(analysisMarkdown(data, parts, { generatedAt: context.generatedAt ?? new Date().toISOString(), guidelines: context.guidelines }))
    },
  )

  server.registerTool(
    'list_saved_analyses',
    {
      title: 'List saved analyses',
      description: 'Analyses saved to the planner before (by an AI or pasted in), newest first: id, date and title.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (!(await aiIsOn(env, space))) return text(OFF, true)
      const saved = await listAnalyses(env, space)
      if (!saved.length) return text('No saved analyses yet.')
      return text(saved.map((row) => `- ${row.id}: ${dayName(row.date)}, “${row.title}”${row.by ? ` (${row.by})` : ''}`).join('\n'))
    },
  )

  server.registerTool(
    'read_saved_analysis',
    {
      title: 'Read a saved analysis',
      description: 'One saved analysis in full, by its id from list_saved_analyses.',
      inputSchema: { id: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      if (!(await aiIsOn(env, space))) return text(OFF, true)
      const row = await readAnalysis(env, space, id)
      if (!row) return text('There’s no saved analysis with that id.', true)
      return text(`# ${row.title}\n\nSaved ${dayName(row.date)}${row.by ? ` by ${row.by}` : ''}.\n\n${row.text}`)
    },
  )

  server.registerTool(
    'save_analysis',
    {
      title: 'Save an analysis',
      description:
        'Saves an analysis to the planner, where it shows under Insights on every device. Only when the person asks to save it, or agrees when you offer. Write it for them to reread later: what you found and the suggestions, in Markdown.',
      inputSchema: {
        title: z.string().min(1).max(MAX_TITLE).describe('A short title, like “October: energy and eating”.'),
        text: z.string().min(1).max(MAX_TEXT).describe('The analysis, in Markdown.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, text: body }) => {
      if (!(await aiIsOn(env, space))) return text(OFF, true)
      const saved = await saveAnalysis(env, space, { title, text: body, by: props.by })
      return text(`Saved as “${saved.title}” (${dayName(saved.date)}). It shows under Insights in the planner after its next sync.`)
    },
  )

  return server
}

/** Answers one request at /mcp, for the space the sign-in belongs to. */
export async function handleMcp(request: Request, env: Env, props: ConnectorProps): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  const server = plannerServer(env, props)
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    // The JSON answer is complete once handleRequest returns.
    void server.close()
  }
}
