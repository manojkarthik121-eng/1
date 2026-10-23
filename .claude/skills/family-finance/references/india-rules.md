# India money rules & numbers (checked Oct 2026)

These numbers change with every Budget and every quarter. Use them as defaults, say
"as of FY 2026-27" when you quote them, and if a web search tool is available and a
decision hinges on a number (a tax regime choice, a scheme rate), check it first.

## Contents
1. Income tax (regimes, deductions)
2. Capital-gains tax on investments
3. Where to keep money: instruments and rates
4. Insurance
5. Loans and credit
6. Default assumptions for projections

## 1. Income tax

The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026. Section numbers below
are the familiar old ones (80C, 80D, 87A...) because that is what families and CAs still
say; the new Act renumbers them but the Budget 2026 kept rates and slabs the same.

**New regime (default), FY 2025-26 and FY 2026-27**

| Taxable income | Rate |
|---|---|
| up to ₹4 L | 0 |
| ₹4-8 L | 5% |
| ₹8-12 L | 10% |
| ₹12-16 L | 15% |
| ₹16-20 L | 20% |
| ₹20-24 L | 25% |
| above ₹24 L | 30% |

- Standard deduction ₹75,000 for salaried/pensioners.
- Rebate (87A) makes tax zero up to ₹12 L taxable income → **salary up to ₹12.75 L pays no tax**. Marginal relief just above.
- Employer NPS contribution (80CCD(2)) up to 14% of basic is still allowed.
- Almost nothing else is deductible (no 80C, 80D, HRA, home-loan interest on self-occupied house).

**Old regime**: 0 to ₹2.5 L, 5% to ₹5 L, 20% to ₹10 L, 30% above (60+ and 80+ get higher exemptions). Standard deduction ₹50,000; rebate up to ₹5 L.
Deductions: 80C ₹1.5 L (EPF, PPF, ELSS, life premium, principal of home loan, kids' tuition, SSY), 80D health premium ₹25k self/family + ₹25k parents (₹50k if parents are senior citizens), 80CCD(1B) NPS extra ₹50k, 24(b) home-loan interest up to ₹2 L, HRA exemption, 80E education-loan interest.

**Rule of thumb**: the old regime only wins when deductions are large, roughly ₹4-8 L+
depending on income (big HRA + home loan + full 80C/80D/NPS). Run
`fincalc.py tax` for each earner rather than guessing. Spouses are taxed separately, so
each earner picks their own regime.

Plus 4% health & education cess on tax. Surcharge above ₹50 L income.

## 2. Capital-gains tax (from 23 July 2024)

| Asset | Short term | Long term |
|---|---|---|
| Equity shares & equity mutual funds | held <12 months: 20% | ≥12 months: 12.5% on gains above ₹1.25 L per year |
| Debt mutual funds bought after 1 Apr 2023 | taxed at slab, whatever the holding period | same |
| Gold ETF / gold funds, listed | <12 months: slab | ≥12 months: 12.5% |
| Physical gold, property, unlisted | <24 months: slab | ≥24 months: 12.5% (no indexation; property bought before 23 Jul 2024 can choose 20% with indexation) |
| Sovereign Gold Bonds held to maturity | tax-free | |

**Tax harvesting**: selling and rebuying equity funds each year to book up to ₹1.25 L LTCG tax-free is a free, legal win for families with large equity holdings.

## 3. Where to keep money

| Need | Good homes | Rate / expectation |
|---|---|---|
| Emergency fund | Savings a/c with sweep-in FD, liquid fund, overnight fund, short FD | 3-7% |
| Goals < 3 years | FD, RD, liquid / money-market funds, arbitrage funds (equity taxation) | 6-7.5% |
| Goals 3-7 years | Mix: short-duration debt / PPF + hybrid or balanced advantage funds | 7-9% |
| Goals 7+ years & retirement | Equity index funds (Nifty 50, Nifty Next 50 / total market), flexi-cap funds, plus PPF/EPF/NPS as the debt part | equity long-run ~10-12% nominal, with big swings |
| Daughter's education/marriage | Sukanya Samriddhi (girl under 10) | 8.2% tax-free |

Small savings rates for Oct-Dec 2026 (reset every quarter): PPF 7.1% (tax-free, 15-year lock, ₹1.5 L/yr max), SSY 8.2%, SCSS 8.2% (60+), NSC 7.7%, KVP 7.5%, POMIS 7.4%, post office savings 4%. EPF ~8.25% (declared yearly). Voluntary PF (VPF) earns the EPF rate. Interest on EPF/VPF contributions above ₹2.5 L a year is taxable.

**Mutual-fund basics to pass on**: prefer **direct plans** (no distributor commission, ~0.5-1.5% a year cheaper, which compounds to lakhs) and low-cost index funds. Hold 3-5 funds at most. Use SIPs with a yearly step-up. Nominate every account.

**NPS**: Tier I has a low cost and suits retirement. In the new regime only the employer contribution is deductible. At 60, up to 60% can be withdrawn tax-free and the rest buys an annuity.

**Gold**: 5-10% of the portfolio as a hedge, through gold ETFs/funds rather than jewellery (making charges of 8-25% are lost on purchase).

**Real estate**: usually the family's biggest asset. Check rent yield (often 2-3%) vs the home-loan rate before buying a second property "as investment".

## 4. Insurance (protection comes before investing)

- **Term life**: every earning member with dependants. Cover ≈ 10-15× annual income + outstanding loans − existing investments, until the youngest child is independent / retirement (~60). Pure term only. ₹1 Cr for a 30-year-old non-smoker costs roughly ₹10-15k/year.
- **Health**: a family floater of at least ₹10 L in metros (₹25 L+ with a super top-up is cheap and better). Separate policy for parents (expensive; if they already have conditions, look for policies with short pre-existing-disease waiting periods). Don't rely only on employer cover: it ends when the job ends.
- **Personal accident / disability** cover for the main earner. Cheap.
- **Red flags**: endowment, money-back and "guaranteed return" traditional plans and many ULIPs earn 4-6%. They mix insurance and investment badly. If a family has them, compare the surrender value against continuing (policies past their surrender lock-in are often worth making "paid-up" and redirecting the premium to term + an index fund). Never advise a blanket surrender without seeing the numbers.

## 5. Loans and credit

| Debt | Typical rate | Priority |
|---|---|---|
| Credit-card revolve, BNPL late fees | 36-46% a year | Kill first, always |
| Payday / instant-loan apps | 30-60%+ | Kill first. Check that the app is RBI-registered; report harassment to the RBI Sachet portal or cybercrime.gov.in |
| Personal loan | 11-24% | High |
| Car loan | 8.5-12% | Medium |
| Gold loan | 9-15% | Medium |
| Education loan | 8-12% (interest deductible under 80E in old regime) | Low-medium |
| Home loan | 7.5-9.5% (repo-linked) | Low. Prepaying beats a debt fund after tax but usually loses to long-run equity; a 50/50 split of the surplus is a sensible middle |

- Credit score: pay on time, keep card utilisation under 30%, don't close your oldest card. A free yearly report is available from CIBIL/Experian/CRIF/Equifax.
- Total EMIs above 40% of take-home pay are a danger zone.
- Never borrow to invest in stocks/F&O or to lend to relatives.

## 6. Default assumptions for projections (state them in every plan)

| Item | Default |
|---|---|
| General inflation | 6% |
| Education inflation | 8-10% |
| Medical inflation | 10-12% |
| Wedding / lifestyle goals | 6-7% |
| Equity (index) long-run return | 11% (show 9% as the cautious case) |
| Debt / PPF / FD | 7% |
| Balanced (60/40) | 9% |
| Salary growth | 7-8% a year |
| Safe withdrawal in retirement | corpus ≈ 30-33× yearly spending (Indian inflation is higher than in the US, so the "25×" rule is too thin) |
