# Knowledge Base Documents

Place your RAG knowledge documents (`.md`, `.txt`) in this directory. They will be parsed, chunked, embedded with OpenAI `text-embedding-3-small` (1536 dimensions), and upserted into your Pinecone vector database with tenant isolation.

---

## Folder Structure

Organize your documents by **Company ID** and **Category**:

```text
knowledge-base/
└── <companyId>/             # e.g., default-company, acme-corp, your-brand
    ├── pricing/             # e.g., pricing sheets, plans, discounts, tiers
    │   └── enterprise-pricing.md
    ├── product/             # e.g., product features, specs, capabilities
    │   └── platform-features.md
    ├── objections/          # e.g., sales objection handling, rebuttals
    │   └── objection-handling.md
    ├── battlecards/         # e.g., competitor comparisons, win stories
    │   └── competitor-battlecard.md
    └── faq/                 # e.g., security, compliance, integration FAQs
        └── security-faq.md
```

---

## Automatic Metadata Detection

When you place a file in:
`knowledge-base/default-company/pricing/enterprise-pricing.md`

The ingestion script automatically derives:
- **`companyId`**: `default-company` (first subfolder)
- **`category`**: `pricing` (second subfolder)
- **`documentName`**: `Enterprise Pricing` (from filename)
- **`documentId`**: `default-company-pricing-enterprise-pricing` (slug derived from path)

---

## Optional YAML Frontmatter

You can optionally override any metadata at the very top of any file:

```markdown
---
companyId: default-company
category: pricing
documentName: 2026 Enterprise Pricing & Tiers
documentId: custom-doc-id-001
---

# Your Document Content
Paste your text here...
```

---

## How to Run Ingestion

Ingest all documents in this directory:
```bash
pnpm run ingest:docs
```

### Useful CLI Options:

- **Target a specific company**:
  ```bash
  pnpm run ingest:docs --company=default-company
  ```

- **Preview chunks without uploading (Dry Run)**:
  ```bash
  pnpm run ingest:docs --dry-run
  ```

- **Target a specific subfolder or file**:
  ```bash
  pnpm run ingest:docs --dir=knowledge-base/default-company/pricing
  ```
