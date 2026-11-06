## Description
<!-- Provide a clear, concise summary of the changes and the architectural rationale. -->

## Related Issues
<!-- Link relevant issue or architectural discussion, e.g. Closes #123 -->

## Architectural & Invariant Checklist
- [ ] **Zero-Content Ingestion Boundary**: Verified that no prompt text, completions, code snippets, command parameters, or local filesystem paths are ingested, persisted, or transmitted.
- [ ] **Schema Invariant**: If telemetry or sync payloads were modified, changes are reflected in `companion/mirror.js` (`SENT`) and formally documented in [DATA.md](DATA.md).
- [ ] **Network Isolation**: Verified that local webviews and daemon interfaces remain dependency-free without external CDN references.
- [ ] **Automated Tests**: Unit test suite passes locally (`npm test`) including contract verification (`test/mirror-fields.test.js`).
- [ ] **Code Hygiene**: No comments in code (names and tests say why), no dead code or leftover notes.
