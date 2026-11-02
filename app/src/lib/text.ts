// Small text helpers shared by the screens.

/** One entry per line of a text box, without the empty lines. */
export const textLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
