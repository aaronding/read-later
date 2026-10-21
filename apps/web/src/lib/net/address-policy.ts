import { BlockList, isIP } from "node:net";

// Addresses a server-side download must never reach: private networks,
// loopback, link-local (including cloud metadata at 169.254.169.254) and
// other special-purpose ranges. Protects against server-side request forgery.

const IPV4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
];

const IPV6_BLOCKED: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments, including Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];

const blockList = new BlockList();
for (const [network, prefix] of IPV4_BLOCKED) blockList.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of IPV6_BLOCKED) blockList.addSubnet(network, prefix, "ipv6");

/** Expands an IPv6 address into eight 16-bit groups. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  // A trailing dotted IPv4 part (::ffff:1.2.3.4) becomes two groups.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) =>
    Number.parseInt(g, 16),
  );
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function ipv4FromGroups(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * IPv4 addresses carried inside IPv6 ones. A blocked IPv4 address must stay
 * blocked when written as ::ffff:127.0.0.1, through NAT64 or through 6to4.
 */
function embeddedIpv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  // IPv4-mapped ::ffff:a.b.c.d
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return ipv4FromGroups(g6, g7);
  // NAT64 64:ff9b::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return ipv4FromGroups(g6, g7);
  // 6to4 2002:aabb:ccdd::
  if (g0 === 0x2002) return ipv4FromGroups(g1, g2);
  return null;
}

/** True when a server-side download must not connect to this IP address. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockList.check(address, "ipv4");
  if (family !== 6) return true; // not an IP address at all
  const groups = ipv6Groups(address);
  if (!groups) return true;
  const v4 = embeddedIpv4(groups);
  if (v4 !== null) return blockList.check(v4, "ipv4");
  return blockList.check(address.split("%")[0]!, "ipv6");
}
