# Progress file

Path: `.disappointed-dad/progress.json` in the root of the project being reviewed. The `dad` terminal app uses **the same file**, so grades from both show up in `dad reportcard`. Keep the exact shape below.

Create it on first use and tell the user once that they may want to add `.disappointed-dad/` to `.gitignore`. After every graded decision, overwrite that topic's entry (don't create duplicates), set `updated` to today, and keep valid JSON.

```json
{
  "project": "my-app",
  "updated": "2026-11-19",
  "topics": {
    "Auth middleware": {
      "files": ["src/middleware/auth.ts"],
      "status": "weak",
      "lastAsked": "2026-11-19",
      "notes": "Couldn't explain token expiry / refresh"
    },
    "DB schema": {
      "files": ["prisma/schema.prisma"],
      "status": "solid",
      "lastAsked": "2026-11-19",
      "notes": "Good on relations; revisit indexes"
    }
  },
  "mocks": [
    { "date": "2026-11-19", "score": 6, "weakest": "Caching" }
  ]
}
```

`status` is one of `solid`, `partial`, `weak`. Dates are `YYYY-MM-DD`.
`again` mode picks `weak` first, then `partial`, oldest `lastAsked` first.
