/**
 * Test helper: the same GLB without its embedded textures. Node has no image decoding (three.js needs browser image APIs for
 * `textures`), and these tests are about geometry, skeleton, clips and vertex colours.
 */
export function withoutTextures(buf: Buffer): ArrayBuffer {
  const jsonLength = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as Record<string, unknown> & {
    materials?: { pbrMetallicRoughness?: Record<string, unknown> }[];
  };
  delete doc.images;
  delete doc.textures;
  delete doc.samplers;
  for (const m of doc.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
  let json = Buffer.from(JSON.stringify(doc), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const bin = buf.subarray(20 + jsonLength);
  const out = Buffer.alloc(12 + 8 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  bin.copy(out, 20 + json.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
