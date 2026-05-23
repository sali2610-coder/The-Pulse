// Apple Wallet (PKPass) + Google Wallet (Generic Object) contracts.
//
// FOUNDATION ONLY. Nothing in this module generates a signed pkpass
// (Apple requires an Apple Developer cert + WWDR cert + signing
// pipeline) and nothing here hits the Google Wallet API (requires a
// service account + issuer ID). These types define the shape the
// downstream signer/server will produce so the rest of the app can
// reason about pass payloads today and the wiring stays additive.
//
// References (versions pinned at time of writing):
//   * Apple PassKit Web Service Reference (PassKit, v2)
//     https://developer.apple.com/documentation/walletpasses
//   * Google Wallet Generic class
//     https://developers.google.com/wallet/generic/resources/generic-object
//
// The Pulse-specific pass type is a "monthly snapshot" — a single pass
// that surfaces the user's current monthly budget burn + projected EOM
// so they can glance at it from the lock screen without opening the
// PWA. Future pass types (per-card pressure, daily allowance) reuse
// the same envelope.

export type WalletPassKind = "monthly_snapshot";

export type WalletPassSnapshotData = {
  monthKey: string; // "YYYY-MM"
  /** Sum of actuals this month, in ILS, rounded to int. */
  actualILS: number;
  /** actuals + upcoming, rounded to int. */
  projectedILS: number;
  /** User-configured budget, rounded to int. 0 when unset. */
  budgetILS: number;
  /** Forecast EOM bank-position (anchors + income - obligations). Int. */
  forecastEomILS: number;
  /** Build timestamp; used as pass updateDate. */
  generatedAt: string;
};

export type ApplePassPayload = {
  formatVersion: 1;
  passTypeIdentifier: string; // e.g. "pass.com.thepulse.snapshot"
  serialNumber: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  backgroundColor: string; // "rgb(10,10,10)"
  foregroundColor: string;
  labelColor: string;
  generic: {
    primaryFields: ApplePassField[];
    secondaryFields: ApplePassField[];
    auxiliaryFields: ApplePassField[];
    backFields: ApplePassField[];
  };
  /** Used as the pass's updateDate so iOS shows "Updated · ..." on the
   *  lock screen. */
  relevantDate?: string;
};

export type ApplePassField = {
  key: string;
  label: string;
  value: string | number;
  textAlignment?: "PKTextAlignmentLeft" | "PKTextAlignmentCenter" | "PKTextAlignmentRight" | "PKTextAlignmentNatural";
  currencyCode?: "ILS" | "USD" | "EUR" | "GBP";
};

export type GoogleWalletPassPayload = {
  id: string; // "<issuerId>.<serial>"
  classId: string; // "<issuerId>.thepulse_monthly_snapshot"
  state: "ACTIVE" | "EXPIRED";
  cardTitle: { defaultValue: { language: "he-IL"; value: string } };
  header: { defaultValue: { language: "he-IL"; value: string } };
  subheader?: { defaultValue: { language: "he-IL"; value: string } };
  textModulesData: Array<{
    id: string;
    header: string;
    body: string;
  }>;
  /** Set so Google shows "תקף עד" on the pass front. */
  validTimeInterval?: {
    start: { date: string };
    end: { date: string };
  };
};

export type WalletPassEnvelope = {
  kind: WalletPassKind;
  snapshot: WalletPassSnapshotData;
  apple: ApplePassPayload;
  google: GoogleWalletPassPayload;
};
