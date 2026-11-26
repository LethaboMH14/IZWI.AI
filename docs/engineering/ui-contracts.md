# Lane B/D UI contracts

These contracts are implemented by the server routes and actions. Timestamps are epoch milliseconds.

## A. Render staleness

New render jobs store `input.clip = { startMs, endMs, version }` with `input.outputId`. Rendering uses that captured range. Before release, the server checks that the live clip still has the captured range and version. A mismatch fails the output with `The clip changed during rendering. Render it again.` and discards temporary and final render files. Older jobs without `input.clip` use the current range. Moving a clip fails its unposted ready, queued, blocked, and running outputs; queued and blocked render jobs are cancelled.

## B. Clip state

Each item in `ProjectState.clips` includes `version: number` and `updatedAt: number`. These fields are read-only response data.

## C. Conditional edits

Clip PATCH accepts optional integer `expectUpdatedAt`. When supplied, the clip update only applies if `updated_at` still matches; otherwise the API returns HTTP 409 with `This changed since you loaded it.`

Caption line PATCH accepts optional `expectText` (up to 400 characters). When supplied with a text edit, the update only applies if the stored text still matches; otherwise it returns the same HTTP 409 response. Omitting either expectation keeps legacy client behavior.

## D. Storage totals

Project state includes `storage: { bytes, byKind }`. The total and per-kind bytes cover all assets scoped to the current workspace and project.

## F. Lite project read

`GET /api/projects/:id?lite=1` returns the normal project state without a `peaks` property and does not read the peaks file. Requests without `lite=1` keep the full response.

## G. Idempotent output creation

Output creation with an `Idempotency-Key` scopes the key to workspace and project. Repeating a key returns the first output's `{ id, blocked, reason }` without inserting another output. Lookup, insert, and enqueue occur in one transaction. Different keys create distinct outputs.
