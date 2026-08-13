#!/usr/bin/env python3
"""
telemetry_logger.py — Real-time PS5 Memory & Exploit Telemetry Receiver
Listens on port 9020 (or custom port) for WebSocket / TCP connections from PS5 WebKit.
Logs memory offsets, kernel bases, and parser results in real-time.

Usage:
    python3 telemetry_logger.py [--port 9020] [--host 0.0.0.0]
"""

import sys
import os
import json
import time
import socket
import argparse
import threading
from datetime import datetime

# ANSI Colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"

def log_msg(tag, msg, color=CYAN):
    t = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"{color}[{t}] [{tag}] {msg}{RESET}")

def parse_http_websocket_upgrade(data):
    lines = data.decode("utf-8", errors="ignore").split("\r\n")
    headers = {}
    for line in lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v
    return headers

def handle_client(conn, addr, log_file):
    log_msg("CONNECT", f"PS5 client connected from {addr[0]}:{addr[1]}", GREEN)
    
    try:
        data = conn.recv(4096)
        if not data:
            return

        # Check for WebSocket handshake
        if b"Upgrade: websocket" in data:
            import base64
            import hashlib
            
            headers = parse_http_websocket_upgrade(data)
            key = headers.get("sec-websocket-key", "")
            
            # Compute Sec-WebSocket-Accept
            guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept_key = base64.b64encode(hashlib.sha1((key + guid).encode()).digest()).decode()
            
            handshake_resp = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
            )
            conn.sendall(handshake_resp.encode())
            log_msg("WS", f"WebSocket handshake established with {addr[0]}", MAGENTA)
            
            while True:
                head = conn.recv(2)
                if not head or len(head) < 2:
                    break
                
                fin_opcode = head[0]
                mask_payload = head[1]
                
                opcode = fin_opcode & 0x0F
                if opcode == 0x8:  # Close
                    log_msg("WS", "Client sent close frame", YELLOW)
                    break
                
                payload_len = mask_payload & 0x7F
                if payload_len == 126:
                    ext = conn.recv(2)
                    payload_len = int.from_bytes(ext, "big")
                elif payload_len == 127:
                    ext = conn.recv(8)
                    payload_len = int.from_bytes(ext, "big")
                
                is_masked = (mask_payload & 0x80) != 0
                if is_masked:
                    mask_key = conn.recv(4)
                
                raw_payload = bytearray()
                while len(raw_payload) < payload_len:
                    chunk = conn.recv(payload_len - len(raw_payload))
                    if not chunk:
                        break
                    raw_payload.extend(chunk)
                
                if is_masked:
                    unmasked = bytearray(len(raw_payload))
                    for i in range(len(raw_payload)):
                        unmasked[i] = raw_payload[i] ^ mask_key[i % 4]
                    payload_bytes = bytes(unmasked)
                else:
                    payload_bytes = bytes(raw_payload)
                
                msg_str = payload_bytes.decode("utf-8", errors="ignore")
                
                # Try formatting as JSON
                try:
                    js = json.loads(msg_str)
                    log_msg("TELEMETRY", f"{BOLD}JSON Snapshot Received:{RESET}", GREEN)
                    for k, v in js.items():
                        print(f"  {YELLOW}{k:15}{RESET}: {v}")
                except Exception:
                    log_msg("LOG", msg_str, CYAN)
                
                if log_file:
                    log_file.write(f"[{datetime.now().isoformat()}] {msg_str}\n")
                    log_file.flush()

        else:
            # Plain TCP data
            text = data.decode("utf-8", errors="ignore")
            log_msg("RAW_DATA", text, CYAN)
            if log_file:
                log_file.write(f"[{datetime.now().isoformat()}] {text}\n")
                log_file.flush()

    except Exception as e:
        log_msg("DISCONNECT", f"Connection ended: {e}", YELLOW)
    finally:
        conn.close()
        log_msg("STATUS", f"Session with {addr[0]} closed", RED)

def main():
    parser = argparse.ArgumentParser(description="PS5 Telemetry & Memory Log Receiver")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=9020, help="Port to listen on (default: 9020)")
    parser.add_argument("--log", default=None, help="Path to save log file")
    args = parser.parse_args()

    log_filename = args.log or f"telemetry_{int(time.time())}.log"
    log_file = open(log_filename, "a", encoding="utf-8")

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((args.host, args.port))
    s.listen(5)

    print(f"{BOLD}{GREEN}✦ PS5 Telemetry Logger active on {args.host}:{args.port} ✦{RESET}")
    print(f"Logging session data to: {log_filename}")
    print("Waiting for PS5 WebKit connection...\n")

    try:
        while True:
            conn, addr = s.accept()
            t = threading.Thread(target=handle_client, args=(conn, addr, log_file), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Shutting down Telemetry Logger...{RESET}")
    finally:
        s.close()
        log_file.close()

if __name__ == "__main__":
    main()
