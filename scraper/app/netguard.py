import ipaddress
import logging
import socket
from urllib.parse import urlparse

log = logging.getLogger("netguard")

# SSRF guard: the crawler fetches arbitrary company websites from Places. Block
# requests that resolve to private/loopback/link-local/metadata ranges so a
# malicious or mistyped target can't reach internal services or 169.254.169.254.


def is_public_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        log.warning("DNS resolution failed for %s", host)
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local  # covers 169.254.0.0/16 (cloud metadata)
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            log.warning("blocked non-public target %s -> %s", host, ip_str)
            return False
    return True
