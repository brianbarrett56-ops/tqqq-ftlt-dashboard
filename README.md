# TQQQ FTLT Dashboard

Live page: https://brianbarrett56-ops.github.io/tqqq-ftlt-dashboard/

Static dashboard for the Holy Grail 401k / TQQQ FTLT strategy, with a live signal tab and a backtest back to 1953.

- **Live updates:** the page checks a feed once a minute and updates in place, with no reload. The feed is published by a scheduled job in a separate private repo, which runs the strategy engine on Yahoo Finance daily bars.
- **Fallback:** `data.json` and `backtest.json` in this repo are bundled snapshots, used only if the feed can't be reached.

Hypothetical results only; not investment advice.
