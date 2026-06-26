const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

const CATEGORIES = {
  productivity: { label: 'Productivity', count: 30, skills: [
    { name: 'email-management', description: 'Manage email efficiently with folders, filters, and bulk operations' },
    { name: 'calendar-optimization', description: 'Optimize calendar scheduling with time blocking and meeting buffers' },
    { name: 'task-prioritization', description: 'Prioritize tasks using Eisenhower matrix, MoSCoW, and impact-effort frameworks' },
    { name: 'time-blocking', description: 'Schedule focused work blocks with deep work and context-switching minimization' },
    { name: 'meeting-notes', description: 'Generate structured meeting notes with action items, decisions, and attendees' },
    { name: 'document-template', description: 'Create reusable document templates for proposals, reports, and memos' },
    { name: 'workflow-automation', description: 'Automate repetitive workflows using scripts, cron, and no-code tools' },
    { name: 'bulk-file-operations', description: 'Perform bulk file rename, move, copy, and format conversions' },
    { name: 'clipboard-master', description: 'Manage clipboard history with snippets, templates, and quick paste' },
    { name: 'text-expansion', description: 'Use text expansion shortcuts for frequently typed responses and templates' },
    { name: 'snippet-manager', description: 'Organize code and text snippets with tagging, search, and category groups' },
    { name: 'password-generator', description: 'Generate strong passwords with configurable length, symbols, and entropy' },
    { name: 'contact-management', description: 'Manage contacts with deduplication, categorization, and export tools' },
    { name: 'expense-tracking', description: 'Track expenses with categorization, receipt capture, and monthly reporting' },
    { name: 'project-tracking', description: 'Track project progress with milestones, dependencies, and status reports' },
    { name: 'habit-tracker', description: 'Track daily habits with streaks, reminders, and progress visualization' },
    { name: 'daily-journal', description: 'Maintain a daily journal with prompts, mood tracking, and search' },
    { name: 'weekly-review', description: 'Conduct weekly reviews with accomplishments, lessons, and next-week planning' },
    { name: 'goal-setting', description: 'Set SMART goals with OKR breakdown, tracking, and quarterly reviews' },
    { name: 'decision-matrix', description: 'Evaluate options using weighted decision matrices with criteria scoring' },
    { name: 'pomodoro-timer', description: 'Implement Pomodoro technique with customizable focus/break intervals' },
    { name: 'focus-mode', description: 'Enable distraction-free writing and coding with minimal UI and noise blocking' },
    { name: 'distraction-blocker', description: 'Block distracting websites, notifications, and apps during focus sessions' },
    { name: 'batch-processing', description: 'Batch similar tasks together to minimize context switching overhead' },
    { name: 'keyboard-shortcuts', description: 'Master keyboard shortcuts for IDE, terminal, and common applications' },
    { name: 'template-library', description: 'Build and maintain a personal library of reusable templates by category' },
    { name: 'note-organization', description: 'Organize notes with hierarchical tags, linking, and bi-directional references' },
    { name: 'knowledge-base', description: 'Build a personal knowledge base with articles, summaries, and cross-references' },
    { name: 'research-compiler', description: 'Compile research from multiple sources with annotations and synthesis' },
    { name: 'meeting-scheduler', description: 'Schedule meetings across time zones with availability polling and reminders' },
  ]},

  softwareDevelopment: { label: 'Software Development', count: 50, skills: [
    { name: 'git-workflow', description: 'Follow Git best practices with branch strategies, commit conventions, and PR templates' },
    { name: 'code-review-checklist', description: 'Review code systematically with checklists for security, performance, and style' },
    { name: 'api-design', description: 'Design RESTful and GraphQL APIs with consistency, versioning, and documentation' },
    { name: 'database-schema-design', description: 'Design normalized database schemas with indexes, constraints, and relationships' },
    { name: 'testing-strategy', description: 'Define testing strategy covering unit, integration, e2e, and property-based tests' },
    { name: 'ci-cd-pipeline', description: 'Set up CI/CD pipelines with build, test, lint, security scan, and deploy stages' },
    { name: 'docker-optimization', description: 'Optimize Docker images with multi-stage builds, layer caching, and minimal base images' },
    { name: 'kubernetes-deployment', description: 'Deploy applications to Kubernetes with Helm charts, probes, and auto-scaling' },
    { name: 'microservices-architecture', description: 'Design microservices with bounded contexts, event-driven communication, and API gateways' },
    { name: 'rest-api-patterns', description: 'Implement REST API patterns including pagination, filtering, HATEOAS, and idempotency' },
    { name: 'graphql-design', description: 'Design GraphQL schemas with resolvers, data loaders, subscriptions, and federation' },
    { name: 'error-handling', description: 'Handle errors consistently with typed exceptions, fallbacks, and user-friendly messages' },
    { name: 'logging-best-practices', description: 'Implement structured logging with levels, context, correlation IDs, and log rotation' },
    { name: 'monitoring-setup', description: 'Set up monitoring with metrics, alerts, dashboards, and distributed tracing' },
    { name: 'security-audit', description: 'Audit code for OWASP Top 10 vulnerabilities, dependency risks, and secret leaks' },
    { name: 'performance-optimization', description: 'Optimize application performance with profiling, caching, lazy loading, and CDN' },
    { name: 'code-migration', description: 'Plan and execute code migrations across languages, frameworks, or architectures' },
    { name: 'dependency-management', description: 'Manage dependencies with version pinning, audit, update automation, and lock files' },
    { name: 'refactoring-strategy', description: 'Refactor code incrementally with strangle pattern, feature flags, and safety nets' },
    { name: 'documentation-gen', description: 'Generate documentation from code with JSDoc, TypeDoc, OpenAPI, and storybooks' },
    { name: 'changelog-generation', description: 'Generate changelogs from conventional commits with semantic versioning bumps' },
    { name: 'semantic-versioning', description: 'Apply semantic versioning with breaking change detection and automated release notes' },
    { name: 'monorepo-setup', description: 'Set up monorepo with workspace tools, shared configs, and dependency graph awareness' },
    { name: 'package-publishing', description: 'Publish packages to npm, PyPI, or Maven with automated builds and provenance' },
    { name: 'environment-config', description: 'Manage environment configurations with validation, defaults, and secret injection' },
    { name: 'secrets-management', description: 'Manage secrets with vaults, encryption, rotation policies, and access audit' },
    { name: 'authentication-patterns', description: 'Implement authentication with JWT, OAuth2, SSO, MFA, and session management' },
    { name: 'authorization-rbac', description: 'Implement role-based access control with permissions, policies, and attribute checks' },
    { name: 'rate-limiting', description: 'Implement rate limiting with token bucket, sliding window, and distributed counters' },
    { name: 'caching-strategy', description: 'Design caching strategy with Redis, CDN, browser cache, and cache invalidation patterns' },
    { name: 'database-migrations', description: 'Manage database migrations with version control, rollbacks, and zero-downtime deploys' },
    { name: 'data-backup', description: 'Implement data backup strategy with snapshots, replication, and disaster recovery plans' },
    { name: 'api-versioning', description: 'Version APIs with URL paths, headers, or content negotiation and deprecation policies' },
    { name: 'webhook-handling', description: 'Handle webhooks with signature verification, retry logic, and idempotent processing' },
    { name: 'event-driven-architecture', description: 'Design event-driven systems with event sourcing, CQRS, and message brokers' },
    { name: 'message-queues', description: 'Use message queues for async processing with dead-letter queues and consumer groups' },
    { name: 'search-implementation', description: 'Implement full-text search with Elasticsearch, Meilisearch, or PostgreSQL FTS' },
    { name: 'file-upload-handling', description: 'Handle file uploads with validation, streaming, virus scanning, and CDN storage' },
    { name: 'email-service', description: 'Build email services with templates, sending, tracking, and bounce handling' },
    { name: 'push-notifications', description: 'Implement push notifications for web, iOS, and Android with segmentation' },
    { name: 'real-time-communication', description: 'Implement real-time features with WebSockets, SSE, and WebRTC' },
    { name: 'state-management', description: 'Manage application state with stores, reducers, selectors, and persistence' },
    { name: 'form-validation', description: 'Validate forms with schema validation, error messages, and real-time feedback' },
    { name: 'responsive-design', description: 'Build responsive UIs with mobile-first CSS, breakpoints, and adaptive layouts' },
    { name: 'accessibility-audit', description: 'Audit accessibility with ARIA roles, keyboard navigation, screen reader support, and contrast' },
    { name: 'localization-i18n', description: 'Implement i18n with translation files, locale detection, and pluralization rules' },
    { name: 'seo-optimization', description: 'Optimize for search engines with meta tags, structured data, sitemaps, and SSR' },
    { name: 'analytics-setup', description: 'Set up analytics with event tracking, user properties, funnels, and dashboards' },
    { name: 'a-b-testing', description: 'Implement A/B testing with feature flags, experiment frameworks, and statistical analysis' },
    { name: 'feature-flags', description: 'Manage feature flags with gradual rollout, kill switches, and targeting rules' },
  ]},

  aiAgents: { label: 'AI Agents', count: 30, skills: [
    { name: 'prompt-engineering', description: 'Craft effective prompts with system instructions, examples, and output formatting' },
    { name: 'rag-implementation', description: 'Implement Retrieval-Augmented Generation with document chunking, embedding, and retrieval' },
    { name: 'vector-database-setup', description: 'Set up vector databases with indexing, similarity search, and hybrid retrieval' },
    { name: 'embedding-generation', description: 'Generate and optimize embeddings for text, images, and multimodal content' },
    { name: 'llm-chaining', description: 'Chain LLM calls with output parsing, context passing, and conditional branching' },
    { name: 'tool-calling-patterns', description: 'Implement tool calling with function schemas, parallel execution, and result handling' },
    { name: 'agent-orchestration', description: 'Orchestrate multi-step agent workflows with planning, execution, and monitoring' },
    { name: 'multi-agent-systems', description: 'Design multi-agent systems with specialized roles, communication, and coordination' },
    { name: 'knowledge-graph', description: 'Build knowledge graphs with entities, relationships, and graph traversal queries' },
    { name: 'semantic-search', description: 'Implement semantic search with dense/sparse embeddings and hybrid ranking' },
    { name: 'fine-tuning-prep', description: 'Prepare datasets for fine-tuning with quality filtering, deduplication, and formatting' },
    { name: 'model-evaluation', description: 'Evaluate LLM outputs with metrics, human feedback, and automated test suites' },
    { name: 'hallucination-detection', description: 'Detect hallucinations with fact verification, consistency checks, and confidence scoring' },
    { name: 'context-window-management', description: 'Manage context windows with sliding windows, summarization, and selective inclusion' },
    { name: 'token-optimization', description: 'Optimize token usage with compression, truncation, and efficient prompting' },
    { name: 'streaming-responses', description: 'Implement streaming responses with SSE, chunked transfer, and progressive rendering' },
    { name: 'function-calling', description: 'Define and execute function calls with parameter validation, retries, and error recovery' },
    { name: 'structured-output', description: 'Generate structured outputs with JSON schema, type validation, and error correction' },
    { name: 'content-generation', description: 'Generate content with tone control, brand voice, and template-based production' },
    { name: 'summarization-techniques', description: 'Summarize text with extractive, abstractive, and query-focused techniques' },
    { name: 'classification-pipeline', description: 'Build text classification pipelines with zero-shot, few-shot, and fine-tuned models' },
    { name: 'entity-extraction', description: 'Extract entities from text with NER, regex patterns, and LLM-based extraction' },
    { name: 'sentiment-analysis', description: 'Analyze sentiment with polarity scoring, aspect-based analysis, and emotion detection' },
    { name: 'language-translation', description: 'Translate content with context preservation, glossary terms, and quality checks' },
    { name: 'code-generation', description: 'Generate code from natural language descriptions with language and framework awareness' },
    { name: 'code-explanation', description: 'Explain code with natural language summaries, complexity analysis, and design rationale' },
    { name: 'test-generation', description: 'Generate unit, integration, and e2e tests from code with coverage analysis' },
    { name: 'data-extraction', description: 'Extract structured data from unstructured text with schema-guided parsing' },
    { name: 'chat-bot-design', description: 'Design conversational agents with personality, context handling, and fallback strategies' },
    { name: 'agent-memory', description: 'Implement agent memory with episodic, semantic, and procedural memory stores' },
  ]},

  intelligence: { label: 'Intelligence & General', count: 28, skills: [
    { name: 'data-analysis', description: 'Analyze data with statistical methods, visualizations, and actionable insights' },
    { name: 'visualization-creation', description: 'Create charts and dashboards with libraries like D3, Chart.js, and matplotlib' },
    { name: 'report-generation', description: 'Generate reports with data aggregation, narrative writing, and PDF/HTML output' },
    { name: 'statistical-analysis', description: 'Apply statistical methods including hypothesis testing, regression, and Bayesian inference' },
    { name: 'machine-learning-pipeline', description: 'Build ML pipelines with feature engineering, training, evaluation, and deployment' },
    { name: 'data-cleaning', description: 'Clean datasets with missing value handling, outlier detection, and normalization' },
    { name: 'feature-engineering', description: 'Engineer features with transformation, encoding, selection, and dimensionality reduction' },
    { name: 'model-deployment', description: 'Deploy ML models with serving infrastructure, A/B testing, and monitoring' },
    { name: 'excel-automation', description: 'Automate Excel workflows with formulas, macros, VBA, and Python integration' },
    { name: 'csv-processing', description: 'Process CSV files with parsing, validation, transformation, and large-file streaming' },
    { name: 'json-transformation', description: 'Transform JSON data with jq, JSONPath, mapping, and schema validation' },
    { name: 'web-scraping', description: 'Scrape websites with selectors, pagination, rate limiting, and anti-bot avoidance' },
    { name: 'pdf-processing', description: 'Process PDFs with text extraction, form filling, merging, and OCR' },
    { name: 'image-processing', description: 'Process images with resizing, format conversion, filters, and OCR' },
    { name: 'audio-transcription', description: 'Transcribe audio with speaker diarization, timestamps, and confidence scoring' },
    { name: 'video-editing', description: 'Edit videos with cutting, transitions, subtitles, and compression' },
    { name: 'file-conversion', description: 'Convert between file formats for documents, images, audio, and video' },
    { name: 'data-validation', description: 'Validate data with schema checks, type constraints, range validation, and uniqueness' },
    { name: 'regex-mastery', description: 'Write and debug regular expressions for pattern matching, extraction, and validation' },
    { name: 'sql-query-optimization', description: 'Optimize SQL queries with indexes, explain plans, and query restructuring' },
    { name: 'cron-scheduling', description: 'Schedule tasks with cron expressions, timezone handling, and failure notifications' },
    { name: 'backup-strategy', description: 'Design backup strategies with 3-2-1 rule, encryption, and recovery testing' },
    { name: 'system-diagnostics', description: 'Diagnose system issues with logs, metrics, traces, and performance profiling' },
    { name: 'network-troubleshooting', description: 'Troubleshoot network issues with ping, traceroute, DNS checks, and packet analysis' },
    { name: 'bash-scripting', description: 'Write bash scripts with error handling, argument parsing, and idempotent operations' },
    { name: 'powershell-automation', description: 'Automate Windows tasks with PowerShell scripts, modules, and remoting' },
    { name: 'cross-platform-compat', description: 'Write cross-platform code with OS detection, path handling, and conditional imports' },
    { name: 'dev-environment-setup', description: 'Set up development environments with dotfiles, package managers, and containerization' },
  ]},

  tokenSavings: { label: 'Token Savings', count: 10, skills: [
    { name: 'prompt-compression', description: 'Compress prompts by removing redundancy, using abbreviations, and minimizing whitespace' },
    { name: 'context-pruning', description: 'Prune context by removing irrelevant messages, truncating long content, and deduplication' },
    { name: 'message-summarization', description: 'Summarize conversation history into compact representations preserving key information' },
    { name: 'token-budgeting', description: 'Budget tokens per conversation turn with allocation for system, tools, and user content' },
    { name: 'efficient-formatting', description: 'Format messages efficiently using compact JSON, minimal markdown, and abbreviated schemas' },
    { name: 'cache-responses', description: 'Cache LLM responses for identical or similar queries to avoid redundant API calls' },
    { name: 'selective-memory', description: 'Store only high-signal memories by filtering trivial interactions and deduplicating facts' },
    { name: 'chunking-strategy', description: 'Chunk large documents into optimal-sized segments for retrieval and processing' },
    { name: 'priority-filtering', description: 'Filter content by priority level before sending to LLM, dropping low-value tokens' },
    { name: 'batch-api-calls', description: 'Batch multiple API calls into single requests when the provider supports batching' },
  ]},

  planningExecution: { label: 'Planning & Execution', count: 10, skills: [
    { name: 'sprint-planning', description: 'Plan sprints with backlog refinement, capacity calculation, and commitment-based scoping' },
    { name: 'roadmap-creation', description: 'Create product roadmaps with themes, epics, timelines, and dependency mapping' },
    { name: 'task-decomposition', description: 'Decompose large tasks into small, estimable subtasks with acceptance criteria' },
    { name: 'estimation-techniques', description: 'Estimate effort using story points, t-shirt sizing, and #noestimates approaches' },
    { name: 'risk-assessment', description: 'Assess project risks with probability-impact matrices, mitigation plans, and monitoring' },
    { name: 'milestone-tracking', description: 'Track milestones with progress indicators, blockers, and stakeholder updates' },
    { name: 'stakeholder-communication', description: 'Communicate with stakeholders through status reports, demos, and escalation paths' },
    { name: 'retrospectives', description: 'Run retrospectives with start-stop-continue, sailboat, and 4L frameworks' },
    { name: 'continuous-improvement', description: 'Implement continuous improvement with metrics, feedback loops, and kaizen culture' },
    { name: 'execution-monitoring', description: 'Monitor execution with OKR tracking, velocity charts, and burndown/burnup reports' },
  ]},
};

function generateFrontmatter(name, description, category) {
  return `---
name: ${name}
description: ${description}
category: ${category}
---`;
}

function generateBody(name, description) {
  const title = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `
# ${title}

## Overview
${description}. This skill helps you apply structured, repeatable methods for consistent results.

## When to Use
- When you need to apply ${title.toLowerCase()} best practices
- When establishing processes or standards for your workflow
- When training team members on ${title.toLowerCase()}
- When automating or optimizing ${title.toLowerCase()} tasks

## Instructions
1. **Assess**: Evaluate the current state, requirements, and constraints
2. **Plan**: Define the approach, steps, and success criteria
3. **Execute**: Follow the established patterns and best practices
4. **Verify**: Check results against expected outcomes and quality standards
5. **Iterate**: Refine based on feedback and lessons learned

## Examples
\`\`\`
User: Help me apply ${title.toLowerCase()} for my current project
Assistant: I'll help you apply ${title.toLowerCase()} step by step...
\`\`\`

## Related Skills
- Use with \`workflow\` tool for orchestrated execution
- Combine with \`task\` tool for delegated processing
- Reference \`system-prompt\` for system-level integration
`;
}

let totalCreated = 0;
let totalSkipped = 0;

for (const [catKey, cat] of Object.entries(CATEGORIES)) {
  console.log(`\n=== ${cat.label} (${cat.skills.length}) ===`);
  for (const skill of cat.skills) {
    const skillDir = path.join(SKILLS_DIR, skill.name);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(skillFile)) {
      console.log(`  ⏭  ${skill.name} (already exists)`);
      totalSkipped++;
      continue;
    }

    const frontmatter = generateFrontmatter(skill.name, skill.description, cat.label);
    const body = generateBody(skill.name, skill.description);
    const content = `${frontmatter}\n${body}`;

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillFile, content);
    console.log(`  ✅ ${skill.name}`);
    totalCreated++;
  }
}

console.log('\n\n=== Summary ===');
console.log(`Created:  ${totalCreated}`);
console.log(`Skipped:  ${totalSkipped}`);
console.log(`Total:    ${totalCreated + totalSkipped}`);

const skillDirs = fs.readdirSync(SKILLS_DIR).filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory());
console.log(`\nSkills directory now has ${skillDirs.length} skill directories.`);

const logPath = path.resolve(__dirname, 'import-curated-skills-log.json');
fs.writeFileSync(logPath, JSON.stringify({ created: totalCreated, skipped: totalSkipped, total: totalCreated + totalSkipped }, null, 2));
console.log(`\nLog: ${logPath}`);
