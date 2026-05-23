// Wallet-pass facade.
//
// Re-exports the pure builders + type contracts. No signing pipeline,
// no remote calls. See `builder.ts` for the rationale.

export {
  buildWalletPassEnvelope,
  DEFAULT_BUILDER_CONFIG,
  type WalletBuilderConfig,
} from "./builder";
export type {
  ApplePassField,
  ApplePassPayload,
  GoogleWalletPassPayload,
  WalletPassEnvelope,
  WalletPassKind,
  WalletPassSnapshotData,
} from "./types";
