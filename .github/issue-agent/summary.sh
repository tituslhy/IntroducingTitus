#!/usr/bin/env bash
# Runs in the workflow AFTER the agent (the agent never runs this). Prints what
# the run did — outcome, turns, cost, blocked actions, the agent's last
# message — to the log and the run's Summary page. If the agent posted nothing
# on the issue during this run, it says so on the issue with the run link.
#
# Env: EXEC (execution file from claude-code-action), ISSUE, STARTED (UTC
# ISO-8601 job start), RUN_URL, GITHUB_REPOSITORY, GITHUB_STEP_SUMMARY.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_issue

if [[ -z "${EXEC:-}" || ! -f "$EXEC" ]]; then
  echo "no execution file"
  exit 0
fi

result="$(jq -c '(if type == "array" then . else [.] end) | map(select(.type? == "result")) | last // {}' "$EXEC")"

outcome="$(jq -r '.subtype // "unknown"' <<<"$result")"
turns="$(jq -r '.num_turns // "?"' <<<"$result")"
cost="$(jq -r '.total_cost_usd // "?"' <<<"$result")"
blocked="$(jq -r '(.permission_denials // []) | length' <<<"$result")"
denials="$(jq -r '
  (.permission_denials // [])[]
  | "- \(.tool_name // "?"): \(
      (.tool_input | if type == "object" then (.command // .file_path // tojson) else tostring end)
      | tostring | .[0:160])"' <<<"$result")"
last="$(jq -r '(.result // "") | tostring | .[0:1500]' <<<"$result")"

report="outcome: ${outcome}
turns: ${turns}
cost: \$${cost}
blocked: ${blocked}"
if [[ -n "$denials" ]]; then
  report="${report}
${denials}"
fi
report="${report}
last message:
${last}"

echo "$report"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '### Issue agent run\n\n```\n%s\n```\n' "$report" >> "$GITHUB_STEP_SUMMARY"
fi

# Silent-run check: did the agent (or the failure notice) comment during this run?
if [[ ! "${GITHUB_REPOSITORY:-}" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] \
  || [[ ! "${STARTED:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  echo "skipping silent-run check (GITHUB_REPOSITORY or STARTED missing)" >&2
  exit 0
fi

# --paginate prints one count per page; add them up.
counts="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${ISSUE}/comments" --paginate \
  --jq "[.[] | select(.user.login == \"github-actions[bot]\" and .created_at >= \"${STARTED}\")] | length")"
posted="$(awk '{ s += $1 } END { print s + 0 }' <<<"$counts")"

if [[ "$posted" == "0" ]]; then
  body="${RUNNER_TEMP:-.}/issue-agent-summary.md"
  printf 'The issue agent finished without posting anything on this issue.\n\n```\n%s\n```\n\nRun log: %s\n' \
    "$report" "${RUN_URL:-}" > "$body"
  gh issue comment "$ISSUE" --body-file "$body"
fi
