#!/usr/bin/env bash
# Usage: pr.sh state | create | draft | update
#   state  — prints "none" or "<open|merged|closed> <url>" for this issue's agent branch
#   create/draft/update — title = line 1 of .issue-agent-tmp/pr.md, body = the rest
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue

cmd="${1:-}"
case "$cmd" in
  state|create|draft|update) ;;
  *) echo "usage: pr.sh state|create|draft|update" >&2; exit 5 ;;
esac
shift
no_args "$@"

if [[ "$cmd" == "state" ]]; then
  branch="$(current_branch)"
  if [[ ! "$branch" =~ $(agent_branch_re) ]]; then
    branch="$(git branch -r --list "origin/agent/issue-${ISSUE}-*" | head -n 1 | sed -e 's/^[* ]*//' -e 's#^origin/##')"
  fi
  if [[ -z "$branch" ]]; then
    echo none
    exit 0
  fi
  # Same-repo PRs only: a fork can open a PR from a branch with the same name.
  out="$(gh pr list --head "$branch" --state all --json number,state,url,isCrossRepository --jq '[.[] | select(.isCrossRepository == false)][0] // empty | "\(.state) \(.url)"')"
  if [[ -z "$out" ]]; then
    echo none
    exit 0
  fi
  state="$(printf '%s' "${out%% *}" | tr '[:upper:]' '[:lower:]')"
  echo "${state} ${out#* }"
  exit 0
fi

branch="$(require_agent_branch)" || exit $?
src=".issue-agent-tmp/pr.md"
body=".issue-agent-tmp/pr-body.md"
title=""
if [[ -f "$src" ]]; then
  title="$(head -n 1 "$src")"
fi
if [[ -z "$title" ]]; then
  echo "write $src first: line 1 is the title, the rest is the body" >&2
  exit 4
fi
tail -n +2 "$src" > "$body"

case "$cmd" in
  create) gh pr create --base main --head "$branch" --title "$title" --body-file "$body" ;;
  draft)  gh pr create --base main --head "$branch" --title "$title" --body-file "$body" --draft ;;
  update)
    # Edit by number, found among same-repo PRs only (never a fork's PR).
    number="$(gh pr list --head "$branch" --state all --json number,state,url,isCrossRepository --jq '[.[] | select(.isCrossRepository == false)][0] // empty | .number')"
    if [[ -z "$number" ]]; then
      echo "no PR from this repo's $branch to update" >&2
      exit 7
    fi
    gh pr edit "$number" --title "$title" --body-file "$body"
    ;;
esac
