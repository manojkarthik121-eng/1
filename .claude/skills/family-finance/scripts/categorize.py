#!/usr/bin/env python3
"""Read Indian bank / credit-card statements (CSV or Excel) and categorise every
transaction.

  categorize.py statement1.csv [statement2.xlsx ...] --out-dir OUT [--rules extra_rules.json]

Writes:
  OUT/transactions.csv   date, account, description, merchant, amount (+in / -out), category, group
  OUT/summary.json       monthly income/spend by category, savings rate, top merchants,
                         recurring payments, uncategorised items to review

The reader finds the header row itself (banks put several lines of account details
above it) and understands the usual layouts: separate Withdrawal/Deposit or
Debit/Credit columns, or one Amount column with a Dr/Cr marker.

extra_rules.json maps a category to keywords, e.g. {"Kids - School": ["dps", "vidya"]}.
Its rules are checked before the built-in ones.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

# (category, group, keywords). Order matters: first match wins.
# group is one of Income, Needs, Wants, Savings, Debt, Transfer.
RULES = [
    ("Salary", "Income", ["salary", "sal cr", "payroll", "neft cr-.*sal"]),
    ("Interest & Dividends", "Income", ["int.pd", "int pd", "interest credit", "credit interest", "dividend", "int.coll"]),
    ("Refund / Cashback", "Income", ["refund", "cashback", "reversal", "rev-"]),
    ("Investments - SIP/MF", "Savings", ["sip", "mutual fund", "bse ltd", "nse clearing", "zerodha", "groww", "kuvera",
                                         "coin by", "iccl", "indian clearing", "camsonline", "kfintech", "mf utility", "paytm money"]),
    ("Investments - PPF/NPS/RD/FD", "Savings", ["ppf", "nps", "pran", "recurring dep", "rd inst", "fd booked", "fixed deposit", "sukanya", "ssy"]),
    ("Insurance", "Needs", ["lic", "insurance", "hdfc life", "icici pru", "sbi life", "max life", "star health",
                            "niva bupa", "care health", "policybazaar", "acko", "digit ins", "tata aia", "premium"]),
    ("Loan EMI", "Debt", ["emi", "loan", "bajaj fin", "home loan", "nach.*fin", "ach d-", "achdr"]),
    ("Credit Card Bill", "Transfer", ["credit card payment", "cc payment", "card bill", "billdesk.*card", "cred club", "cred.club",
                                      "autopay.*card", "bbps.*card"]),
    ("Rent", "Needs", ["rent", "nobroker", "housing.com rent"]),
    ("Utilities", "Needs", ["electricity", "bescom", "msedcl", "tneb", "tata power", "adani elec", "bses", "water bill",
                            "gas bill", "mahanagar gas", "indane", "hp gas", "bharat gas", "piped gas", "igl"]),
    ("Phone & Internet", "Needs", ["airtel", "jio", "vodafone", " vi ", "bsnl", "act fibernet", "broadband", "hathway", "recharge"]),
    ("Groceries", "Needs", ["bigbasket", "blinkit", "zepto", "dmart", "d mart", "reliance fresh", "more retail", "jiomart",
                            "grofers", "kirana", "supermarket", "instamart", "nature's basket", "spencer"]),
    ("Education", "Needs", ["school", "college", "tuition", "fees", "byju", "unacademy", "vedantu", "coursera", "udemy", "university"]),
    ("Medical", "Needs", ["pharmacy", "apollo", "medplus", "1mg", "pharmeasy", "netmeds", "hospital", "clinic", "diagnostic",
                          "lab ", "doctor", "practo"]),
    ("Fuel & Transport", "Needs", ["petrol", "fuel", "hpcl", "iocl", "bpcl", "indian oil", "shell", "fastag", "metro",
                                   "uber", "ola", "rapido", "irctc", "redbus"]),
    ("Household Help", "Needs", ["maid", "cook", "driver salary", "servant"]),
    ("Food Delivery & Dining", "Wants", ["swiggy", "zomato", "restaurant", "cafe", "dominos", "pizza", "mcdonald", "kfc",
                                         "starbucks", "eatclub", "eatsure", "barbeque", "haldiram"]),
    ("Shopping", "Wants", ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "tatacliq", "croma", "reliance digital",
                           "decathlon", "lifestyle", "westside", "pantaloons", "ikea"]),
    ("Subscriptions & Entertainment", "Wants", ["netflix", "hotstar", "prime video", "amazon prime", "spotify", "youtube",
                                                "sonyliv", "zee5", "jiocinema", "bookmyshow", "pvr", "inox", "apple.com", "google play"]),
    ("Travel & Holidays", "Wants", ["makemytrip", "goibibo", "cleartrip", "indigo", "air india", "vistara", "akasa", "spicejet",
                                    "oyo", "airbnb", "booking.com", "yatra", "ixigo"]),
    ("Gaming / Betting / Trading", "Wants", ["dream11", "mpl", "rummy", "my11circle", "winzo", "poker", "fantasy", "betting",
                                              "f&o", "olymp", "binance", "wazirx", "coindcx", "coinswitch"]),
    ("Bank Charges & Fees", "Needs", ["charges", "chrg", "penalty", "late fee", "annual fee", "gst on", "min bal", "sms alert",
                                      "dc amc", "fin chg", "finance charge"]),
    ("Cash Withdrawal", "Wants", ["atm", "atw", "cash wdl", "cash withdrawal", "nwd", "eaw"]),
    ("Gifts & Family Support", "Needs", ["gift", "parents", "mom", "dad", "papa", "mummy", "family support"]),
    ("Donations", "Wants", ["donation", "temple", "trust", "charity", "give india"]),
]

GROUP_OF = {c: g for c, g, _ in RULES}

DATE_HINTS = ("date", "txn date", "transaction date", "value date", "tran date")
DESC_HINTS = ("narration", "description", "particulars", "remarks", "details", "transaction details", "transaction remarks")


def norm(s):
    return re.sub(r"\s+", " ", str(s).strip().lower())


def load_raw(path):
    p = Path(path)
    if p.suffix.lower() in (".xls", ".xlsx", ".xlsm"):
        return pd.read_excel(p, header=None, dtype=str)
    # Bank CSVs are ragged; read line by line so pandas does not choke.
    import csv
    for enc in ("utf-8-sig", "latin-1"):
        try:
            with open(p, newline="", encoding=enc) as fh:
                rows = list(csv.reader(fh))
            break
        except UnicodeDecodeError:
            continue
    width = max(len(r) for r in rows) if rows else 0
    return pd.DataFrame([r + [""] * (width - len(r)) for r in rows], dtype=str)


def find_header(raw):
    for i in range(min(len(raw), 60)):
        cells = [norm(c) for c in raw.iloc[i].tolist()]
        has_date = any(any(h == c or c.startswith(h) for h in DATE_HINTS) for c in cells)
        has_desc = any(any(h in c for h in DESC_HINTS) for c in cells)
        if has_date and has_desc:
            return i
    raise ValueError("could not find a header row with a date and description column")


def to_amount(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return 0.0
    s = str(x).replace(",", "").replace("₹", "").replace("INR", "").strip()
    if s in ("", "-", "nan", "None"):
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    m = re.search(r"-?\d+(\.\d+)?", s)
    if not m:
        return 0.0
    v = float(m.group())
    return -abs(v) if neg else v


def pick(cols, *needles, exclude=()):
    for c in cols:
        n = norm(c)
        if any(k in n for k in needles) and not any(e in n for e in exclude):
            return c
    return None


def parse_statement(path):
    raw = load_raw(path)
    h = find_header(raw)
    df = raw.iloc[h + 1:].copy()
    df.columns = [str(c).strip() for c in raw.iloc[h].tolist()]
    df = df.loc[:, [c for c in df.columns if c and c.lower() != "nan"]]
    cols = list(df.columns)

    date_c = pick(cols, "txn date", "transaction date", "tran date") or pick(cols, "date", exclude=("value",)) or pick(cols, "date")
    desc_c = pick(cols, *DESC_HINTS)
    debit_c = pick(cols, "withdrawal", "debit", "dr amount", "paid out", exclude=("credit",))
    credit_c = pick(cols, "deposit", "credit", "cr amount", "paid in", exclude=("debit",))
    amt_c = pick(cols, "amount", exclude=("withdrawal", "deposit", "debit", "credit", "balance"))
    type_c = pick(cols, "dr/cr", "cr/dr", "type", "dr / cr")

    out = []
    for _, r in df.iterrows():
        d = pd.to_datetime(str(r[date_c]).strip(), dayfirst=True, errors="coerce")
        if pd.isna(d):
            continue  # footer lines, totals, blank rows
        desc = str(r[desc_c]).strip()
        if debit_c or credit_c:
            amt = to_amount(r[credit_c]) if credit_c else 0.0
            amt -= abs(to_amount(r[debit_c])) if debit_c else 0.0
        elif amt_c:
            amt = to_amount(r[amt_c])
            if type_c:
                t = norm(r[type_c])
                amt = -abs(amt) if t.startswith("d") else abs(amt)
            elif re.search(r"\bdr\b", norm(r[amt_c])):
                amt = -abs(amt)
        else:
            raise ValueError(f"{path}: no amount columns among {cols}")
        if amt == 0:
            continue
        out.append({"date": d.date().isoformat(), "account": Path(path).stem, "description": desc, "amount": round(amt, 2)})
    return out


def merchant_of(desc):
    """Best-effort merchant name from UPI / NEFT / POS narrations."""
    d = desc.strip()
    m = re.match(r"(?i)upi[-/](?:dr[-/]|cr[-/])?(?:\d+[-/])?([^-/@]+)", d)
    if m:
        return m.group(1).strip().title()
    m = re.match(r"(?i)(?:pos|ecom|neft|imps|rtgs|ach|nach)[\s\-/:]+(?:\w*\d\w*[\s\-/:]+)?([A-Za-z][^-/]{2,})", d)
    if m:
        return m.group(1).strip().title()[:40]
    return re.sub(r"[\d\W_]+", " ", d).strip().title()[:40] or d[:40]


def keyword_pattern(k):
    """Keywords must start at a word edge ("lic" must not hit "public"); short
    ones must also end at one ("emi" must not hit "premium")."""
    if any(ch in k for ch in "*[]"):
        return k
    edge_end = r"(?![a-z])" if len(k.strip()) <= 4 else ""
    return r"(?<![a-z])" + re.escape(k.strip()) + edge_end


def categorise(desc, amount, rules):
    text = " " + norm(desc) + " "
    for cat, group, kws in rules:
        for k in kws:
            if re.search(keyword_pattern(k), text):
                # an incoming credit can't be "Rent" spend etc.; keep income-ish categories for credits
                if amount > 0 and group not in ("Income", "Transfer") and cat not in ("Refund / Cashback",):
                    if group == "Savings":
                        return "Investment Redemption", "Income"
                    continue
                if amount < 0 and group == "Income" and cat != "Refund / Cashback":
                    continue
                return cat, group
    if amount > 0:
        if re.search(r"(?i)self|own a/c|transfer from", desc):
            return "Own-account Transfer", "Transfer"
        return "Other Income", "Income"
    if re.search(r"(?i)self|own a/c|transfer to", desc):
        return "Own-account Transfer", "Transfer"
    return "Uncategorised", "Wants"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--rules", help="JSON {category: [keywords]} checked before built-in rules")
    a = ap.parse_args()

    rules = list(RULES)
    if a.rules:
        extra = json.load(open(a.rules))
        rules = [(c, GROUP_OF.get(c, "Needs"), [k.lower() for k in kws]) for c, kws in extra.items()] + rules

    txns = []
    for f in a.files:
        try:
            txns += parse_statement(f)
        except Exception as e:  # keep going with the other files
            print(f"WARNING: {f}: {e}", file=sys.stderr)
    if not txns:
        sys.exit("no transactions read")

    for t in txns:
        t["merchant"] = merchant_of(t["description"])
        t["category"], t["group"] = categorise(t["description"], t["amount"], rules)
    txns.sort(key=lambda t: t["date"])

    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(txns, columns=["date", "account", "description", "merchant", "amount", "category", "group"]) \
        .to_csv(out / "transactions.csv", index=False)

    months = sorted({t["date"][:7] for t in txns})
    by_month = defaultdict(lambda: defaultdict(float))
    for t in txns:
        by_month[t["date"][:7]][t["category"]] += t["amount"]

    def total(group_pred, sign):
        return sum(t["amount"] for t in txns if group_pred(t["group"]) and (t["amount"] > 0) == (sign > 0))

    income = total(lambda g: g == "Income", +1) + total(lambda g: g == "Income", -1)
    spend = -sum(t["amount"] for t in txns if t["group"] in ("Needs", "Wants", "Debt"))
    invested = -sum(t["amount"] for t in txns if t["group"] == "Savings")
    # Average over the months one account covers, not the union: a Jun-Aug card
    # statement next to a Jul-Sep bank statement is still three months of life.
    per_acct = defaultdict(set)
    for t in txns:
        per_acct[t["account"]].add(t["date"][:7])
    n = max(max(len(v) for v in per_acct.values()), 1)
    period_warning = None
    if len({frozenset(v) for v in per_acct.values()}) > 1:
        period_warning = ("Statements cover different months: " +
                          "; ".join(f"{a}: {min(v)} to {max(v)}" for a, v in per_acct.items()) +
                          f". Monthly averages divide by {n} months.")

    cat_tot = defaultdict(float)
    for t in txns:
        if t["group"] not in ("Income", "Transfer"):
            cat_tot[(t["category"], t["group"])] += -t["amount"]

    merch = Counter()
    for t in txns:
        if t["amount"] < 0 and t["group"] not in ("Transfer", "Savings", "Debt"):
            merch[t["merchant"]] += -t["amount"]

    # same merchant, similar amount, seen in 2+ distinct months -> recurring
    seen = defaultdict(set)
    amts = defaultdict(list)
    for t in txns:
        if t["amount"] < 0:
            seen[t["merchant"]].add(t["date"][:7])
            amts[t["merchant"]].append(-t["amount"])
    recurring = []
    for m_, ms in seen.items():
        a_ = amts[m_]
        if len(ms) >= 2 and max(a_) <= 1.25 * min(a_):
            recurring.append({"merchant": m_, "months_seen": len(ms), "typical_amount": round(sum(a_) / len(a_))})
    recurring.sort(key=lambda r: -r["typical_amount"])

    summary = {
        "period": {"from": txns[0]["date"], "to": txns[-1]["date"], "months": n, "warning": period_warning},
        "transactions": len(txns),
        "monthly_average": {
            "income": round(income / n),
            "spending_excl_investments": round(spend / n),
            "invested": round(invested / n),
            "net_cashflow": round((income - spend - invested) / n),
            "savings_rate_pct": round(100 * (income - spend) / income, 1) if income > 0 else None,
        },
        "by_group_monthly": {g: round(-sum(t["amount"] for t in txns if t["group"] == g) / n)
                             for g in ("Needs", "Wants", "Debt", "Savings")},
        "by_category_monthly": [{"category": c, "group": g, "avg_per_month": round(v / n)}
                                for (c, g), v in sorted(cat_tot.items(), key=lambda kv: -kv[1])],
        "by_month": {m_: {k: round(v) for k, v in sorted(by_month[m_].items())} for m_ in months},
        "top_merchants": [{"merchant": k, "total": round(v)} for k, v in merch.most_common(15)],
        "recurring_payments": recurring[:20],
        "uncategorised": [t for t in txns if t["category"] == "Uncategorised"][:50],
        "notes": [
            "Credit-card bill payments and own-account transfers are excluded from spending to avoid double counting; "
            "if a card statement is NOT included, the card bill hides real spending - ask for it.",
            "Refunds and cashback are counted as income.",
        ],
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in ("period", "transactions", "monthly_average", "by_group_monthly")}, indent=2))
    print(f"uncategorised: {len([t for t in txns if t['category'] == 'Uncategorised'])} -> review in summary.json")


if __name__ == "__main__":
    main()
