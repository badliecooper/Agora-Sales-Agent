import fs from 'node:fs';
import path from 'node:path';
import { ingestDocument } from '../lib/knowledge/service';
import { chunkDocument } from '../lib/knowledge/chunker';

// 1. Auto-load .env.local and .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      if (typeof process.loadEnvFile === 'function') {
        try {
          process.loadEnvFile(fullPath);
        } catch {
          // Fallback to manual parsing if syntax issues
          parseEnvManually(fullPath);
        }
      } else {
        parseEnvManually(fullPath);
      }
    }
  }
}

function parseEnvManually(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore manual parse errors
  }
}

// 2. Parse YAML-like frontmatter
interface ParsedFile {
  content: string;
  frontmatter: Record<string, string>;
}

function parseFrontmatter(rawContent: string): ParsedFile {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = frontmatterRegex.exec(rawContent);

  if (!match) {
    return { content: rawContent.trim(), frontmatter: {} };
  }

  const yamlBlock = match[1];
  const bodyContent = match[2].trim();
  const frontmatter: Record<string, string> = {};

  const lines = yamlBlock.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && val) {
        frontmatter[key] = val;
      }
    }
  }

  return { content: bodyContent, frontmatter };
}

// 3. Helper to format title from filename
function formatDocumentTitle(filenameWithoutExt: string): string {
  // Strip leading index like "01_", "02 - ", "1."
  const stripped = filenameWithoutExt.replace(/^(\d+[\s._-]+)+/, '');
  return (stripped || filenameWithoutExt)
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferCategory(filename: string, folderCategory?: string): string {
  if (folderCategory && folderCategory !== 'general') {
    return folderCategory;
  }
  const lower = filename.toLowerCase();
  if (lower.includes('pricing')) return 'pricing';
  if (lower.includes('objection') || lower.includes('faq')) return 'objections';
  if (lower.includes('product') || lower.includes('rtc') || lower.includes('conversational_ai')) return 'product';
  if (lower.includes('playbook') || lower.includes('sales') || lower.includes('battlecard')) return 'battlecards';
  if (lower.includes('use_case') || lower.includes('success_stories')) return 'use_cases';
  if (lower.includes('overview') || lower.includes('company')) return 'overview';
  return folderCategory || 'general';
}

// 4. Recursive file finder
function findKnowledgeFiles(dir: string, baseDir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findKnowledgeFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Only process .md and .txt files
      if (['.md', '.markdown', '.txt'].includes(ext)) {
        // Skip root README
        const relativeToRoot = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        if (relativeToRoot.toLowerCase() === 'readme.md') {
          continue;
        }
        results.push(fullPath);
      }
    }
  }
  return results;
}

// 5. Main Ingestion CLI Runner
async function main() {
  loadEnv();

  // CLI Arguments
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const companyArg = args.find((a) => a.startsWith('--company='))?.split('=')[1];
  const categoryArg = args.find((a) => a.startsWith('--category='))?.split('=')[1];
  const dirArg = args.find((a) => a.startsWith('--dir='))?.split('=')[1];

  const targetDir = dirArg
    ? path.resolve(process.cwd(), dirArg)
    : path.resolve(process.cwd(), 'knowledge-base');

  console.log('====================================================');
  console.log('       Pinecone RAG Knowledge Ingestion CLI         ');
  console.log('====================================================');
  console.log(`Directory : ${path.relative(process.cwd(), targetDir)}`);
  console.log(`Dry Run   : ${isDryRun ? 'YES (No Pinecone upsert)' : 'NO (Live Ingestion)'}`);
  if (companyArg) console.log(`Company Override: ${companyArg}`);
  if (categoryArg) console.log(`Category Override: ${categoryArg}`);
  console.log('----------------------------------------------------');

  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const files = findKnowledgeFiles(targetDir, targetDir);

  if (files.length === 0) {
    console.log('No eligible .md or .txt files found in knowledge-base directory.');
    console.log('Add documents under knowledge-base/<companyId>/<category>/<doc>.md and rerun.');
    process.exit(0);
  }

  console.log(`Found ${files.length} document(s) to process.\n`);

  let successCount = 0;
  let totalChunks = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relPath = path.relative(targetDir, file).replace(/\\/g, '/');
    const pathParts = relPath.split('/');

    const raw = fs.readFileSync(file, 'utf-8');
    const { content, frontmatter } = parseFrontmatter(raw);

    if (!content.trim()) {
      console.warn(`[SKIP] ${relPath} (file is empty)`);
      continue;
    }

    // Determine metadata
    const parsedPath = path.parse(file);
    const folderCompanyId = pathParts.length > 1 ? pathParts[0] : 'default-company';
    const folderCategory = pathParts.length > 2 ? pathParts[1] : undefined;
    const inferredCompanyId = folderCompanyId;
    const inferredCategory = inferCategory(parsedPath.name, folderCategory);
    const inferredDocName = formatDocumentTitle(parsedPath.name);

    const companyId = companyArg || frontmatter.companyId || inferredCompanyId;
    const category = categoryArg || frontmatter.category || inferredCategory;
    const documentName = frontmatter.documentName || inferredDocName;
    const documentId =
      frontmatter.documentId ||
      `${companyId}-${category}-${parsedPath.name}`.replace(/[^a-zA-Z0-9_-]/g, '-');

    console.log(`[${i + 1}/${files.length}] Processing: ${relPath}`);
    console.log(`       Tenant   : ${companyId}`);
    console.log(`       Category : ${category}`);
    console.log(`       Doc Name : ${documentName}`);
    console.log(`       Doc ID   : ${documentId}`);

    if (isDryRun) {
      const chunks = chunkDocument(content);
      console.log(`       → Dry Run: Generated ${chunks.length} chunk(s) (approx ${content.length} chars)\n`);
      totalChunks += chunks.length;
      successCount++;
    } else {
      try {
        const result = await ingestDocument({
          companyId,
          documentId,
          category,
          documentName,
          content,
          metadata: {
            filePath: relPath,
            source: 'local-file-ingest',
          },
        });

        console.log(`       ✓ Ingested: ${result.chunksCount} chunk(s) stored in Pinecone`);
        console.log(`       ✓ Vector IDs: ${result.vectorIds[0]} ... (${result.vectorIds.length} total)\n`);
        totalChunks += result.chunksCount;
        successCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`       ✗ Ingestion failed: ${errMsg}\n`);
        errors.push({ file: relPath, error: errMsg });
      }
    }
  }

  console.log('====================================================');
  console.log('                 Ingestion Summary                  ');
  console.log('====================================================');
  console.log(`Processed Documents : ${files.length}`);
  console.log(`Successful          : ${successCount}`);
  console.log(`Failed              : ${errors.length}`);
  console.log(`Total Chunks Vectorized : ${totalChunks}`);
  console.log('====================================================');

  if (errors.length > 0) {
    console.error('\nErrors encountered:');
    for (const e of errors) {
      console.error(` - ${e.file}: ${e.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll documents successfully processed and indexed into RAG knowledge base!');
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
