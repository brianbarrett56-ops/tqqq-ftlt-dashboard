# TQQQ FTLT Dashboard

Live page: https://brianbarrett56-ops.github.io/tqqq-ftlt-dashboard/

Static dashboard for the Holy Grail 401k / TQQQ FTLT strategy, with a live signal tab and a backtest back to 1953.

- **Updates:** the feed refreshes at 3:00 PM ET (2:00 PM CT) on weekdays and again after the close, when the backtest is rebuilt. The page checks it once a minute and updates in place, with no reload. The feed comes from a scheduled job in a separate private repo that runs the strategy engine on Yahoo Finance daily bars.
- **Fallback:** `data.json` and `backtest.json` in this repo are bundled snapshots, used only if the feed can't be reached.

Hypothetical results only; not investment advice.
