/**
 * Loader for public/morph-targets.bin.
 *
 * Binary layout (little-endian) — must match scripts/rnd/generate-morph-targets.mjs:
 *   0  uint32 magic   0x4D525048
 *   4  uint32 version 1
 *   8  uint32 count   particles per target
 *   12 uint32 targets number of targets (3)
 *   16 float32[count*3] * targets, xyz interleaved, targets contiguous
 */

const MAGIC = 0x4d525048;
const HEADER_BYTES = 16;

export interface MorphTargetData {
  count: number;
  /** One Float32Array (count*3, xyz interleaved) per target. */
  targets: Float32Array[];
}

export async function loadMorphTargets(url = '/morph-targets.bin'): Promise<MorphTargetData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`morph targets fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new DataView(buf);
  if (head.getUint32(0, true) !== MAGIC) throw new Error('morph targets: bad magic');
  if (head.getUint32(4, true) !== 1) throw new Error('morph targets: unsupported version');
  const count = head.getUint32(8, true);
  const numTargets = head.getUint32(12, true);
  if (numTargets !== 3) throw new Error(`morph targets: expected 3 targets, got ${numTargets}`);
  if (buf.byteLength < HEADER_BYTES + numTargets * count * 12) {
    throw new Error('morph targets: truncated file');
  }
  const targets: Float32Array[] = [];
  for (let t = 0; t < numTargets; t++) {
    targets.push(new Float32Array(buf, HEADER_BYTES + t * count * 12, count * 3));
  }
  return { count, targets };
}

/**
 * Stride-sample down to ~`desired` particles (used for the low tier).
 * Returns the input untouched if desired >= count.
 */
export function strideSample(data: MorphTargetData, desired: number): MorphTargetData {
  if (desired >= data.count) return data;
  const step = data.count / desired;
  const targets = data.targets.map((src) => {
    const out = new Float32Array(desired * 3);
    for (let i = 0; i < desired; i++) {
      const j = Math.floor(i * step) * 3;
      out[i * 3] = src[j] as number;
      out[i * 3 + 1] = src[j + 1] as number;
      out[i * 3 + 2] = src[j + 2] as number;
    }
    return out;
  });
  return { count: desired, targets };
}
