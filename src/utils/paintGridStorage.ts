export function encodePaintGrid(a: Uint8Array): string {
  // simple RLE -> base64 (fast + tiny)
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let run = 1;
    while (i + run < a.length && a[i + run] === v && run < 255) run++;
    out.push(v, run);
    i += run;
  }
  const bin = new Uint8Array(out);
  let s = "";
  for (let j = 0; j < bin.length; j++) s += String.fromCharCode(bin[j]);
  return btoa(s);
}

export function decodePaintGrid(b64: string, length: number): Uint8Array {
  const binStr = atob(b64);
  const bin = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bin[i] = binStr.charCodeAt(i);

  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < bin.length; i += 2) {
    const v = bin[i];
    const run = bin[i + 1];
    out.fill(v, o, o + run);
    o += run;
    if (o >= length) break;
  }
  return out;
}