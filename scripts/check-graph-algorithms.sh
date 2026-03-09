#!/bin/bash
# check-graph-algorithms.sh — Detect userland graph algorithm implementations.
#
# XYPH bans reimplementing graph algorithms that git-warp provides natively.
# This script catches common BFS/DFS/traversal patterns in production code.
#
# Runs as part of CI (strict-policy job) and can be run locally:
#   bash scripts/check-graph-algorithms.sh

set -euo pipefail

EXIT_CODE=0
SCAN_DIRS="src/"

# ─────────────────────────────────────────────────────────────
# Pattern 1: Manual BFS — queue.shift() in production code
# The classic BFS dequeue operation. If you're shifting from a
# queue, you're almost certainly doing breadth-first traversal.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E '\bqueue\.shift\(\)' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected manual BFS pattern (queue.shift()). Use graph.traverse.bfs() instead."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 2: Manual DFS — stack.pop() + visited/seen set
# A stack with a visited set is the textbook DFS pattern.
# Plain stack.pop() without visited is just normal array usage.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -l -E '\bstack\.pop\(\)' "$SCAN_DIRS" 2>/dev/null | while read -r file; do
  if grep -q -E '\b(visited|seen)\b' "$file"; then
    grep -n '\bstack\.pop\(\)' "$file"
  fi
done | grep .; then
  echo ""
  echo "::error::Detected manual DFS pattern (stack.pop() + visited set). Use graph.traverse.dfs() instead."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 3: Visited-set + queue/stack combo in same file
# A visited/seen set alone is fine (dedup). Combined with a
# queue or stack variable, it's a graph traversal.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -l -E 'const (visited|seen) = new Set' "$SCAN_DIRS" | \
   grep -v '\.test\.' | grep -v '__tests__' | while read -r file; do
  if grep -q -E '\b(queue|stack)\b' "$file"; then
    echo "$file"
    grep -n -E 'const (visited|seen) = new Set' "$file"
  fi
done | grep .; then
  echo ""
  echo "::error::Detected visited/seen set + queue/stack in production code — manual graph traversal. Use graph.traverse.* instead."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 4: Hand-rolled topological sort (Kahn's algorithm)
# In-degree tracking is the hallmark of Kahn's topo sort.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E '\binDegree\b|\bin_degree\b|\bindegree\b' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected in-degree tracking — likely a hand-rolled topological sort. Use graph.traverse.topologicalSort() instead."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 5: Dijkstra / priority queue for shortest path
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -i -E '\bpriority.?queue\b|\bmin.?heap\b|\bdijkstra\b' "$SCAN_DIRS"; then
  echo ""
  echo "::error::Detected priority queue or Dijkstra implementation. Use graph.traverse.weightedShortestPath() or graph.traverse.aStarSearch() instead."
  EXIT_CODE=1
fi

# ─────────────────────────────────────────────────────────────
# Pattern 6: Manual reachability / cycle detection
# If you're writing your own reachability check with a while
# loop + neighbors, use graph.traverse.isReachable() instead.
# ─────────────────────────────────────────────────────────────
if grep -rn --include='*.ts' -E '\breachable\b.*=.*false' "$SCAN_DIRS" | \
   grep -v 'traverse\.' | grep -v '\.test\.' | grep -v '__tests__' | grep .; then
  echo ""
  echo "::error::Detected manual reachability tracking. Use graph.traverse.isReachable() instead."
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ No userland graph algorithm patterns detected."
fi

exit $EXIT_CODE
