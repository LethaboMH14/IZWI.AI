#!/usr/bin/env python3
"""Compute-only lower-bound scenario, NOT a profit forecast."""
import argparse
from decimal import Decimal, ROUND_CEILING
import json

PLANS = {'creator': (149, 25), 'studio': (499, 110), 'agency': (1499, 390)}
FIXED = {'founder_engineering': 50000, 'design_qa_content': 12000,
         'support_community': 6000, 'baseline_infrastructure': 5000,
         'marketing': 8000, 'legal_admin_security': 4000}


def count(value):
    n = int(value)
    if n < 0:
        raise argparse.ArgumentTypeError('subscriber counts must be nonnegative')
    return n


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in PLANS:
        parser.add_argument('--' + name, type=count, default=55 if name == 'creator' else 0)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    revenue = sum(getattr(args, n) * p for n, (p, _) in PLANS.items())
    compute = sum(getattr(args, n) * c for n, (_, c) in PLANS.items())
    fixed = sum(FIXED.values())
    lower_bound = int((Decimal(fixed) / Decimal(149 - 25)).to_integral_value(rounding=ROUND_CEILING))
    result = {'currency': 'ZAR', 'monthly_revenue': revenue,
              'hosted_compute_budget': compute, 'revenue_less_compute_only': revenue - compute,
              'fixed_monthly_budget': fixed,
              'remainder_after_compute_and_fixed_only': revenue - compute - fixed,
              'creator_only_break_even_ignoring_other_variable_costs': lower_bound,
              'warning': 'Not profit: excludes storage/transfer/rendering, processing/refunds, incremental support, taxes and free-tier usage. Budgets and prices are proposed, not measured.'}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for k, v in result.items():
            print(f'{k}: {v}')


if __name__ == '__main__':
    main()
