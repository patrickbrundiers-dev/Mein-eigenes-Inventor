// Welche Fehler des Geometrie-Kerns einen Neustart brauchen (SY5): Absturz in WebAssembly, Speicher voll oder
// Stapelüberlauf mitten in OpenCascade – danach kann der Kern in einem halben Zustand sein. Gewöhnliche Fehler
// (falsche Eingabe, Boolesche Operation fehlgeschlagen) nicht: ein Neustart verwirft alle Zwischenspeicher.
export function isFatal(e) {
  if (typeof WebAssembly !== "undefined" && e instanceof WebAssembly.RuntimeError) return true;
  const msg = String(e?.message ?? e ?? "");
  if (e instanceof RangeError) return /call stack|allocation failed|out of memory/i.test(msg);
  return /\bout of memory\b|\bOOM\b|^Aborted\(/i.test(msg);
}
