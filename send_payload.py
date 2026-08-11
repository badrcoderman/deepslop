#!/usr/bin/env python3
"""
send_payload.py -- Sends a .js file to the PS5.
Equivalent to Y2JB's payload_sender.py.

Usage:
  py send_payload.py payloads/helloworld.js
  py send_payload.py payloads/notification.js --token <hex_token>

ws_server.py must be running (port 50000).
The PS5 must be connected.
"""

import socket
import sys
import os
import json
import argparse
import ssl

SERVER_IP   = "127.0.0.1"
SERVER_PORT = 50000

def send_payload(filepath, token=None, server_ip=SERVER_IP, server_port=SERVER_PORT, use_tls=False):
    if not os.path.isfile(filepath):
        alt = os.path.join(os.path.dirname(__file__), filepath)
        filepath = alt if os.path.isfile(alt) else None

    if not filepath:
        print(f"  [!] File not found: {sys.argv[1]}")
        sys.exit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        code = f.read()

    print(f"  [+] {os.path.basename(filepath)} ({len(code)} bytes)")

    body = json.dumps({"code": code}).encode("utf-8")
    
    headers = [
        f"POST /inject HTTP/1.1",
        f"Host: {server_ip}:{server_port}",
        f"Content-Type: application/json",
        f"Content-Length: {len(body)}"
    ]
    
    if token:
        headers.append(f"Authorization: Bearer {token}")
        
    headers.append("Connection: close")
    
    request = "\r\n".join(headers).encode() + b"\r\n\r\n" + body

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if use_tls:
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            sock = context.wrap_socket(sock)
            
        sock.connect((server_ip, server_port))
        sock.sendall(request)
    except Exception as e:
        print(f"  [!] Connection failed ({server_ip}:{server_port}): {e}")
        print(f"  [!] Is ws_server.py running?")
        sys.exit(1)

    sock.settimeout(35)
    try:
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk: break
            data += chunk

        # Extract JSON from the HTTP response
        if b"\r\n\r\n" in data:
            body_resp = data.split(b"\r\n\r\n", 1)[1]
        else:
            body_resp = data

        if not body_resp:
            print("  [!] Empty response from server")
            sys.exit(1)

        result = json.loads(body_resp.decode("utf-8"))
        if result.get("status") == "ok":
            val = result.get("value", "")
            print(f"  [PS5 OK] {val if val and val != 'undefined' else '(no return value)'}")
        elif result.get("status") == "timeout":
            print("  [!] Timeout — no response from PS5")
        else:
            print(f"  [PS5 ERR] {result.get('error', '?')}")
    except socket.timeout:
        print("  [!] Timeout (35s)")
    except Exception as e:
        print(f"  [!] Error: {e}")
    finally:
        sock.close()

def main():
    parser = argparse.ArgumentParser(
        description="Sends a .js file to the PS5 (ws_server.py port 50000)")
    parser.add_argument("file", nargs="?", help=".js file to send")
    parser.add_argument("--host", default=os.environ.get("PS5_SERVER", SERVER_IP),
                        help="IP of ws_server.py server (default %(default)s)")
    parser.add_argument("--port", type=int, default=SERVER_PORT,
                        help="ws_server.py port (default %(default)s)")
    parser.add_argument("--token", default=os.environ.get("DEEPSLOP_TOKEN"),
                        help="Auth token (defaults to DEEPSLOP_TOKEN env var)")
    parser.add_argument("--tls", action="store_true", help="Use TLS to connect")
    args = parser.parse_args()

    if not args.file:
        print("Usage: py send_payload.py <file.js> [--host IP] [--port PORT] [--token TOKEN] [--tls]")
        print("       py send_payload.py payloads/helloworld.js")
        sys.exit(1)
    send_payload(args.file, args.token, args.host, args.port, args.tls)

if __name__ == "__main__":
    main()
