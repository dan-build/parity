#!/usr/bin/env bash
# The `data` branch holds history snapshots, apart from the code: hourly commits never
# touch `main` or trigger a production deploy.
#   scripts/data-branch.sh open <dir>             check it out into <dir> (create it the first time)
#   scripts/data-branch.sh save <dir> <message>   commit everything in <dir> and push it
set -euo pipefail
cmd="${1:?open|save}"; dir="${2:?dir}"

case "$cmd" in
  open)
    if git ls-remote --exit-code --heads origin data >/dev/null 2>&1; then
      git fetch --depth=1 origin data
      git worktree add --detach "$dir" FETCH_HEAD
    else
      # First run: an empty branch with no history (portable: works on git < 2.42 too).
      git worktree add -q --detach "$dir" HEAD
      ( cd "$dir" && git checkout -q --orphan data && git rm -rfq . )
      # Vercel: never build or deploy this branch.
      printf '{\n  "git": { "deploymentEnabled": false }\n}\n' > "$dir/vercel.json"
      cat > "$dir/README.md" <<'MD'
# Parity history

Hourly snapshots of the assets in `scripts/watchlist.json` on the `main` branch, written by
the Snapshot workflow. One JSON line per asset per run:

- `history/daily/<SYMBOL>/<YYYY-MM>.jsonl`: the full check (verdict, answer, method version,
  each token's premium, exit score, liquidity and volume)
- `history/prices/<SYMBOL>/<YYYY-MM>.jsonl`: prices and premiums only (used on small plans)

Live CoinMarketCap data only: a run that can't get live data records nothing.
Field definitions: `lib/history.ts` on `main`. Method: `METHOD.md` on `main`.
MD
    fi
    ;;
  save)
    msg="${3:?message}"
    cd "$dir"
    git add -A
    if git diff --cached --quiet; then echo "nothing to save"; exit 0; fi
    git -c user.name="parity-snapshot" -c user.email="parity-snapshot@users.noreply.github.com" commit -q -m "$msg"
    git push -q origin HEAD:refs/heads/data
    echo "saved: $msg"
    ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
