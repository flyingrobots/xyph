# Backlog

This file tracks "BAD CODE" that needs to be refactored and "COOL IDEAS™" for future development.

## BAD CODE

- **[REFACTOR] Quest.ts God Object:** The `Quest.ts` entity is too large and has multiple responsibilities (validation, normalization, business logic). It should be refactored to separate these concerns.
- **[REFACTOR] Tight coupling to @git-stunts/git-warp:** The codebase directly interacts with the `git-warp` library in multiple places. An abstraction layer (`WarpAdapter`) should be introduced to decouple the domain from the storage layer.
- **[REFACTOR] Inconsistent validation logic:** Validation is sometimes done in entity constructors and sometimes in `normalize` functions. This should be standardized into dedicated validator classes.
- **[REFACTOR] Inconsistent file naming conventions:** File naming should be standardized to PascalCase across the project.
- **[REFACTOR] CLI command setup in root files:** The CLI command setup should be moved from the root files into the `src/cli` directory to improve separation of concerns.
- **[SECURITY] Lack of input sanitization on CLI:** The CLI does not sanitize user input, which is a security risk.
- **[SECURITY] Weak authentication scheme:** The `human.ada` login suggests a weak authentication scheme that should be replaced with a more secure method (e.g., public/private key pairs).
- **[PERFORMANCE] Slow pre-commit/pre-push test execution:** Running the full test suite (taking >90s) on git hooks limits developer iteration speed. We should investigate optimizing test setup/teardown, utilizing test caching, or pruning hook-based test scope to modified files.

## COOL IDEAS™

- **[FEATURE] `xyph quick-quest` command:** A new CLI command to interactively create an Intent and a Quest in a single step to improve time-to-value.
- **[ARCHITECTURE] `WarpAdapter` abstraction:** An adapter to encapsulate all interactions with the `git-warp` library, providing a single extension point and improving testability.
- **[PERFORMANCE] Indexing mechanism for fast graph queries:** A service to index the `git-warp` graph to allow for fast lookups without full graph traversals.
- **[OPERATIONS] Structured logging:** Replace all `console.log` calls with a structured logging library like `pino` or `winston`.
- **[OPERATIONS] Health check endpoint:** Add a health check endpoint to the `coordinator-daemon.ts`.
- **[OPERATIONS] Metrics for monitoring:** Add a system for exporting metrics about the health and performance of the system.
