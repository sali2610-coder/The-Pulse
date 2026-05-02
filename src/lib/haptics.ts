export function tap(): void {
  if (typeof navigator === "undefined") return;
  navigator.vibrate?.(15);
}

export function success(): void {
  if (typeof navigator === "undefined") return;
  navigator.vibrate?.([20, 40, 30]);
}
