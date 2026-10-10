const test = require("node:test");
const assert = require("node:assert/strict");

require("../zip.js");

// 只支持 STORE（不压缩）的极简读取，用来验证写入结果。
function readZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder();

  let endOfCentralDirectory = -1;
  for (let offset = arrayBuffer.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  assert.notEqual(endOfCentralDirectory, -1, "没有找到 ZIP 中央目录结束记录");

  const count = view.getUint16(endOfCentralDirectory + 10, true);
  let pointer = view.getUint32(endOfCentralDirectory + 16, true);
  const files = [];

  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(new Uint8Array(arrayBuffer, pointer + 46, nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const size = view.getUint32(localOffset + 22, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const content = decoder.decode(new Uint8Array(arrayBuffer, dataStart, size));

    files.push({ name, content });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

test("ZIP 打包能还原文件名和内容", async () => {
  const entries = [
    { name: "v2ex.json", content: "{\n  \"title\": \"V2EX\"\n}\n" },
    { name: "中文站点.json", content: "{\"hello\":\"世界\"}\n" }
  ];

  const files = readZip(await ZipWriter.create(entries).arrayBuffer());

  assert.deepEqual(files.map((file) => file.name), ["v2ex.json", "中文站点.json"]);
  for (let index = 0; index < entries.length; index += 1) {
    assert.equal(files[index].content, entries[index].content);
  }
});

test("ZIP 的 CRC32 使用标准算法", async () => {
  // "123456789" 的 CRC32 标准检查值是 0xCBF43926。
  const arrayBuffer = await ZipWriter.create([{ name: "a", content: "123456789" }]).arrayBuffer();
  const view = new DataView(arrayBuffer);
  assert.equal(view.getUint32(14, true), 0xCBF43926);
});

test("空条目列表也能生成合法的 ZIP", async () => {
  const files = readZip(await ZipWriter.create([]).arrayBuffer());
  assert.deepEqual(files, []);
});
