#!/usr/bin/env bash
# Usage: label.sh add|remove <label> — only the agent's status/track labels.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue

if (( $# != 2 )); then
  echo "usage: label.sh add|remove <label>" >&2
  exit 5
fi
case "$1" in
  add) flag="--add-label" ;;
  remove) flag="--remove-label" ;;
  *) echo "action must be add or remove" >&2; exit 5 ;;
esac
case "$2" in
  agent:bug|agent:feature|agent:waiting-on-titus|agent:pr-open|agent:ready) ;;
  *) echo "label '$2' is not one the agent may change" >&2; exit 5 ;;
esac
gh issue edit "$ISSUE" "$flag" "$2"
