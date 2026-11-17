# shellcheck shell=bash
# Shared guards for the issue agent's helper scripts. Every script takes the
# issue number from the ISSUE env var (set by the workflow), never from args.

require_issue() {
  if [[ ! "${ISSUE:-}" =~ ^[0-9]+$ ]]; then
    echo "ISSUE must be a number (got '${ISSUE:-}')" >&2
    exit 2
  fi
}

no_args() {
  if (( $# > 0 )); then
    echo "$(basename "$0") takes no arguments" >&2
    exit 5
  fi
}

agent_branch_re() {
  printf '^agent/issue-%s-[a-z0-9-]+$' "$ISSUE"
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

# Prints the current branch, or exits 6 unless it is this issue's agent branch.
require_agent_branch() {
  local branch re
  branch="$(current_branch)"
  re="$(agent_branch_re)"
  if [[ ! "$branch" =~ $re ]]; then
    echo "current branch '$branch' is not agent/issue-${ISSUE}-<slug>" >&2
    exit 6
  fi
  printf '%s' "$branch"
}
