/* ------------------------------------------------------------------
   VOLTA-8 · pure-TS uncompressed ZIP file generator
   Used for bundling stems (8 separate studio WAV tracks) into a single
   standard zip file without external libraries.
------------------------------------------------------------------ */

// Precomputed standard CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const fileRecords: {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const size = entry.data.byteLength;
    const crc = crc32(entry.data);

    // Local file header (30 bytes + name length + data length)
    const localHeader = new Uint8Array(30);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true); // Local header signature
    dv.setUint16(4, 20, true); // Version needed to extract (2.0)
    dv.setUint16(6, 0, true); // General purpose bit flag
    dv.setUint16(8, 0, true); // Compression method (0 = stored)
    dv.setUint16(10, 0, true); // File last mod time
    dv.setUint16(12, 0, true); // File last mod date
    dv.setUint32(14, crc, true); // CRC-32
    dv.setUint32(18, size, true); // Compressed size
    dv.setUint32(22, size, true); // Uncompressed size
    dv.setUint16(26, nameBytes.length, true); // File name length
    dv.setUint16(28, 0, true); // Extra field length

    chunks.push(localHeader);
    chunks.push(nameBytes);
    chunks.push(entry.data);

    fileRecords.push({
      nameBytes,
      crc,
      size,
      offset,
    });

    offset += localHeader.byteLength + nameBytes.byteLength + size;
  }

  const cdOffset = offset;
  let cdSize = 0;

  // Central directory records
  for (const rec of fileRecords) {
    const cdHeader = new Uint8Array(46);
    const dv = new DataView(cdHeader.buffer);
    dv.setUint32(0, 0x02014b50, true); // Central directory signature
    dv.setUint16(4, 20, true); // Version made by
    dv.setUint16(6, 20, true); // Version needed to extract
    dv.setUint16(8, 0, true); // General purpose bit flag
    dv.setUint16(10, 0, true); // Compression method (0)
    dv.setUint16(12, 0, true); // Last mod time
    dv.setUint16(14, 0, true); // Last mod date
    dv.setUint32(16, rec.crc, true); // CRC-32
    dv.setUint32(20, rec.size, true); // Compressed size
    dv.setUint32(24, rec.size, true); // Uncompressed size
    dv.setUint16(28, rec.nameBytes.length, true); // File name length
    dv.setUint16(30, 0, true); // Extra field length
    dv.setUint16(32, 0, true); // File comment length
    dv.setUint16(34, 0, true); // Disk number start
    dv.setUint16(36, 0, true); // Internal file attributes
    dv.setUint32(38, 0, true); // External file attributes
    dv.setUint32(42, rec.offset, true); // Relative offset of local header

    chunks.push(cdHeader);
    chunks.push(rec.nameBytes);
    cdSize += cdHeader.byteLength + rec.nameBytes.byteLength;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true); // EOCD signature
  dv.setUint16(4, 0, true); // Disk number
  dv.setUint16(6, 0, true); // Disk number with central directory
  dv.setUint16(8, entries.length, true); // Total entries on this disk
  dv.setUint16(10, entries.length, true); // Total entries in central directory
  dv.setUint32(12, cdSize, true); // Size of central directory
  dv.setUint32(16, cdOffset, true); // Offset of central directory
  dv.setUint16(20, 0, true); // ZIP comment length

  chunks.push(eocd);

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}
