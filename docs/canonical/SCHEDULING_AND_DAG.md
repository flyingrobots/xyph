# SCHEDULING AND DAG
**Version:** 1.0.0
**Enforcement:** ALGORITHMIC VERIFICATION

## Purpose
Specifies the mathematical primitives for transforming a rebalanced DAG into executable lanes. Uses proven graph algorithms: toposort for ordering, Dijkstra for critical path, and Dilworth's theorem for anti-chains.

## Core Definitions
- **Ready Set (Frontier)**: Tasks with no incoming blocks edges from incomplete Tasks.
- **Critical Path**: Longest path (by humanHours) from root to leaf.
- **Anti-Chain**: Maximal set of parallelizable Tasks (no dependencies).
- **Lane**: Partitioned schedule respecting capacity.

## Required Algorithms
1. **Topological Sort**: Linearize DAG into execution sequence (Kahn's).
2. **Critical Path**: Identify delay risks (Dijkstra).
3. **Anti-Chain Generation**: MECE partitioning for concurrent execution (Greedy coloring).
4. **Capacity-Aware Bundling**: Assign sequences to lanes without overload (Bin-packing).

```mermaid
flowchart LR
    subgraph S1["Stage 1: Topological Sort"]
        TOPO["Kahn's algorithm\nlinearize DAG"]
    end

    subgraph S2["Stage 2: Critical Path"]
        CRIT["DP longest path\nidentify delay risks"]
    end

    subgraph S3["Stage 3: Anti-Chains"]
        ANTI["Greedy coloring\nMECE parallel sets\n(Dilworth's theorem)"]
    end

    subgraph S4["Stage 4: Capacity Bundling"]
        LANE["Bin-packing\nassign to lanes\nrespect capacity"]
    end

    DAG["Rebalanced DAG"] --> S1
    S1 -->|"execution order"| S2
    S2 -->|"annotated priorities"| S3
    S3 -->|"parallel groups"| S4
    S4 --> OUT["Executable Lanes"]
```
