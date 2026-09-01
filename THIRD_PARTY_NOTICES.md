# Third-party notices

NatureCo CLI includes third-party runtime dependencies and selected `SKILL.md`
documents. Their copyrights and licenses remain with their respective authors.
Exact source revisions and SHA-256 hashes for every bundled skill are recorded in
[`SKILL_PROVENANCE.json`](SKILL_PROVENANCE.json). A `SEE-UPSTREAM` or
`LicenseRef-Upstream` value means the upstream repository or skill-specific license
terms apply and must be reviewed before reusing that content independently.

| Upstream repository | Recorded license |
| --- | --- |
| anthropics/skills | See upstream and skill-specific terms |
| mattpocock/skills | MIT |
| xixu-me/skills | MIT |
| vercel-labs/agent-skills | See upstream |
| supabase/agent-skills | MIT |
| obra/superpowers | MIT |
| JuliusBrussee/caveman | Upstream custom terms |
| microsoft/azure-skills | MIT |
| Leonxlnx/taste-skill | MIT |
| remotion-dev/skills | See upstream |
| mcollina/skills | MIT |
| spillwavesolutions/design-doc-mermaid | See upstream |
| vyralcontent/content-skills | MIT |
| heygen-com/hyperframes | Apache-2.0 |
| roin-orca/skills | See upstream |
| larksuite/cli | MIT |
| halt-catch-fire/skills | See upstream |

NatureCo CLI's persistent browser-agent design was informed by the open-source
gstack browser project, particularly its persistent session, snapshot/reference,
and observe-act-observe patterns. gstack is Copyright (c) 2026 Garry Tan and is
distributed under the MIT License: https://github.com/garrytan/gstack

Playwright is used through `playwright-core` and retains its own license and notices.
The complete dependency tree and license inventory can be regenerated from the
locked package with `npm sbom --sbom-format cyclonedx`.
