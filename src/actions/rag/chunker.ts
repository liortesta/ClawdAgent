import logger from '../../utils/logger.js';

export interface Chunk {
  id: string;
  text: string;
  source: string;
  page?: number;
  index: number;
}

export function chunkText(text: string, source: string, chunkSize = 1000, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkEnd = end;

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + chunkSize * 0.5) chunkEnd = breakPoint + 1;
    }

    const chunkContent = text.slice(start, chunkEnd).trim();
    if (chunkContent.length > 50) {
      chunks.push({ id: `${source}-${index}`, text: chunkContent, source, index: index++ });
    }
    // Advance start — if we've reached the end of text, stop (prevents infinite loop
    // when text is shorter than chunkSize, where overlap would push start backwards)
    const nextStart = chunkEnd - overlap;
    start = nextStart <= start ? text.length : nextStart;
  }

  logger.info('Text chunked', { source, chunks: chunks.length, totalChars: text.length });
  return chunks;
}
