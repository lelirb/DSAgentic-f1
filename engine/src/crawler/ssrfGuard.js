import dns from "node:dns/promises";
import net from "node:net";

// SSRF protection. A server that fetches arbitrary user-supplied URLs is a
// classic SSRF vector — without this, someone could point the evaluator at
// http://localhost/internal-admin or http://169.254.169.254/latest/meta-data
// (the standard cloud-provider metadata endpoint) and use this server as a
// proxy into infrastructure it was never meant to reach.

const IPV4_PRIVATE_RANGES = [
  ["0.0.0.0", "0.255.255.255"],
  ["10.0.0.0", "10.255.255.255"],
  ["100.64.0.0", "100.127.255.255"], // CGNAT
  ["127.0.0.0", "127.255.255.255"], // loopback
  ["169.254.0.0", "169.254.255.255"], // link-local — includes cloud metadata IP
  ["172.16.0.0", "172.31.255.255"],
  ["192.0.0.0", "192.0.0.255"],
  ["192.168.0.0", "192.168.255.255"],
  ["198.18.0.0", "198.19.255.255"],
  ["224.0.0.0", "255.255.255.255"], // multicast/reserved
];

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  return IPV4_PRIVATE_RANGES.some(([start, end]) => n >= ipv4ToInt(start) && n <= ipv4ToInt(end));
}

// FIX: the previous version had an operator-precedence bug — the whole `a || b
// || ... ? x : y` chain was the ternary's CONDITION, so every IPv6 address was run
// through isPrivateIPv4() on garbage input. ::1 / fd00:: were blocked only by
// accident (parseInt -> NaN -> 0 -> "0.0.0.0/8"), the public ::ffff:8.8.8.8 was
// wrongly blocked, and ::127.0.0.1, 64:ff9b::<ipv4> (NAT64) and multicast passed.
// Note: Node's URL parser normalizes [::ffff:127.0.0.1] to [::ffff:7f00:1], so
// embedded IPv4 must be read from the last two hextets, not from dotted text.
function expandIPv6(ip) {
  let addr = ip.toLowerCase().split("%")[0]; // drop zone id
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) {
    const o = dotted[1].split(".").map(Number);
    addr = addr.slice(0, -dotted[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = addr.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? parts : null;
}

function isPrivateIPv6(ip) {
  const p = expandIPv6(ip);
  if (!p) return true; // unparseable -> refuse rather than guess
  const embeddedV4 = () => `${p[6] >> 8}.${p[6] & 255}.${p[7] >> 8}.${p[7] & 255}`;
  const firstSixZero = p.slice(0, 6).every((n) => n === 0);
  if (firstSixZero) return true; // ::, ::1, and deprecated IPv4-compatible ::a.b.c.d
  if (p.slice(0, 5).every((n) => n === 0) && p[5] === 0xffff) return isPrivateIPv4(embeddedV4()); // ::ffff:a.b.c.d
  if (p[0] === 0x64 && p[1] === 0xff9b && p.slice(2, 6).every((n) => n === 0)) return isPrivateIPv4(embeddedV4()); // NAT64
  if ((p[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((p[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((p[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * Throws if urlString's hostname is (or resolves to) a private, loopback,
 * link-local, or otherwise non-public address. Redirect hops and discovered
 * links are covered because fetcher.js / crawl.js call this for EVERY URL.
 * Known residual risk (documented, not silently claimed as solved): DNS
 * rebinding — the hostname can resolve to a public IP here and to a private
 * one when fetch() resolves it again. Closing it requires connecting to the
 * already-validated IP.
 */
export async function assertPublicHost(urlString, { dnsLookup = dns.lookup } = {}) {
  const url = new URL(urlString);
  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets, e.g. "[::1]" -> "::1"

  if (hostname === "localhost") {
    throw new Error("Blocked: localhost is not an allowed target");
  }

  const ipFamily = net.isIP(hostname);
  if (ipFamily) {
    if ((ipFamily === 4 && isPrivateIPv4(hostname)) || (ipFamily === 6 && isPrivateIPv6(hostname))) {
      throw new Error(`Blocked: ${hostname} is a private/internal address`);
    }
    return;
  }

  let addresses;
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  if (!addresses || addresses.length === 0) {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIPv4(address)) {
      throw new Error(`Blocked: ${hostname} resolves to a private address (${address})`);
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new Error(`Blocked: ${hostname} resolves to a private address (${address})`);
    }
  }
}
