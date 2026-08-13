// Derives the served tooth model from the supplied source GLB.
//
//   public/models/white_mesh.original.glb  ->  public/models/tooth.glb
//
// The only mesh edit performed: the source contained a small disconnected
// artifact (a ~691-vertex sphere floating beside the crown). This keeps the
// single largest connected component (the tooth, ~9.3k verts) untouched and
// drops stray components, then recomputes smooth normals. Run: npm run clean:tooth
import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2] || "public/models/white_mesh.original.glb";
const OUT = process.argv[3] || "public/models/tooth.glb";

function readGlb(path) {
  const buf = readFileSync(path);
  let off = 12,
    json = null,
    bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin };
}

const { json: g, bin } = readGlb(IN);

let prim = null;
for (const m of g.meshes) for (const p of m.primitives) { prim = p; break; }
const posAcc = g.accessors[prim.attributes.POSITION];
const idxAcc = g.accessors[prim.indices];
const posBV = g.bufferViews[posAcc.bufferView];
const idxBV = g.bufferViews[idxAcc.bufferView];

const posStart = (posBV.byteOffset || 0) + (posAcc.byteOffset || 0);
const positions = new Float32Array(posAcc.count * 3);
for (let i = 0; i < posAcc.count * 3; i++)
  positions[i] = bin.readFloatLE(posStart + i * 4);

const idxStart = (idxBV.byteOffset || 0) + (idxAcc.byteOffset || 0);
const indices = new Uint32Array(idxAcc.count);
const ct = idxAcc.componentType;
for (let i = 0; i < idxAcc.count; i++) {
  if (ct === 5125) indices[i] = bin.readUInt32LE(idxStart + i * 4);
  else if (ct === 5123) indices[i] = bin.readUInt16LE(idxStart + i * 2);
  else indices[i] = bin.readUInt8(idxStart + i);
}

// union-find connected components over triangles
const V = posAcc.count;
const parent = new Int32Array(V);
for (let i = 0; i < V; i++) parent[i] = i;
const find = (x) => {
  while (parent[x] !== x) x = parent[x] = parent[parent[x]];
  return x;
};
const union = (x, y) => {
  const rx = find(x), ry = find(y);
  if (rx !== ry) parent[rx] = ry;
};
for (let t = 0; t < indices.length; t += 3) {
  union(indices[t], indices[t + 1]);
  union(indices[t + 1], indices[t + 2]);
}
const groups = new Map();
for (let i = 0; i < V; i++) {
  const r = find(i);
  (groups.get(r) ?? groups.set(r, []).get(r)).push(i);
}
const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
const keep = new Set(largest);

const remap = new Int32Array(V).fill(-1);
const P = [];
let nv = 0;
for (let i = 0; i < V; i++)
  if (keep.has(i)) {
    remap[i] = nv++;
    P.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }
const idx = [];
for (let t = 0; t < indices.length; t += 3) {
  const a = indices[t], b = indices[t + 1], c = indices[t + 2];
  if (keep.has(a) && keep.has(b) && keep.has(c))
    idx.push(remap[a], remap[b], remap[c]);
}

const pos = new Float32Array(P);
const nrm = new Float32Array(pos.length);
for (let t = 0; t < idx.length; t += 3) {
  const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
  const ax = pos[ia*3], ay = pos[ia*3+1], az = pos[ia*3+2];
  const bx = pos[ib*3], by = pos[ib*3+1], bz = pos[ib*3+2];
  const cx = pos[ic*3], cy = pos[ic*3+1], cz = pos[ic*3+2];
  const nx = (by-ay)*(cz-az)-(bz-az)*(cy-ay);
  const ny = (bz-az)*(cx-ax)-(bx-ax)*(cz-az);
  const nz = (bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  for (const k of [ia, ib, ic]) { nrm[k*3]+=nx; nrm[k*3+1]+=ny; nrm[k*3+2]+=nz; }
}
for (let i = 0; i < nrm.length; i += 3) {
  const l = Math.hypot(nrm[i], nrm[i+1], nrm[i+2]) || 1;
  nrm[i]/=l; nrm[i+1]/=l; nrm[i+2]/=l;
}

const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length / 3; i++)
  for (let k = 0; k < 3; k++) {
    mn[k] = Math.min(mn[k], pos[i*3+k]);
    mx[k] = Math.max(mx[k], pos[i*3+k]);
  }

const idxArr = new Uint32Array(idx);
const pad = (n) => (4 - (n % 4)) % 4;
const iB = idxArr.byteLength, pB = pos.byteLength, nB = nrm.byteLength;
const binLen = iB + pad(iB) + pB + pad(pB) + nB + pad(nB);
const outBin = Buffer.alloc(binLen);
let o = 0;
Buffer.from(idxArr.buffer, 0, iB).copy(outBin, o); o += iB + pad(iB);
const pOff = o; Buffer.from(pos.buffer, 0, pB).copy(outBin, o); o += pB + pad(pB);
const nOff = o; Buffer.from(nrm.buffer, 0, nB).copy(outBin, o);

const gltf = {
  asset: { version: "2.0", generator: "lumina-clean-tooth" },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "Tooth" }],
  materials: [{ name: "Enamel", pbrMetallicRoughness: { baseColorFactor: [0.93, 0.88, 0.78, 1], metallicFactor: 0, roughnessFactor: 0.4 } }],
  meshes: [{ name: "Tooth", primitives: [{ attributes: { POSITION: 1, NORMAL: 2 }, indices: 0, material: 0, mode: 4 }] }],
  buffers: [{ byteLength: binLen }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: iB, target: 34963 },
    { buffer: 0, byteOffset: pOff, byteLength: pB, target: 34962 },
    { buffer: 0, byteOffset: nOff, byteLength: nB, target: 34962 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5125, count: idxArr.length, type: "SCALAR" },
    { bufferView: 1, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx },
    { bufferView: 2, componentType: 5126, count: pos.length / 3, type: "VEC3" },
  ],
};
const jb = Buffer.from(JSON.stringify(gltf), "utf8");
const jbP = Buffer.concat([jb, Buffer.alloc(pad(jb.length), 0x20)]);
const bbP = Buffer.concat([outBin, Buffer.alloc(pad(outBin.length), 0)]);
const total = 12 + 8 + jbP.length + 8 + bbP.length;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jbP.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bbP.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(OUT, Buffer.concat([head, jh, jbP, bh, bbP]));
console.log(
  `Kept largest component: verts ${V}->${pos.length / 3}, tris ${indices.length / 3}->${idxArr.length / 3}. Wrote ${OUT}`,
);
