// Native abstraction facade.
//
// One import path for the rest of the app:
//   import { detectPlatform, onLifecycle, ... } from "@/lib/native";
//
// Internal split (platform / lifecycle / haptics / secure-storage /
// push) lets each surface evolve independently.

export {
  detectPlatform,
  isNative,
  isIOS,
  isAndroid,
  type PulsePlatform,
} from "./platform";
export {
  onLifecycle,
  type LifecycleEvent,
  type LifecycleListener,
} from "./lifecycle";
export { tap as nativeTap, soft as nativeSoft, success as nativeSuccess } from "./haptics";
export { getSecure, setSecure, removeSecure } from "./secure-storage";
export {
  registerNativePush,
  nativePlatformLabel,
  readLastNativeRegistration,
  type NativePushRegistration,
  type LastNativeRegistration,
} from "./push";
export {
  validateNativePushTokenInput,
  buildNativePushTokenRecord,
  type NativePushToken,
  type NativePushTokenInput,
  type NativePlatform,
} from "./push-token";
