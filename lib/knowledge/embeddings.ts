export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Deterministic pseudo-semantic embedding generator used when no OpenAI API key is present
 * or during hermetic tests. Generates unit-norm 1536-dimensional float vectors where
 * texts sharing terms have high cosine similarity.
 */
export function generateDeterministicEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIMENSIONS);
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\W+/).filter(Boolean);

  // Distribute word hashes across dimensions
  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const word = words[wIdx];
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const baseDim = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    const weight = 1.0 + (wIdx === 0 ? 0.5 : 0.0); // slight boost for initial terms

    // Primary dimension
    vec[baseDim] += weight;

    // Spread across 3 neighboring dimensions to allow fuzzy match
    const dim2 = (baseDim + 17) % EMBEDDING_DIMENSIONS;
    const dim3 = (baseDim + 53) % EMBEDDING_DIMENSIONS;
    vec[dim2] += weight * 0.4;
    vec[dim3] += weight * 0.2;
  }

  // Character 3-grams for subword similarity
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 5381;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 33) ^ trigram.charCodeAt(j);
    }
    const dim = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    vec[dim] += 0.15;
  }

  // L2 normalize
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    sumSq += vec[i] * vec[i];
  }

  if (sumSq === 0) {
    // Return unit vector along first dimension if empty string
    vec[0] = 1.0;
    return Array.from(vec);
  }

  const norm = Math.sqrt(sumSq);
  const result = new Array<number>(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }

  return result;
}

/**
 * Generates an embedding for a single text using OpenAI text-embedding-3-small,
 * falling back to deterministic local embedding if no API key is configured.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_LLM_API_KEY;
  if (!apiKey || process.env.USE_MOCK_EMBEDDINGS === 'true') {
    return generateDeterministicEmbedding(text);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(
        `[Embeddings] OpenAI API error (${response.status}): ${errText}. Falling back to deterministic embedding.`,
      );
      return generateDeterministicEmbedding(text);
    }

    const data = await response.json();
    return data.data[0].embedding as number[];
  } catch (error) {
    console.warn(
      '[Embeddings] Failed to fetch OpenAI embedding, using fallback:',
      error,
    );
    return generateDeterministicEmbedding(text);
  }
}

/**
 * Generates embeddings for an array of texts in batches.
 */
export async function generateBatchEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_LLM_API_KEY;
  if (!apiKey || process.env.USE_MOCK_EMBEDDINGS === 'true') {
    return texts.map(generateDeterministicEmbedding);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(
        `[Embeddings] Batch embedding error (${response.status}): ${errText}. Falling back.`,
      );
      return texts.map(generateDeterministicEmbedding);
    }

    const data = await response.json();
    // OpenAI embeddings response sorts by index in data array
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding as number[]);
  } catch (error) {
    console.warn(
      '[Embeddings] Batch embedding exception, using fallback:',
      error,
    );
    return texts.map(generateDeterministicEmbedding);
  }
}
