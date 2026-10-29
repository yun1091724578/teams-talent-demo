// 能力目录的英文覆盖：分类与能力的名称、说明都是产品文案，按 id 覆盖服务端种子里的中文。
// 服务端（server/seed.ts）只维护中文；新增能力或改文案时，这里要同步加一条，否则英文界面会退回中文。
import type { Capability } from '../types.ts';

interface CapabilityText {
  name?: string; desc?: string; inputLabel?: string; output?: string;
  update?: string; noUpdate?: string; prompt?: string;
  detail?: { input: string; abilities: [string, string][]; output: string };
}

export const categoryTextEn: Record<string, { name: string; desc: string }> = {
  index: { name: 'Knowledge index', desc: 'Find related code and documents quickly' },
  doc: { name: 'Document knowledge extraction', desc: 'Extract business knowledge from requirements and design documents' },
  code: { name: 'Code knowledge mining', desc: 'Reverse-engineer development patterns and business rules from PRs and code changes' },
  traj: { name: 'Trajectory analysis', desc: 'Find problems in agent traces and distil reusable experience' },
};

export const capabilityTextEn: Record<string, CapabilityText> = {
  codegraph: {
    desc: 'Builds a code graph for the repository and answers questions about symbol definitions, call relations and dependencies.',
    inputLabel: '1 repository', output: 'Code graph index (queried over MCP)',
    update: 'Syncs only code changes since the last build',
    detail: {
      input: 'Requires one repository (a local path, or a Git remote and branch); only the code itself is analysed, no extra documents.',
      abilities: [
        ['Symbol index', 'Parses classes, methods and fields with their definition sites, searchable by exact name.'],
        ['Calls and dependencies', 'Builds call chains, inheritance and module dependencies, answering “who calls this” and “what breaks if I change it”.'],
        ['Structure overview', 'Clusters by package and service to show the overall structure and how services relate.'],
        ['Incremental sync', 'After the source changes, syncs only what changed since the last build, keeping the graph aligned with the code.'],
      ],
      output: 'A code graph index kept remotely and queried by agents over MCP; Talents can browse the graph and preview source interactively.',
    },
  },
  'doc-index': {
    name: 'Document RAG search',
    desc: 'Hybrid BM25 + vector retrieval that finds the relevant passages for a question.',
    inputLabel: '1 document set', output: 'Retrieval index (queried over MCP)',
    update: 'Processes only added and modified documents, and drops passages of deleted ones',
    detail: {
      input: 'Requires one document set, for example requirements, design, API descriptions and specifications in Markdown or plain text.',
      abilities: [
        ['Structured chunking', 'Splits documents by heading level and paragraph, keeping the document and section so the source can be traced.'],
        ['Hybrid retrieval', 'Combines BM25 keyword matching with vector semantic search, so both jargon and natural questions find results.'],
        ['Result fusion', 'Merges and re-ranks both result sets, returning the most relevant passages with their sources.'],
        ['Incremental update', 'Processes only added and modified documents and removes passages of deleted ones, without a full rebuild.'],
      ],
      output: 'A retrieval index kept remotely; agents query the relevant passages over MCP.',
    },
  },
  'doc-extract': {
    name: 'Business knowledge extraction',
    desc: 'Extracts business rules, ubiquitous-language terms and a data dictionary from documents.',
    inputLabel: '1 document set', output: 'Business knowledge document',
    update: 'Revises the affected knowledge as documents change',
    prompt: 'Extract business rules, ubiquitous-language terms and a data dictionary from the selected document set, citing the source of every item.',
    detail: {
      input: 'Requires one document set; the more complete the requirements, design, API descriptions and ADRs, the more accurate the extracted knowledge.',
      abilities: [
        ['Business rule extraction', 'Identifies calculation rules, constraints and process branches, and writes them as clear, checkable rule statements.'],
        ['Ubiquitous language', 'Collects domain terms, synonyms and abbreviations into consistent definitions that reduce an agent’s misreadings.'],
        ['Data dictionary', 'Summarises business entities, fields, value ranges and meanings.'],
        ['Provenance and incremental revision', 'Cites the source document of every item and revises only the affected knowledge when documents change.'],
      ],
      output: 'A business knowledge document (Markdown) submitted to the repository as a PR after review; agents consult it while developing.',
    },
  },
  'miner-pr': {
    name: 'Pattern mining (PRs)',
    desc: 'Analyses merged PRs and summarises reusable development patterns.',
    inputLabel: '1 repository and some PRs', output: 'Pattern library',
    noUpdate: 'Each run archives new patterns',
    prompt: 'Summarise the development patterns shown by the selected PRs and archive them into the repository’s pattern library.',
    detail: {
      input: 'Requires one repository and several merged PRs; the more complete the PR descriptions and review threads, the more accurate the patterns.',
      abilities: [
        ['Intent of the change', 'Reads the PR description, the diff and the repository context to understand what each change had to solve.'],
        ['Pattern induction', 'Distils reusable practices such as layering, naming conventions and error handling from repeated similar changes.'],
        ['Business rule recovery', 'Identifies implicit business rules and boundary conditions from the code changes.'],
        ['Pattern archiving', 'Deduplicates against existing patterns, archives into the library and rebuilds index.md.'],
      ],
      output: 'A pattern library: one document per pattern plus index.md, submitted to the repository as a PR after review.',
    },
  },
  'miner-diff': {
    name: 'Pattern mining (code snippets)',
    desc: 'Analyses code snippets in the repository context and summarises development patterns.',
    inputLabel: '1 repository and code snippets', output: 'Pattern library',
    noUpdate: 'Each run archives new patterns',
    prompt: 'Summarise the development patterns shown by the given snippets and archive them into the repository’s pattern library.',
    detail: {
      input: 'Requires one repository and the snippets to analyse; the repository provides the context that explains each snippet’s module and dependencies.',
      abilities: [
        ['Context linking', 'Locates the snippet in the repository, its callers and dependencies, and understands its responsibility.'],
        ['Pattern induction', 'Distils the technique a snippet shows, such as idempotency, concurrency control, validation and retry.'],
        ['Applicability', 'States where the pattern applies, its preconditions and pitfalls, so it is not misused.'],
        ['Pattern archiving', 'Deduplicates against existing patterns, archives into the library and rebuilds index.md.'],
      ],
      output: 'A pattern library: one document per pattern plus index.md, submitted to the repository as a PR after review.',
    },
  },
  traj: {
    name: 'Trajectory insights',
    desc: 'Reads complex execution traces, finds problems and distils reusable experience and improvement suggestions.',
    inputLabel: '1 or more team sessions', output: 'Visual diagnosis report and improvement plan',
    noUpdate: 'Each run produces a new diagnosis',
    prompt: 'Diagnose the agent’s process errors in the selected sessions and propose reusable improvements.',
    detail: {
      input: 'Requires a session trajectory; Skills, related documents and task notes help produce a deeper, more targeted diagnosis.',
      abilities: [
        ['Execution reconstruction', 'Links tasks, decisions and actions so a complex process can be understood quickly.'],
        ['Problem correlation', 'Identifies problems and traces their cause, impact and fix.'],
        ['Pattern and experience mining', 'Distils recurring behaviour patterns and effective practices.'],
        ['Improvement suggestions', 'Proposes improvements to prompts, tools, Skills and the execution flow.'],
      ],
      output: 'An interactive visual diagnosis report plus a concrete improvement plan with suggested changes, rationale and verification; key findings trace back to the original evidence.',
    },
  },
};

/** Applies the English catalog to the categories the service sends; unknown ids pass through. */
export function localizeCategories<T extends { id: string; name: string; desc: string }>(list: T[]): T[] {
  return list.map(item => { const text = categoryTextEn[item.id]; return text ? { ...item, name: text.name, desc: text.desc } : item; });
}

/** Applies the English catalog to the capabilities the service sends; user-imported ones pass through. */
export function localizeCapabilities(list: Capability[]): Capability[] {
  return list.map(item => {
    const text = capabilityTextEn[item.id];
    return text ? { ...item, ...text } as Capability : item;
  });
}
