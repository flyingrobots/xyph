# DATA CONTRACTS

## Versioning
All payloads MUST include `schemaVersion`.

## Task (required)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Canonical Task Entity",
  "type": "object",
  "required": [
    "id",
    "schemaVersion",
    "title",
    "userStory",
    "status",
    "milestoneId",
    "estimates",
    "graph"
  ],
  "properties": {
    "schemaVersion": { "type": "string", "const": "v1.0" },
    "id": { "type": "string", "pattern": "^TASK-[A-Z0-9]{4,10}$" },
    "title": { "type": "string", "maxLength": 120 },
    "userStory": { "type": "string", "pattern": "^As a .+, I want .+, so that .+$" },
    "status": { "type": "string", "enum": ["BACKLOG", "PLANNED", "IN_PROGRESS", "BLOCKED", "DONE", "WONT_DO"] },
    "milestoneId": { "type": "string", "pattern": "^MILE-[A-Z0-9]+$" },
    "estimates": {
      "type": "object",
      "required": ["complexity", "humanHours"],
      "properties": {
        "complexity": { "type": "string", "enum": ["XS", "S", "M", "L", "XL"] },
        "humanHours": { "type": "number", "minimum": 0.5, "maximum": 160 },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "graph": {
      "type": "object",
      "required": ["blockedBy", "blocking"],
      "properties": {
        "blockedBy": { "type": "array", "items": { "type": "string" } },
        "blocking": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## PlanPatch
- id
- createdAt
- actor
- operations[]
- summary
- riskScore
- confidenceScore
- requiresApproval (bool)
