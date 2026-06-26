interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Federal Register MCP — US Federal Register API (free, no auth)
 *
 * Tools:
 * - search_documents: search Federal Register documents by keyword
 * - get_document: get a specific document by FR document number
 * - recent_rules: get recently published rules and regulations
 */


const BASE = 'https://www.federalregister.gov/api/v1';

// ── Types ─────────────────────────────────────────────────────────────

type FRDocument = {
  document_number?: string | null;
  title?: string | null;
  type?: string | null;
  abstract?: string | null;
  citation?: string | null;
  publication_date?: string | null;
  agencies?: { name?: string | null; raw_name?: string | null }[] | null;
  html_url?: string | null;
  pdf_url?: string | null;
  action?: string | null;
  dates?: string | null;
  docket_ids?: string[] | null;
  page_length?: number | null;
  start_page?: number | null;
  end_page?: number | null;
  significant?: boolean | null;
  signing_date?: string | null;
  subtype?: string | null;
  body_html_url?: string | null;
  json_url?: string | null;
};

type FRSearchResponse = {
  count?: number;
  total_pages?: number;
  results: FRDocument[];
};

function formatDoc(d: FRDocument) {
  return {
    document_number: d.document_number ?? null,
    title: d.title ?? null,
    type: d.type ?? null,
    abstract: d.abstract ?? null,
    citation: d.citation ?? null,
    publication_date: d.publication_date ?? null,
    agencies: (d.agencies ?? []).map((a) => a.name ?? a.raw_name ?? null).filter(Boolean),
    html_url: d.html_url ?? null,
    pdf_url: d.pdf_url ?? null,
    action: d.action ?? null,
    dates: d.dates ?? null,
    docket_ids: d.docket_ids ?? [],
    page_length: d.page_length ?? null,
    significant: d.significant ?? null,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'search_documents',
    description:
      'Search the US Federal Register by topic / keyword for proposed rules, final rules, notices, and presidential documents. **Use this whenever the question mentions a SUBJECT** ("EV tax credits", "AI export controls", "PFAS regulations", "clean energy", "ozempic labeling", etc.) — recent_rules takes no topic filter and would return random unrelated rules. Returns title, abstract, agency, publication date, links. Examples: search_documents({query: "EV tax credit", type: "rule"}), search_documents({query: "artificial intelligence", agency: "commerce-department"}), search_documents({query: "Strait of Hormuz", since: "365d"}). Pass `since` to constrain to recent documents — without it the relevance ranker can return decade-old docs for sparse-term queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords (e.g., "clean energy tax credit")' },
        type: {
          type: 'string',
          description: 'Document type filter: "rule", "proposed_rule", "notice", "presidential_document"',
        },
        agency: { type: 'string', description: 'Agency slug filter (e.g., "environmental-protection-agency", "securities-and-exchange-commission")' },
        since: { type: 'string', description: 'Publication date floor. Accepts ISO date ("2025-01-01") or shorthand ("30d", "12m", "365d", "1y"). Recommended for any topical search to avoid stale results — the relevance ranker can surface 2004-2008 documents for queries with sparse hits.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_document',
    description:
      'Get full details for a Federal Register document by its document number (e.g., "2024-12345"). Returns title, abstract, full text link, agencies, dates, and docket information.',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'Federal Register document number (e.g., "2024-12345")' },
      },
      required: ['number'],
    },
  },
  {
    name: 'recent_rules',
    description:
      'Browse the most recently published final rules and regulations from the Federal Register, **with no topic filter** — returns whatever was published most recently across every agency (FAA airworthiness directives, Coast Guard safety zones, EPA tolerance exemptions, etc.). For questions about a specific topic ("EV tax credits", "AI rules", "drug pricing"), use search_documents instead. Returns title, abstract, agency, effective dates, significance.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results to return (default 20, max 100)' },
      },
    },
  },
];

// ── callTool dispatcher ───────────────────────────────────────────────

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Missing required parameter: ${key} (string)`);
  }
  return v;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_documents':
      return searchDocuments(
        requireString(args, 'query'),
        args.type as string | undefined,
        args.agency as string | undefined,
        args.since as string | undefined,
      );
    case 'get_document':
      return getDocument(requireString(args, 'number'));
    case 'recent_rules':
      return recentRules((args.limit as number) ?? 20);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// "30d", "12m", "1y", or ISO date → ISO date floor for the publication_date filter.
function parseSince(since: string): string | null {
  const trimmed = since.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = /^(\d+)\s*([dmy])$/i.exec(trimmed);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const days = unit === 'd' ? n : unit === 'm' ? n * 30 : n * 365;
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

// ── Tool implementations ─────────────────────────────────────────────

async function searchDocuments(query: string, type?: string, agency?: string, since?: string) {
  const params = new URLSearchParams({
    'conditions[term]': query,
    per_page: '20',
    order: 'relevance',
  });
  if (type) params.set('conditions[type][]', type);
  if (agency) params.set('conditions[agencies][]', agency);
  const sinceISO = since ? parseSince(since) : null;
  if (sinceISO) params.set('conditions[publication_date][gte]', sinceISO);

  const res = await fetch(`${BASE}/documents.json?${params}`);
  if (!res.ok) throw new Error(`Federal Register API error: ${res.status}`);

  const data = (await res.json()) as FRSearchResponse;
  const results = data.results ?? [];

  return {
    query,
    since: sinceISO,
    total: data.count ?? results.length,
    returned: results.length,
    documents: results.map(formatDoc),
  };
}

async function getDocument(number: string) {
  const res = await fetch(`${BASE}/documents/${number}.json`);
  if (!res.ok) throw new Error(`Federal Register API error (${res.status}): document ${number} not found`);

  const data = (await res.json()) as FRDocument;
  return formatDoc(data);
}

async function recentRules(limit: number) {
  const count = Math.min(100, Math.max(1, limit));
  const params = new URLSearchParams({
    'conditions[type][]': 'RULE',
    per_page: String(count),
    order: 'newest',
  });

  const res = await fetch(`${BASE}/documents.json?${params}`);
  if (!res.ok) throw new Error(`Federal Register API error: ${res.status}`);

  const data = (await res.json()) as FRSearchResponse;
  const results = data.results ?? [];

  return {
    total: data.count ?? results.length,
    returned: results.length,
    rules: results.map(formatDoc),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
