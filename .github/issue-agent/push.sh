#!/usr/bin/env bash
# Push the current branch, only if it is agent/issue-$ISSUE-<slug>, to the
# same-named remote branch. No arguments, so no refspecs or --force.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue
no_args "$@"

branch="$(require_agent_branch)" || exit $?
git push -u origin "HEAD:refs/heads/${branch}"
