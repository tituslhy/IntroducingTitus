#!/usr/bin/env bash
# Print an issue thread for the issue agent, keeping only text the agent may
# act on: the issue itself (which must be authored by the owner), the owner's
# comments, and the agent's own comments. Everyone else's comments are dropped
# here, in code, so they never reach the agent's context.
#
# Usage: bash .github/issue-agent/thread.sh <issue-number>
set -euo pipefail

OWNER="${OWNER:-tituslhy}"
ISSUE="${1:-}"

if [[ ! "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "usage: thread.sh <issue-number>" >&2
  exit 2
fi

json="$(gh issue view "$ISSUE" --json title,body,labels,author,state,comments)"

author="$(jq -r '.author.login' <<<"$json")"
if [[ "$author" != "$OWNER" ]]; then
  echo "issue #$ISSUE was opened by '$author', not '$OWNER'; refusing to read it" >&2
  exit 3
fi

jq -r --arg owner "$OWNER" '
  "# #\($ARGS.named.issue) \(.title)",
  "state: \(.state)",
  "labels: \([.labels[].name] | join(", "))",
  "",
  .body,
  "",
  (.comments[]
    | select(.author.login == $owner
             or .author.login == "github-actions"
             or .author.login == "github-actions[bot]")
    | "--- \(.author.login) @ \(.createdAt)\n\(.body)\n")
' --arg issue "$ISSUE" <<<"$json"
