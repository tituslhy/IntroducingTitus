#!/usr/bin/env bash
# Print issue $ISSUE for the agent, keeping only text it may act on: the issue
# (which must be authored by $OWNER), $OWNER's comments, and the agent's own
# comments. Everyone else's comments are dropped here, in code.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue
no_args "$@"

OWNER="${OWNER:-tituslhy}"
json="$(gh issue view "$ISSUE" --json title,body,labels,author,state,comments)"

author="$(jq -r '.author.login' <<<"$json")"
if [[ "$author" != "$OWNER" ]]; then
  echo "issue #$ISSUE was opened by '$author', not '$OWNER'; refusing to read it" >&2
  exit 3
fi

jq -r --arg owner "$OWNER" --arg issue "$ISSUE" '
  "# #\($issue) \(.title)",
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
' <<<"$json"
