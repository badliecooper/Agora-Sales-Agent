import { ChunkedDocumentPart } from './types';

export interface ChunkOptions {
  maxChunkSize?: number;
  overlap?: number;
}

const DEFAULT_MAX_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 150;

/**
 * Normalizes document text by stripping excess whitespace and unifying line endings.
 */
export function parseAndNormalizeDocument(content: string): string {
  if (!content) return '';
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Chunks normalized document content into overlapping text segments,
 * prioritizing paragraph and sentence boundaries for semantic coherence.
 */
export function chunkDocument(
  content: string,
  options: ChunkOptions = {},
): ChunkedDocumentPart[] {
  const normalized = parseAndNormalizeDocument(content);
  if (!normalized) return [];

  const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  if (normalized.length <= maxChunkSize) {
    return [
      {
        index: 0,
        text: normalized,
        charLength: normalized.length,
      },
    ];
  }

  // Split by double newline (paragraphs), or single newline, or sentences
  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If paragraph alone exceeds maxChunkSize, split into sentences
    if (trimmedPara.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const sentences = trimmedPara.split(/(?<=[.?!])\s+/);
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (!sentence) continue;
        if ((sentenceChunk + ' ' + sentence).trim().length > maxChunkSize) {
          if (sentenceChunk) {
            chunks.push(sentenceChunk.trim());
            // Retain overlap from end of previous sentence chunk if possible
            const sliceStart = Math.max(0, sentenceChunk.length - overlap);
            sentenceChunk = sentenceChunk.slice(sliceStart).trim() + ' ' + sentence;
          } else {
            // A single sentence exceeds maxChunkSize - hard slice by words
            const words = sentence.split(' ');
            let wordChunk = '';
            for (const word of words) {
              if ((wordChunk + ' ' + word).trim().length > maxChunkSize) {
                if (wordChunk) chunks.push(wordChunk.trim());
                wordChunk = word;
              } else {
                wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
              }
            }
            if (wordChunk) sentenceChunk = wordChunk;
          }
        } else {
          sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
        }
      }

      if (sentenceChunk) {
        chunks.push(sentenceChunk.trim());
      }
    } else {
      const candidate = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
      if (candidate.length <= maxChunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // Start next chunk, pulling in overlap if feasible
        if (overlap > 0 && currentChunk) {
          const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap)).trim();
          currentChunk = overlapText ? `${overlapText}\n\n${trimmedPara}` : trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      }
    }
  }

  if (currentChunk && currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.map((text, index) => ({
    index,
    text,
    charLength: text.length,
  }));
}
