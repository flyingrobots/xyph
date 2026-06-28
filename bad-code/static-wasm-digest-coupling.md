# Static WebAssembly Digest Coupling in Intent Admission

## Overview
During the Edict Wasm Target Lowerer integration, `WasmVerifiedAdmissionService` was implemented with a statically bound `TRUSTED_WASM_DIGEST` to verify `WasmVerifierReport` validity.

## Severity & Impact
**Severity: High**
**Impact:** Introduces severe architectural rigidity. Whenever a new version of `xyph-target-lowerer.wasm` is compiled (e.g., following a compiler upgrade or lawpack enhancement), the resulting Wasm hash changes. This forces a synchronized lockstep release and redeployment of the `git-warp` admission portal to prevent total admission failure (`UntrustedWasmVerifierReport`).

## Concrete Refactoring Path
1. Define a `WasmLowererRegistryPort` within `git-warp` that connects to the active Xyph governance lawpack or an on-chain `TrustChainPort`.
2. When verifying `admitWasmIntent`, query the dynamic registry to validate that `report.wasmDigest` corresponds to an active, non-revoked WebAssembly component certificate.
3. Remove the hardcoded `TRUSTED_WASM_DIGEST` constant entirely.
