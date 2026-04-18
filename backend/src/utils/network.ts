import dns from 'dns/promises';
import net from 'net';
import { env } from '../config/env';

/**
 * Returns true if the given IPv4 or IPv6 address is private, loopback,
 * link-local, multicast, or otherwise not safely routable on the public
 * internet. These ranges must not be reachable from user-controlled Redis
 * connection configuration to prevent SSRF against cloud metadata services
 * (e.g. 169.254.169.254) and internal networks.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((n) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;

    // 0.0.0.0/8 current network
    if (a === 0) return true;
    // 10.0.0.0/8 private
    if (a === 10) return true;
    // 100.64.0.0/10 carrier-grade NAT
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 loopback
    if (a === 127) return true;
    // 169.254.0.0/16 link-local (cloud metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 private
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (test-net-1)
    if (a === 192 && b === 0) return true;
    // 192.168.0.0/16 private
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 benchmarking
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 test-net-2
    if (a === 198 && b === 51) return true;
    // 203.0.113.0/24 test-net-3
    if (a === 203 && b === 0) return true;
    // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
    if (a >= 224) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 loopback, :: unspecified
    if (normalized === '::1' || normalized === '::') return true;
    // IPv4-mapped (::ffff:a.b.c.d) — recurse on the embedded IPv4
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    // fc00::/7 unique local
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
    // ff00::/8 multicast
    if (normalized.startsWith('ff')) return true;
    return false;
  }

  // Unknown format — treat as unsafe.
  return true;
}

/**
 * Resolves a hostname and rejects it if any of the returned addresses are
 * private/reserved, unless the operator has explicitly opted in via
 * ALLOW_PRIVATE_REDIS_HOSTS. This prevents authenticated users from using
 * the server as an SSRF proxy into the internal network.
 *
 * Throws an Error with a user-safe message when the host is refused.
 */
export async function assertSafeRedisHost(host: string): Promise<void> {
  if (env.ALLOW_PRIVATE_REDIS_HOSTS) return;

  const trimmed = host.trim();
  if (!trimmed) {
    throw new Error('Host is required');
  }

  // If the host is already a literal IP, validate directly.
  if (net.isIP(trimmed)) {
    if (isPrivateOrReservedIp(trimmed)) {
      throw new Error('Connecting to private or reserved addresses is not allowed');
    }
    return;
  }

  // Resolve to A and AAAA records. Reject if *any* address is private — an
  // attacker could otherwise use DNS rebinding or a hostname that resolves
  // to a mix of public and private IPs.
  // Resolve to A and AAAA records. Reject if *any* address is private — an
  // attacker could otherwise use DNS rebinding or a hostname that resolves
  // to a mix of public and private IPs. A short timeout bounds the cost of
  // hostile DNS servers that deliberately delay responses.
  const DNS_TIMEOUT_MS = 5000;
  const lookupPromise = dns.lookup(trimmed, { all: true, verbatim: true });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS).unref(),
  );

  let resolvedAddresses: { address: string }[];
  try {
    resolvedAddresses = await Promise.race([lookupPromise, timeoutPromise]);
  } catch {
    throw new Error('Unable to resolve host');
  }

  if (resolvedAddresses.length === 0) {
    throw new Error('Unable to resolve host');
  }

  for (const { address } of resolvedAddresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error('Connecting to private or reserved addresses is not allowed');
    }
  }
}
