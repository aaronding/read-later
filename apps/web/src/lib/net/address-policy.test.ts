import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "./address-policy";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
  ])("blocks IPv4 %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "::1",
    "::",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:7f00:1", // the same, in hex
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
    "2002:7f00:1::", // 6to4 of 127.0.0.1
    "::127.0.0.1", // IPv4-compatible
    "::ffff:0:7f00:1", // IPv4-translated loopback
    "::ffff:0:a9fe:a9fe", // IPv4-translated metadata
  ])("blocks IPv6 %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["93.184.215.14", "1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2002:0808:0808::"])(
    "allows public address %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it("blocks anything that is not an IP address", () => {
    expect(isBlockedAddress("localhost")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("1:2:3")).toBe(true);
  });
});
