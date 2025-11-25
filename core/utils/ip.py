import netifaces


def get_local_ips():
    ips = []
    for interface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(interface)
        if netifaces.AF_INET in addrs:
            for addr_info in addrs[netifaces.AF_INET]:
                ip = addr_info.get("addr")
                if ip and not ip.startswith("127."):
                    ips.append(ip)
    return ips


print("Available IPv4 addresses:", get_local_ips())
