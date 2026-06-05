"use client";

// Phase 392 — Financial Audit Report (dev-only).
//
// Renders the buildFinancialAudit output as 4 collapsible
// containers + parity row + cross-container deltas. Every tx ID is
// printed so the user can verify exactly which transaction is in /
// out of each container.

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildFinancialAudit,
  type AuditContainer,
  type AuditDelta,
} from "@/lib/financial-audit";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function FinancialAuditReport() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const audit = useMemo(() => {
    if (!hydrated) return null;
    return buildFinancialAudit({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  if (!audit) return null;

  const parityOk = Math.abs(audit.parity.delta) <= 1;
  const containers = [
    audit.containers.monthlyCommitments,
    audit.containers.creditCards,
    audit.containers.whereMoneyGoes,
    audit.containers.timeForecast35d,
  ];

  return (
    <details
      className="mx-auto mt-3 w-full max-w-md rounded-2xl border text-amber-200/90"
      dir="rtl"
      style={{
        borderColor: parityOk
          ? "rgba(245,158,11,0.35)"
          : "rgba(248,113,113,0.65)",
        background: parityOk
          ? "rgba(245,158,11,0.05)"
          : "rgba(248,113,113,0.07)",
      }}
    >
      <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-[0.22em]">
        Financial Audit · {audit.monthKey}
        {parityOk ? " · OK" : " · MISMATCH"}
      </summary>

      <div className="border-b border-white/8 px-3 py-2 text-[10.5px]">
        <ParityRow label="Cockpit credit" value={audit.parity.cockpitCredit} />
        <ParityRow
          label="Curve credit (35d)"
          value={audit.parity.curveCredit}
        />
        <ParityRow label="Pending (cockpit only)" value={audit.parity.pending} />
        <ParityRow
          label="Expected curve = cockpit − pending"
          value={audit.parity.expected}
        />
        <ParityRow
          label="Δ"
          value={audit.parity.delta}
          tone={parityOk ? undefined : "#FCA5A5"}
        />
      </div>

      {containers.map((c) => (
        <ContainerBlock key={c.name} container={c} />
      ))}

      {audit.deltas.length > 0 ? (
        <details className="border-t border-white/8 px-3 py-2">
          <summary className="cursor-pointer text-[11px]">
            Cross-container deltas ({audit.deltas.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1 text-[10.5px]">
            {audit.deltas.map((d) => (
              <DeltaRow key={d.refId} delta={d} />
            ))}
          </ul>
        </details>
      ) : null}
    </details>
  );
}

function ContainerBlock({ container }: { container: AuditContainer }) {
  return (
    <details className="border-t border-white/8 px-3 py-2">
      <summary className="cursor-pointer text-[11.5px] font-medium">
        {container.displayName} · {ILS.format(container.total)} ·{" "}
        {container.includedCount} פריטים
      </summary>
      <div className="mt-1 text-[10.5px] opacity-85">
        <div>
          <span className="opacity-70">Source:</span> {container.source}
        </div>
        <div>
          <span className="opacity-70">Data:</span>{" "}
          {container.dataSources.join(", ")}
        </div>
        <div>
          <span className="opacity-70">Window:</span> {container.window}
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[10.5px] opacity-80">
          Included ({container.included.length})
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[10px]">
          {container.included.slice(0, 80).map((row) => (
            <li key={row.refId} className="flex items-center justify-between gap-2">
              <span className="truncate opacity-85">{row.refId}</span>
              <span dir="ltr" className="shrink-0 opacity-70">
                {row.label}
              </span>
              <span dir="ltr" className="shrink-0 tabular-nums">
                {ILS.format(row.amount)}
              </span>
            </li>
          ))}
          {container.included.length > 80 ? (
            <li className="opacity-60">
              … +{container.included.length - 80} more
            </li>
          ) : null}
        </ul>
      </details>

      {container.excluded.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10.5px] opacity-80">
            Excluded ({container.excluded.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[10px]">
            {container.excluded.slice(0, 80).map((row, idx) => (
              <li
                key={`${row.refId}-${idx}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate opacity-85">{row.refId}</span>
                <span dir="ltr" className="shrink-0 opacity-70">
                  {row.label}
                </span>
                <span
                  className="shrink-0 rounded-full bg-white/5 px-1 py-0.5 text-[9px] opacity-80"
                  style={{ color: "#FCA5A5" }}
                >
                  {row.reason}
                </span>
              </li>
            ))}
            {container.excluded.length > 80 ? (
              <li className="opacity-60">
                … +{container.excluded.length - 80} more
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </details>
  );
}

function DeltaRow({ delta }: { delta: AuditDelta }) {
  const flag = (b: boolean) => (b ? "✓" : "—");
  return (
    <li className="flex items-center justify-between gap-2 font-mono">
      <span className="truncate opacity-85">{delta.refId}</span>
      <span dir="ltr" className="shrink-0 opacity-70">
        {delta.label}
      </span>
      <span className="shrink-0 tabular-nums opacity-90">
        MC {flag(delta.inMonthlyCommitments)} · CC{" "}
        {flag(delta.inCreditCards)} · WMG {flag(delta.inWhereMoneyGoes)} · TF{" "}
        {flag(delta.inTimeForecast)}
      </span>
    </li>
  );
}

function ParityRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="opacity-85">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="font-medium tabular-nums"
        style={{ color: tone }}
      >
        {ILS.format(value)}
      </span>
    </div>
  );
}
