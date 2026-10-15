# Q2 2026 YouTube Performance Review

| File | What it is |
|---|---|
| `YouTube_Q2_2026_Review.xlsx` | **Your workbook.** Blank and ready: paste your YouTube Studio numbers into the yellow cells and every grade, colour, chart and takeaway fills in. |
| `YouTube_Q2_2026_Review_SAMPLE.xlsx` | The same workbook filled with **fictional** data for a made-up AI channel, so you can see what the finished review looks like. |
| `import_studio_export.py` | Loads a YouTube Studio Advanced-mode CSV export into the workbook automatically. |
| `build_workbook.py` | Rebuilds both workbooks from scratch. |

## Quick start
1. YouTube Studio → Analytics → **Advanced mode** → *Content* tab → date range **Apr 1 – Jun 30 2026** → add the metrics listed on the *Start Here* tab → export as CSV.
2. Run `python import_studio_export.py YouTube_Q2_2026_Review.xlsx "Table data.csv"`, or paste the columns into the *Video Data* tab by hand.
3. Fill in the *Monthly Trend* and *Traffic & Audience* tabs from Studio.
4. Read the *Dashboard*, then work through *Q3 Action Plan* and *Q3 Scorecard*.

Tabs: Start Here · Dashboard · Video Data · Monthly Trend · Traffic & Audience · Insights & Research · Q3 Action Plan · Q3 Scorecard · Benchmarks.
