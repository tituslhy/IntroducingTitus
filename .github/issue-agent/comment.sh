#!/usr/bin/env bash
# Post .issue-agent-tmp/comment.md as a comment on issue $ISSUE. No arguments,
# so no other file can be posted.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue
no_args "$@"

body=".issue-agent-tmp/comment.md"
if [[ ! -s "$body" ]]; then
  echo "write the comment to $body first" >&2
  exit 4
fi
gh issue comment "$ISSUE" --body-file "$body"
