#!/usr/bin/env python3
"""Personal-finance calculators for Indian households.

Every command prints JSON so the numbers can be quoted exactly in a plan.

  fincalc.py goal --target 2500000 --years 12 --saved 200000 --ret 0.11 --infl 0.08
  fincalc.py sip-fv --monthly 10000 --years 20 --ret 0.12 [--stepup 0.10]
  fincalc.py lumpsum --amount 500000 --years 10 --ret 0.08
  fincalc.py emi --principal 3000000 --rate 0.085 --years 20
  fincalc.py payoff --debts debts.json --extra 15000 [--method avalanche|snowball]
  fincalc.py fire --annual-expense 900000 --years 15 --infl 0.06 [--multiple 30]
  fincalc.py emergency --monthly-essentials 55000 [--months 6]
  fincalc.py tax --gross 1800000 [--deductions-old 250000] [--hra-exempt 120000]

debts.json: [{"name": "HDFC card", "balance": 85000, "rate": 0.42, "emi": 5000}, ...]
"""
import argparse
import json
import math
import sys


def fv_lumpsum(amount, years, ret):
    return amount * (1 + ret) ** years


def fv_sip(monthly, years, ret, stepup=0.0):
    """Future value of a monthly SIP invested at the start of each month,
    with an optional yearly step-up of the SIP amount. Uses the effective monthly
    rate, so a 12% annual return really is 12% a year (matches the workbook)."""
    r = (1 + ret) ** (1 / 12) - 1
    total = 0.0
    sip = monthly
    for _ in range(int(round(years))):
        for _ in range(12):
            total = (total + sip) * (1 + r)
        sip *= 1 + stepup
    return total


def sip_needed(target_fv, years, ret, saved=0.0, stepup=0.0):
    remaining = target_fv - fv_lumpsum(saved, years, ret)
    if remaining <= 0:
        return 0.0
    unit = fv_sip(1.0, years, ret, stepup)
    return remaining / unit


def emi(principal, rate, years):
    r = rate / 12
    n = int(round(years * 12))
    if r == 0:
        return principal / n
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


def payoff(debts, extra, method="avalanche", max_months=600):
    """Simulate paying every minimum (emi) plus `extra` per month, putting the
    extra (and freed-up EMIs) on one debt at a time."""
    debts = [dict(d) for d in debts]
    key = (lambda d: -d["rate"]) if method == "avalanche" else (lambda d: d["balance"])
    budget = sum(d["emi"] for d in debts) + extra
    month = 0
    total_interest = 0.0
    order, cleared = [], {}
    while any(d["balance"] > 0.5 for d in debts) and month < max_months:
        month += 1
        live = sorted([d for d in debts if d["balance"] > 0.5], key=key)
        for d in live:
            i = d["balance"] * d["rate"] / 12
            d["balance"] += i
            total_interest += i
        pool = budget
        for d in live:  # minimums first
            pay = min(d["emi"], d["balance"])
            d["balance"] -= pay
            pool -= pay
        for d in live:  # then the extra, in priority order
            if pool <= 0:
                break
            pay = min(pool, d["balance"])
            d["balance"] -= pay
            pool -= pay
        for d in live:
            if d["balance"] <= 0.5 and d["name"] not in cleared:
                cleared[d["name"]] = month
                order.append(d["name"])
    return {
        "method": method,
        "monthly_outflow": round(budget),
        "months_to_debt_free": month,
        "total_interest_paid": round(total_interest),
        "payoff_order": [{"debt": n, "cleared_in_month": cleared[n]} for n in order],
        "unfinished": month >= max_months,
    }


def slab_tax(income, slabs):
    tax, prev = 0.0, 0.0
    for upto, rate in slabs:
        if income > prev:
            tax += (min(income, upto) - prev) * rate
        prev = upto
    return tax


# FY 2025-26 and FY 2026-27 individual slabs (Budget 2026 kept them), under 60.
NEW_SLABS = [(400000, 0), (800000, .05), (1200000, .10), (1600000, .15),
             (2000000, .20), (2400000, .25), (math.inf, .30)]
OLD_SLABS = [(250000, 0), (500000, .05), (1000000, .20), (math.inf, .30)]


def tax_compare(gross, deductions_old=0.0, hra_exempt=0.0, salaried=True):
    std_new = 75000 if salaried else 0
    std_old = 50000 if salaried else 0
    ti_new = max(0, gross - std_new)
    t_new = slab_tax(ti_new, NEW_SLABS)
    if ti_new <= 1200000:
        t_new = 0.0  # Sec 87A rebate
    elif ti_new - 1200000 < t_new:
        t_new = ti_new - 1200000  # marginal relief just above 12L
    ti_old = max(0, gross - std_old - deductions_old - hra_exempt)
    t_old = slab_tax(ti_old, OLD_SLABS)
    if ti_old <= 500000:
        t_old = 0.0
    cess = 1.04
    res = {
        "new_regime": {"taxable_income": round(ti_new), "tax_incl_cess": round(t_new * cess)},
        "old_regime": {"taxable_income": round(ti_old), "tax_incl_cess": round(t_old * cess)},
        "note": "FY2025-26 / 2026-27 slabs, surcharge ignored (applies above 50L). Verify current-year rules.",
    }
    better = "new" if res["new_regime"]["tax_incl_cess"] <= res["old_regime"]["tax_incl_cess"] else "old"
    res["better_regime"] = better
    res["saving"] = abs(res["new_regime"]["tax_incl_cess"] - res["old_regime"]["tax_incl_cess"])
    return res


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("goal", help="inflate a goal and find the monthly SIP needed")
    g.add_argument("--target", type=float, required=True, help="cost in today's rupees")
    g.add_argument("--years", type=float, required=True)
    g.add_argument("--saved", type=float, default=0)
    g.add_argument("--ret", type=float, required=True)
    g.add_argument("--infl", type=float, default=0.06)
    g.add_argument("--stepup", type=float, default=0.0)

    s = sub.add_parser("sip-fv")
    s.add_argument("--monthly", type=float, required=True)
    s.add_argument("--years", type=float, required=True)
    s.add_argument("--ret", type=float, required=True)
    s.add_argument("--stepup", type=float, default=0.0)

    l = sub.add_parser("lumpsum")
    l.add_argument("--amount", type=float, required=True)
    l.add_argument("--years", type=float, required=True)
    l.add_argument("--ret", type=float, required=True)

    e = sub.add_parser("emi")
    e.add_argument("--principal", type=float, required=True)
    e.add_argument("--rate", type=float, required=True)
    e.add_argument("--years", type=float, required=True)

    d = sub.add_parser("payoff")
    d.add_argument("--debts", required=True, help="JSON file")
    d.add_argument("--extra", type=float, default=0)
    d.add_argument("--method", choices=["avalanche", "snowball", "both"], default="both")

    f = sub.add_parser("fire", help="corpus needed to retire on investments")
    f.add_argument("--annual-expense", type=float, required=True, help="today's rupees")
    f.add_argument("--years", type=float, required=True, help="years until retirement")
    f.add_argument("--infl", type=float, default=0.06)
    f.add_argument("--multiple", type=float, default=30, help="corpus as a multiple of yearly spend")

    m = sub.add_parser("emergency")
    m.add_argument("--monthly-essentials", type=float, required=True)
    m.add_argument("--months", type=float, default=6)

    t = sub.add_parser("tax", help="compare new vs old regime for one salaried person")
    t.add_argument("--gross", type=float, required=True)
    t.add_argument("--deductions-old", type=float, default=0, help="80C+80D+80CCD(1B)+24(b) etc.")
    t.add_argument("--hra-exempt", type=float, default=0)
    t.add_argument("--not-salaried", action="store_true")

    a = p.parse_args()
    if a.cmd == "goal":
        fut = fv_lumpsum(a.target, a.years, a.infl)
        out = {
            "target_today": round(a.target), "target_future": round(fut),
            "saved_grows_to": round(fv_lumpsum(a.saved, a.years, a.ret)),
            "monthly_sip_needed": round(sip_needed(fut, a.years, a.ret, a.saved, a.stepup)),
            "assumptions": {"years": a.years, "return": a.ret, "inflation": a.infl, "stepup": a.stepup},
        }
    elif a.cmd == "sip-fv":
        fv = fv_sip(a.monthly, a.years, a.ret, a.stepup)
        invested = sum(a.monthly * (1 + a.stepup) ** y * 12 for y in range(int(round(a.years))))
        out = {"future_value": round(fv), "total_invested": round(invested), "gain": round(fv - invested)}
    elif a.cmd == "lumpsum":
        out = {"future_value": round(fv_lumpsum(a.amount, a.years, a.ret))}
    elif a.cmd == "emi":
        x = emi(a.principal, a.rate, a.years)
        out = {"emi": round(x), "total_paid": round(x * a.years * 12),
               "total_interest": round(x * a.years * 12 - a.principal)}
    elif a.cmd == "payoff":
        debts = json.load(open(a.debts))
        methods = ["avalanche", "snowball"] if a.method == "both" else [a.method]
        out = {m_: payoff(debts, a.extra, m_) for m_ in methods}
        out["no_extra_baseline"] = payoff(debts, 0, "avalanche")
    elif a.cmd == "fire":
        spend = a.annual_expense * (1 + a.infl) ** a.years
        out = {"annual_spend_at_retirement": round(spend), "corpus_needed": round(spend * a.multiple),
               "corpus_in_todays_rupees": round(a.annual_expense * a.multiple)}
    elif a.cmd == "emergency":
        out = {"emergency_fund_target": round(a.monthly_essentials * a.months)}
    elif a.cmd == "tax":
        out = tax_compare(a.gross, a.deductions_old, a.hra_exempt, not a.not_salaried)
    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
