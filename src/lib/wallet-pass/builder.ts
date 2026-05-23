// Pure builders that produce Apple + Google wallet pass JSON payloads
// from a Pulse monthly snapshot.
//
// These payloads are NOT signed — Apple requires offline signing with
// the Pass Type ID cert + WWDR cert + manifest hashing; Google requires
// a service-account-signed JWT and a created class. Neither pipeline
// ships in this repo. The builders exist so:
//   1. The shape can be unit-tested today.
//   2. A future server route (`/api/wallet/pass`) can wrap the signer
//      around this builder without re-deriving the field layout.
//   3. The dashboard can preview a pass-like card without round-tripping
//      to any external service.

import type {
  ApplePassPayload,
  GoogleWalletPassPayload,
  WalletPassEnvelope,
  WalletPassSnapshotData,
} from "./types";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export type WalletBuilderConfig = {
  /** Apple Wallet — Pass Type ID registered in the Apple Developer portal. */
  applePassTypeIdentifier: string;
  /** Apple Wallet — 10-char Team Identifier. */
  appleTeamIdentifier: string;
  /** Google Wallet — issuer ID assigned by Google. */
  googleIssuerId: string;
  organizationName: string;
};

export const DEFAULT_BUILDER_CONFIG: WalletBuilderConfig = {
  applePassTypeIdentifier: "pass.com.thepulse.snapshot",
  appleTeamIdentifier: "PULSE000000",
  googleIssuerId: "3388000000000000000",
  organizationName: "The Pulse",
};

export function buildWalletPassEnvelope(args: {
  snapshot: WalletPassSnapshotData;
  config?: Partial<WalletBuilderConfig>;
}): WalletPassEnvelope {
  const cfg: WalletBuilderConfig = { ...DEFAULT_BUILDER_CONFIG, ...args.config };
  const serial = serialFor(args.snapshot);
  return {
    kind: "monthly_snapshot",
    snapshot: args.snapshot,
    apple: buildApplePass(args.snapshot, cfg, serial),
    google: buildGooglePass(args.snapshot, cfg, serial),
  };
}

function serialFor(snap: WalletPassSnapshotData): string {
  return `${snap.monthKey}-${snap.generatedAt.slice(0, 10)}`;
}

function buildApplePass(
  snap: WalletPassSnapshotData,
  cfg: WalletBuilderConfig,
  serial: string,
): ApplePassPayload {
  const burnRatio =
    snap.budgetILS > 0 ? Math.round((snap.projectedILS / snap.budgetILS) * 100) : 0;
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.applePassTypeIdentifier,
    serialNumber: serial,
    teamIdentifier: cfg.appleTeamIdentifier,
    organizationName: cfg.organizationName,
    description: "תמונת המצב החודשית של The Pulse",
    backgroundColor: "rgb(10,10,10)",
    foregroundColor: "rgb(255,255,255)",
    labelColor: "rgb(0,229,255)",
    generic: {
      primaryFields: [
        {
          key: "actual",
          label: "הוצאות בפועל",
          value: ILS.format(snap.actualILS),
          textAlignment: "PKTextAlignmentRight",
        },
      ],
      secondaryFields: [
        {
          key: "projected",
          label: "צפוי לסוף חודש",
          value: ILS.format(snap.projectedILS),
        },
        {
          key: "budget",
          label: "תקציב",
          value: snap.budgetILS > 0 ? ILS.format(snap.budgetILS) : "—",
        },
      ],
      auxiliaryFields: [
        {
          key: "burn",
          label: "ניצול",
          value: snap.budgetILS > 0 ? `${burnRatio}%` : "—",
        },
        {
          key: "eom",
          label: "מצב חזוי בסוף חודש",
          value: ILS.format(snap.forecastEomILS),
        },
      ],
      backFields: [
        {
          key: "month",
          label: "חודש",
          value: snap.monthKey,
        },
        {
          key: "generated",
          label: "עדכון אחרון",
          value: snap.generatedAt,
        },
      ],
    },
    relevantDate: snap.generatedAt,
  };
}

function buildGooglePass(
  snap: WalletPassSnapshotData,
  cfg: WalletBuilderConfig,
  serial: string,
): GoogleWalletPassPayload {
  const burnRatio =
    snap.budgetILS > 0 ? Math.round((snap.projectedILS / snap.budgetILS) * 100) : 0;
  return {
    id: `${cfg.googleIssuerId}.${serial}`,
    classId: `${cfg.googleIssuerId}.thepulse_monthly_snapshot`,
    state: "ACTIVE",
    cardTitle: {
      defaultValue: { language: "he-IL", value: "The Pulse" },
    },
    header: {
      defaultValue: { language: "he-IL", value: `הוצאות בפועל · ${ILS.format(snap.actualILS)}` },
    },
    subheader: {
      defaultValue: {
        language: "he-IL",
        value: snap.budgetILS > 0
          ? `${burnRatio}% מהתקציב — צפוי ${ILS.format(snap.projectedILS)}`
          : `צפוי לסוף חודש ${ILS.format(snap.projectedILS)}`,
      },
    },
    textModulesData: [
      {
        id: "eom",
        header: "מצב חזוי בסוף חודש",
        body: ILS.format(snap.forecastEomILS),
      },
      {
        id: "month",
        header: "חודש",
        body: snap.monthKey,
      },
    ],
    validTimeInterval: {
      start: { date: `${snap.monthKey}-01T00:00:00Z` },
      end: { date: `${snap.monthKey}-28T23:59:59Z` },
    },
  };
}
