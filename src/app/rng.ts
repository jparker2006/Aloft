// Seeded randomness. Every system draws from its own named stream derived from the run seed, so adding
// a random call in one system never shifts the numbers another system sees.
// Math.random() is not used anywhere in simulation or rendering code.

/** 32-bit integer hash (lowbias32 by Chris Wellons). */
export function hash32(x: number): number {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of several integers, order-sensitive. */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) h = hash32(h ^ hash32(v | 0));
  return h;
}

/** FNV-1a hash of a string, for turning stream names into seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform float in [0, 1) from a 32-bit hash. */
export function unitFloat(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Small fast PRNG (sfc32). Deterministic for a given seed. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = hash32(seed ^ 0xa3b1c2d3);
    this.b = hash32(seed ^ 0x1b873593);
    this.c = hash32(seed ^ 0xcc9e2d51);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  /** Standard normal sample (Box-Muller). */
  gaussian(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Creates named, independent streams from one run seed. */
export class RngStreams {
  constructor(readonly seed: number) {}

  stream(name: string): Rng {
    return new Rng(hashInts(this.seed, hashString(name)));
  }
}
