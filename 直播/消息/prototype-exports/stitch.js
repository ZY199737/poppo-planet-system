const fs = require('fs');
const zlib = require('zlib');

function readPNG(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8; // skip PNG signature
  let width, height, bitDepth, colorType;
  const idatChunks = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    offset += 12 + len; // length + type + data + crc

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  // Un-filter scanlines (4 bytes per pixel for RGBA, 3 for RGB)
  const bpp = colorType === 6 ? 4 : 3;
  const rowBytes = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (rowBytes + 1)];
    const scanline = raw.slice(y * (rowBytes + 1) + 1, y * (rowBytes + 1) + 1 + rowBytes);
    const prevRow = y > 0 ? pixels.slice((y - 1) * rowBytes, y * rowBytes) : Buffer.alloc(rowBytes);
    const outRow = pixels.slice(y * rowBytes, (y + 1) * rowBytes);

    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? outRow[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      let val = scanline[x];

      switch (filterType) {
        case 0: break;
        case 1: val = (val + a) & 0xFF; break;
        case 2: val = (val + b) & 0xFF; break;
        case 3: val = (val + Math.floor((a + b) / 2)) & 0xFF; break;
        case 4: val = (val + paeth(a, b, c)) & 0xFF; break;
      }
      outRow[x] = val;
    }
  }

  return { width, height, bpp, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function writePNG(filePath, width, height, bpp, pixels) {
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = bpp === 4 ? 6 : 2; // color type (RGBA or RGB)
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT - add filter byte (0=None) to each row
  const rowBytes = width * bpp;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter None
    pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  fs.writeFileSync(filePath, Buffer.concat(chunks));
}

function makeChunk(type, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  buf.writeUInt32BE(crc, 8 + data.length);
  return buf;
}

// CRC32 for PNG
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function stitchHorizontal(outputPath, imagePaths, gap) {
  const images = imagePaths.map(p => readPNG(p));
  const height = images[0].height;
  const bpp = images[0].bpp;
  const totalWidth = images.reduce((s, img) => s + img.width, 0) + gap * (images.length - 1);
  const pixels = Buffer.alloc(totalWidth * height * bpp, 255); // white background

  let xOffset = 0;
  for (const img of images) {
    for (let y = 0; y < height; y++) {
      const srcStart = y * img.width * bpp;
      const dstStart = y * totalWidth * bpp + xOffset * bpp;
      img.pixels.copy(pixels, dstStart, srcStart, srcStart + img.width * bpp);
    }
    xOffset += img.width + gap;
  }

  writePNG(outputPath, totalWidth, height, bpp, pixels);
  console.log(`Created: ${outputPath} (${totalWidth}x${height})`);
}

const dir = __dirname + '/composites/';
const gap = 80;

// FUNC-001: 7 screens
stitchHorizontal(dir + 'FUNC-001.png',
  ['l248qI','T7hBXR','SvIZO','Y6HVbC','N04RL','E1IBNU','P75YI'].map(f => dir + f + '.png'), gap);

// FUNC-002: 4 screens
stitchHorizontal(dir + 'FUNC-002.png',
  ['V9w7r','atpeB','XNh0J','O1NRT'].map(f => dir + f + '.png'), gap);

// FUNC-003: 3 screens
stitchHorizontal(dir + 'FUNC-003.png',
  ['fhF0X','ymNHs','dOBzQ'].map(f => dir + f + '.png'), gap);
