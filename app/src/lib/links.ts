// Links typed into the app. Only plain web links open, so a stored link can't run script.

export function safeLink(link: string): string | null {
  const trimmed = link.trim()
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
}

export interface LinkPart {
  text: string
  href: string | null
}

/** Splits a line into text and web links, so "Drawabox: https://drawabox.com" gets a link. */
export function linkParts(line: string): LinkPart[] {
  const parts: LinkPart[] = []
  let last = 0
  for (const match of line.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const start = match.index ?? 0
    // Punctuation at the end of a sentence isn't part of the link.
    const url = match[0].replace(/[.,;:!?)\]]+$/, '')
    if (start > last) parts.push({ text: line.slice(last, start), href: null })
    parts.push({ text: url, href: url })
    last = start + url.length
  }
  if (last < line.length) parts.push({ text: line.slice(last), href: null })
  return parts
}
