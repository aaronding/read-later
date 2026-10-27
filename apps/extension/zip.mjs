// A minimal zip writer, so the builds can be uploaded to the Chrome Web Store
// and addons.mozilla.org without zipping them by hand (Windows' "Compressed
// folder" puts the folder itself inside, where the stores want manifest.json at the root).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

function files(dir, prefix = "") {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = path.join(dir, entry);
      const name = prefix + entry;
      return statSync(full).isDirectory() ? files(full, `${name}/`) : [{ name, full }];
    });
}

/** The directory's files as a zip archive, with manifest.json at its root. */
export function zipDirectory(dir) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, full } of files(dir)) {
    const data = readFileSync(full);
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    // Fixed timestamps (1980-01-01) keep the archive the same from build to build.
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // made by
    header.copy(entry, 6, 4, 30); // the same fields as the local header
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
