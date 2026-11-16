# Financial assumptions
All rand amounts are proposed planning figures from the supplied canvas. These are not validated prices, measured unit costs or forecasts.

| Plan | Monthly price | Hosted compute budget | Price less compute only |
|---|---:|---:|---:|
| Free | 0 | Capped trials only | Not modelled |
| Creator | 149 | 25 | 124 |
| Studio | 499 | 110 | 389 |
| Agency | 1499 | 390 | 1109 |

Fixed monthly budget: R85000, including founder/engineering compensation; see lean canvas.
The last column is **not contribution margin**: storage, transfer, payments, refunds and incremental support are not deducted.
At 55 Creator subscribers: MRR = R8195, hosted compute budget = R1375, remainder = R6820, shortfall against fixed spend = R78180 before other variable costs.
Ignoring all other variable costs, Creator-only break-even is ceil(85000/124) = 686. Real break-even is higher unless plan mix or other revenue improves it. Do not repeat the superseded R199/90-user/R12000 model.

General model:
MRR = sum(plan price × paid count).
Contribution = revenue excluding applicable sales taxes − compute − storage/render/transfer − processing/refunds − incremental support.
Operating result = contribution − fixed operating costs.
Break-even depends on plan mix, use, tax treatment and complete variable costs.
CAC payback = acquisition cost / measured monthly contribution; no CAC or churn observations exist yet.

Use scripts/financial_model.py for the lower-bound compute-only scenario. It deliberately does not claim profit.
Before launch: benchmark costs/minute, workload distribution, model failures/retries, retention, free-tier usage, vendor fees, VAT registration/pricing presentation, acquisition and support time.
The former R180000 development allocation was an illustrative earlier scenario, not the current canvas operating budget or a supplier quote.
