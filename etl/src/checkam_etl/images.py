import ipaddress
import socket
from urllib.parse import urlparse

import httpx

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 1_572_864  # 1.5 MB


def is_safe_host(hostname: str) -> bool:
    """SSRF guard: reject private, loopback, link-local, and reserved IP addresses."""
    if not hostname:
        return False
    try:
        # Resolve hostname to IP
        addr_info = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        return True
    except (socket.gaierror, ValueError):
        return False


async def validate_image_url(url: str, client: httpx.AsyncClient | None = None) -> bool:
    """Validate external image URL according to security, SSL and size constraints."""
    if not url or len(url) > 2048:
        return False

    parsed = urlparse(url)
    if parsed.scheme.lower() != "https":
        return False
    if parsed.username or parsed.password:
        return False
    if not parsed.hostname:
        return False
    if not is_safe_host(parsed.hostname):
        return False

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=10.0, follow_redirects=False)
        close_client = True

    try:
        current_url = url
        # Follow at most 3 redirects, validating host at each hop
        for _ in range(4):
            cur_parsed = urlparse(current_url)
            if cur_parsed.scheme.lower() != "https" or not is_safe_host(cur_parsed.hostname or ""):
                return False

            try:
                resp = await client.head(current_url)
            except httpx.HTTPError:
                # Fall back to ranged GET
                resp = await client.get(current_url, headers={"Range": "bytes=0-1024"})

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location")
                if not location:
                    return False
                current_url = location
                continue

            if resp.status_code == 200 or resp.status_code == 206:
                content_type = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
                if content_type not in ALLOWED_IMAGE_TYPES:
                    return False
                content_length = resp.headers.get("Content-Length")
                if content_length:
                    try:
                        if int(content_length) > MAX_IMAGE_SIZE:
                            return False
                    except ValueError:
                        pass
                return True

            return False
        return False
    except Exception:
        return False
    finally:
        if close_client:
            await client.aclose()
