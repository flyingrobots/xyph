# Remaining vi.mock Decoupling in CLI Command Tests

## Overview
We have decoupled several CLI commands (`Show`, `Intake`, `Doctor`, `DashboardTrace`, `Artifact`, `AuditSovereignty`) from compile-time `vi.mock` calls in favor of explicit `CliContext` dependency injection.

## Remaining Targets
14 test suites still rely on compile-time `vi.mock`:
- `test/unit/CliJsonOutput.test.ts`
- `test/unit/CoordinatorService.POWERLEVEL.test.ts`
- `test/unit/CoordinatorService.test.ts`
- `test/unit/IdentityCommands.test.ts`
- `test/unit/MutationKernelService.test.ts`
- `test/unit/SearchCommand.test.ts`
- `test/unit/SignedSettlementCommands.test.ts`
- `test/unit/SovereigntyService.test.ts`
- `test/unit/SuggestCommand.test.ts`
- `test/unit/SuggestionCommands.test.ts`
- `test/unit/TraceabilityCommands.test.ts`
- `test/unit/TriageService.test.ts`
- `test/unit/WarpDashboardReadAdapter.test.ts`
- `test/unit/WizardCommands.test.ts`

## Refactoring Path
Replace `vi.mock` for external adapters/services with direct context dependency injection on `CliContext` during command execution tests.
