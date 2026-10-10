(() => {
  "use strict";

  // 极简 ZIP 写入器：只做 STORE（不压缩），用于把多个规则文件打包成一个下载。
  // 不依赖任何第三方库，生成的是标准 ZIP，可直接用系统解压工具打开。

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time: time & 0xFFFF, date: day & 0xFFFF };
  }

  // entries: [{ name: "v2ex.json", content: "..." | Uint8Array }]
  function create(entries) {
    const encoder = new TextEncoder();
    const stamp = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const data = typeof entry.content === "string"
        ? encoder.encode(entry.content)
        : entry.content;
      const checksum = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);          // version needed
      localView.setUint16(6, 0x0800, true);      // UTF-8 文件名
      localView.setUint16(8, 0, true);           // STORE
      localView.setUint16(10, stamp.time, true);
      localView.setUint16(12, stamp.date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const directory = new Uint8Array(46 + nameBytes.length);
      const directoryView = new DataView(directory.buffer);
      directoryView.setUint32(0, 0x02014b50, true);
      directoryView.setUint16(4, 20, true);      // version made by
      directoryView.setUint16(6, 20, true);      // version needed
      directoryView.setUint16(8, 0x0800, true);
      directoryView.setUint16(10, 0, true);
      directoryView.setUint16(12, stamp.time, true);
      directoryView.setUint16(14, stamp.date, true);
      directoryView.setUint32(16, checksum, true);
      directoryView.setUint32(20, data.length, true);
      directoryView.setUint32(24, data.length, true);
      directoryView.setUint16(28, nameBytes.length, true);
      directoryView.setUint16(30, 0, true);      // extra
      directoryView.setUint16(32, 0, true);      // comment
      directoryView.setUint16(34, 0, true);      // disk
      directoryView.setUint16(36, 0, true);      // internal attrs
      directoryView.setUint32(38, 0, true);      // external attrs
      directoryView.setUint32(42, offset, true); // local header offset
      directory.set(nameBytes, 46);
      central.push(directory);

      offset += local.length + data.length;
    }

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  globalThis.ZipWriter = Object.freeze({ create });
})();
