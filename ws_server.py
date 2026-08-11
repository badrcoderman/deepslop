#!/usr/bin/env python3
"""
ws_server.py — Remote JS Loader Server for PS5 FW 9.00

Single port 50000:
  - PS5   → GET (WebSocket upgrade) → Interactive REPL
  - send_payload.py → POST /inject  → Direct injection
  - ROP chain beacon → raw TCP connection (PS5_RCE_OK)

IMPORTANT — the kit needs a second static HTTP server on port 8080
serving index.html, remote.js and offsets/ (the exploit fetches remote.js from
http://<PC>:8080/remote.js). Example: python3 -m http.server 8080 --directory deepslop

Usage:
  py ws_server.py
  py send_payload.py payloads/helloworld.js   (from another terminal)
"""

import socket
import threading
import queue
import base64
import hashlib
import struct
import json
import os
import secrets
import ssl
import time
import argparse
from datetime import datetime

HOST     = "0.0.0.0"
PORT     = 50000
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Shared injection queue between REPL thread and POST requests
_inject_q = queue.Queue()
_ps5_conn = None   # Active PS5 WebSocket connection
_ps5_lock = threading.Lock()

_auth_token = None
_no_auth = False
_log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ws_server.log")

def log_event(event_type, **kwargs):
    """Log an event to ws_server.log as JSON line."""
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": event_type,
    }
    record.update(kwargs)
    try:
        with open(_log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass

# ─── WebSocket helpers ────────────────────────────────────────────────────────

def ws_accept_key(key):
    return base64.b64encode(hashlib.sha1((key + WS_MAGIC).encode()).digest()).decode()

def ws_handshake(conn, initial_data):
    """Finish WebSocket handshake from already read data."""
    while b"\r\n\r\n" not in initial_data:
        chunk = conn.recv(4096)
        if not chunk:
            return False
        initial_data += chunk
    lines = initial_data.decode("utf-8", errors="replace").split("\r\n")
    headers = {}
    for line in lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v
    key = headers.get("sec-websocket-key", "")
    if not key:
        return False

    # Check HMAC Token Auth for WebSocket
    if not _no_auth:
        protocol = headers.get("sec-websocket-protocol", "")
        expected_protocol = f"deepslop-{_auth_token}"
        if expected_protocol not in protocol:
            log_event("ws_auth_failure", headers=headers)
            resp = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"
            conn.sendall(resp.encode())
            return False

    resp = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {ws_accept_key(key)}\r\n"
    )
    if not _no_auth:
        resp += f"Sec-WebSocket-Protocol: deepslop-{_auth_token}\r\n"
    resp += "\r\n"
    conn.sendall(resp.encode())
    return True

def ws_recv(conn):
    def rx(n):
        buf = b""
        while len(buf) < n:
            c = conn.recv(n - len(buf))
            if not c:
                return None
            buf += c
        return buf
    h = rx(2)
    if not h:
        return None
    op = h[0] & 0x0f
    masked = (h[1] >> 7) & 1
    plen = h[1] & 0x7f
    if plen == 126:
        r = rx(2)
        if not r: return None
        plen = struct.unpack(">H", r)[0]
    elif plen == 127:
        r = rx(8)
        if not r: return None
        plen = struct.unpack(">Q", r)[0]
    mask = rx(4) if masked else b""
    if mask is None: return None
    payload = rx(plen)
    if payload is None: return None
    if masked:
        payload = bytes([b ^ mask[i % 4] for i, b in enumerate(payload)])
    return (op, payload)

def ws_send(conn, data, opcode=0x01):
    if isinstance(data, str):
        data = data.encode("utf-8")
    n = len(data)
    if n < 126:
        hdr = bytes([0x80 | opcode, n])
    elif n < 65536:
        hdr = bytes([0x80 | opcode, 126]) + struct.pack(">H", n)
    else:
        hdr = bytes([0x80 | opcode, 127]) + struct.pack(">Q", n)
    try:
        conn.sendall(hdr + data)
        return True
    except Exception:
        return False

# ─── PS5 Display ────────────────────────────────────────────────────────────

def print_ps5(payload_bytes, prefix=""):
    try:
        msg = json.loads(payload_bytes.decode("utf-8"))
        t = msg.get("type", "")
        if t == "result":
            tag = "OK " if msg.get("status") == "ok" else "ERR"
            val = msg.get("value") or msg.get("error") or ""
            print(f"\r  [PS5 {tag}] {val}")
        elif t == "log":
            print(f"\r  [PS5 LOG] {msg.get('msg', '')}")
        elif t == "pong":
            pass
        else:
            print(f"\r  [PS5] {payload_bytes.decode('utf-8', errors='replace')}")
    except Exception:
        print(f"\r  [PS5] {payload_bytes.decode('utf-8', errors='replace')}")

# ─── Send to PS5 (thread-safe) ──────────────────────────────────────────

def send_offsets_report(conn, timeout=5):
    """Queries deepslopScanOffsets() and returns a readable text report."""
    try:
        if not ws_send(conn, json.dumps({"type": "eval",
                "code": "JSON.stringify((typeof window.deepslopScanOffsets==='function')"
                        "?window.deepslopScanOffsets():null)"})):
            return None
        conn.settimeout(timeout)
        frame = ws_recv(conn)
        conn.settimeout(None)
        if not frame or frame[0] != 0x01:
            return None
        msg = json.loads(frame[1].decode("utf-8"))
        val = json.loads(msg.get("value") or "null")
        if not val:
            return None
        lines = [f"  OFFSETS  : hc=0x{val['hc']:x} gd=0x{val['gd']:x} nt=0x{val['nt']:x}"]
        for k in ("gps", "cls", "ers"):
            f = val.get("found", {}).get(k, [])
            lines.append(f"             {k}=" + (",".join("0x%x" % x for x in f) if f else "none"))
        lines.append("             trampoline=" + str(val.get("verified", {}).get("trampolineBytes", "?")))
        return "\n".join(lines)
    except Exception:
        return None

def ps5_eval(code, timeout=30):
    result_q = queue.Queue()
    _inject_q.put({"code": code, "result_q": result_q})
    try:
        return result_q.get(timeout=timeout)
    except queue.Empty:
        return {"status": "timeout", "error": "Timeout 30s"}

# ─── HTTP POST Injection Handler ──────────────────────────────────────────────

def handle_http_inject(conn, initial_data):
    """Handle a POST /inject request from send_payload.py."""
    try:
        # Read the rest if necessary
        data = initial_data
        while b"\r\n\r\n" not in data:
            chunk = conn.recv(4096)
            if not chunk: break
            data += chunk

        header_part = data.split(b"\r\n\r\n", 1)
        headers_raw = header_part[0].decode("utf-8", errors="replace")
        body = header_part[1] if len(header_part) > 1 else b""

        # Check Auth
        if not _no_auth:
            auth_header_found = False
            for line in headers_raw.split("\r\n"):
                if line.lower().startswith("authorization:"):
                    parts = line.split(":", 1)[1].strip().split()
                    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1] == _auth_token:
                        auth_header_found = True
                        break
            if not auth_header_found:
                log_event("http_auth_failure", headers=headers_raw)
                conn.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
                return

        # Content-Length
        content_length = 0
        for line in headers_raw.split("\r\n"):
            if line.lower().startswith("content-length:"):
                content_length = int(line.split(":", 1)[1].strip())

        while len(body) < content_length:
            chunk = conn.recv(4096)
            if not chunk: break
            body += chunk

        msg = json.loads(body.decode("utf-8"))
        if not isinstance(msg, dict):
            reply = {"status": "error", "error": "JSON body must be an object"}
        else:
            code = msg.get("code", "")
            if not code.strip():
                reply = {"status": "error", "error": "No code provided"}
            elif _ps5_conn is None:
                reply = {"status": "error", "error": "No PS5 connected"}
            else:
                log_event("ps5_eval_request", length=len(code))
                reply = ps5_eval(code, timeout=30)
                log_event("ps5_eval_response", status=reply.get("status"))

        body_resp = json.dumps(reply).encode("utf-8")
        http_resp = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json\r\n"
            f"Content-Length: {len(body_resp)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode() + body_resp
        conn.sendall(http_resp)
    except Exception as e:
        log_event("http_inject_error", error=str(e))
        try:
            err = json.dumps({"status": "error", "error": str(e)}).encode()
            conn.sendall(b"HTTP/1.1 500 Error\r\nContent-Length: " + str(len(err)).encode() + b"\r\n\r\n" + err)
        except Exception:
            pass
    finally:
        conn.close()

# ─── PS5 WebSocket Handler ────────────────────────────────────────────────────

def handle_ps5(conn, addr, initial_data):
    global _ps5_conn

    if not ws_handshake(conn, initial_data):
        conn.close()
        return

    # Only one active session — cleanly reject a second PS5
    with _ps5_lock:
        if _ps5_conn is not None:
            try:
                ws_send(conn, json.dumps({"type": "close"}), opcode=0x08)
            except Exception:
                pass
            conn.close()
            return
        _ps5_conn = conn

    print(f"  [+] PS5 connected from {addr[0]}:{addr[1]}")
    log_event("ps5_connected", ip=addr[0], port=addr[1])

    # WebSocket Keepalive
    last_pong = [time.time()]
    def watch_ps5():
        global _ps5_conn
        while True:
            time.sleep(15)
            with _ps5_lock:
                if _ps5_conn is None or _ps5_conn != conn:
                    return
            try:
                ws_send(conn, b"ping", opcode=0x09) # Ping
            except Exception:
                pass
            
            time.sleep(10)
            if time.time() - last_pong[0] > 25: # Didn't receive pong in time
                print("\n  [!] PS5 disconnected (keepalive timeout)")
                log_event("ps5_disconnected", reason="keepalive_timeout")
                try: conn.close()
                except Exception: pass
                
                # Immediately release lock for graceful reconnect
                with _ps5_lock:
                    if _ps5_conn == conn:
                        _ps5_conn = None
                return
    
    threading.Thread(target=watch_ps5, daemon=True).start()

    # Initial "ready" message
    conn.settimeout(5)
    try:
        frame = ws_recv(conn)
        if frame and frame[0] == 0x01:
            info = json.loads(frame[1].decode("utf-8"))
            if info.get("type") == "ready":
                print(f"\n  === PS5 Remote JS Loader connected ===")
                print(f"  FW        : {info.get('fw', '?')}")
                print(f"  kernelBase: {info.get('kernelBase', '?')}")
                print(f"  webkitBase: {info.get('webkitBase', '?')}")
                print(f"  =====================================")
                try:
                    sc = send_offsets_report(conn)
                    if sc: print(sc)
                except Exception:
                    pass
                print("  =====================================\n")
    except socket.timeout:
        # Slow PS5 after GC — let the "ready" frame be consumed by the
        # REPL below instead of leaving it in the buffer.
        print("  [*] PS5 connected (late ready — processed in REPL)")
    except Exception:
        pass
    finally:
        conn.settimeout(None)

    # No auto-load — renderer needs time to GC the carrier (~72MB).
    # User loads kernel.js manually once the session is stable.
    print("  [*] Session ready. Commands:")
    print("  [*]   send <file.js>        <- send a payload")
    print("  [*]   offsets | scan        <- auto-detected offsets (deepslop)")
    print("  [*]   resolve <addr>        <- module+RVA")
    print("  [*]   mem <addr> [n]        <- read memory")
    print("  [*]   notify <text>         <- PS5 notification")
    print("  [*]   fire                  <- ROP chain (crash renderer)")
    print("  [*]   <JS code>             <- execute JS directly\n")


    def send_to_ps5(code, timeout=30):
        if not ws_send(conn, json.dumps({"type": "eval", "code": code})):
            return None
        conn.settimeout(timeout)
        try:
            return ws_recv(conn)
        except socket.timeout:
            return "timeout"
        finally:
            conn.settimeout(None)

    # Thread for send_payload.py injections
    def inject_worker():
        while True:
            try:
                item = _inject_q.get(timeout=1)
            except queue.Empty:
                with _ps5_lock:
                    if _ps5_conn != conn:
                        break
                continue
            frame = send_to_ps5(item["code"])
            if frame and frame != "timeout" and frame[0] == 0x01:
                try:
                    item["result_q"].put(json.loads(frame[1].decode("utf-8")))
                    print_ps5(frame[1])
                    print("  > ", end="", flush=True)
                except Exception:
                    item["result_q"].put({"status": "ok", "value": "?"})
            elif frame == "timeout":
                item["result_q"].put({"status": "timeout"})
            else:
                item["result_q"].put({"status": "error", "error": "disconnected"})

    threading.Thread(target=inject_worker, daemon=True).start()

    # REPL
    while True:
        # Unsolicited PS5 messages
        conn.setblocking(False)
        try:
            if conn.recv(1, socket.MSG_PEEK) == b"":
                print("\n  [!] PS5 disconnected"); break
            conn.setblocking(True)
            frame = ws_recv(conn)
            if not frame: print("\n  [!] PS5 disconnected"); break
            if frame[0] == 0x08: print("\n  [!] PS5 disconnected"); break
            if frame[0] == 0x0A: # Pong
                last_pong[0] = time.time()
                continue
            if frame[0] == 0x01: print_ps5(frame[1])
        except BlockingIOError:
            pass
        except Exception:
            print("\n  [!] PS5 disconnected"); break
        conn.setblocking(True)

        try:
            print("  > ", end="", flush=True)
            first = input().strip()

            if first.lower() == "exit":
                ws_send(conn, json.dumps({"type": "close"}), opcode=0x08)
                conn.close(); return

            if first.lower() == "help":
                print("  send <file.js>     — Send a JS file")
                print("  research list       - List available payloads")
                print("  research run <name> - Run a specific payload")
                print("  research run-all    - Run all payloads")
                print("  research report     - Pull full telemetry report")
                print("  fire               — PS5 notif + crash renderer (commitRce)")
                print("  offsets            — Show auto-detected offsets (deepslop)")
                print("  scan               — Relaunch offset scan report")
                print("  resolve <addr>     — Resolve addr to module+RVA")
                print("  mem <addr> [n]     — Read n qwords (deepslop primitives)")
                print("  notify <text>      — PS5 notification (sendNotifNatural)")
                print("  <JS code>          — Execute (empty line to submit)")
                print("  exit               — Quit")
                print("  Or: py send_payload.py <file.js>  (other terminal)")
                continue

            if first.lower() in ("fire", "commit"):
                log_event("command_fire")
                ws_send(conn, json.dumps({"type": "fire"}))
                conn.settimeout(5)
                try:
                    f = ws_recv(conn)
                    if f and f[0] == 0x01: print_ps5(f[1])
                except socket.timeout:
                    print("  [OK] commitRce triggered (renderer likely crashed)")
                finally:
                    conn.settimeout(None)
                continue

            if first.lower().startswith("research "):
                parts = first.split(" ")
                if len(parts) < 2:
                    print("Usage: research <list|run|run-all|report|capabilities> [args]")
                    continue
                
                subcmd = parts[1]
                if subcmd == "list":
                    ws_send(conn, json.dumps({"type": "research", "command": "list"}))
                elif subcmd == "run" and len(parts) > 2:
                    ws_send(conn, json.dumps({"type": "research", "command": "run", "name": parts[2]}))
                elif subcmd == "run-all":
                    cat = parts[2] if len(parts) > 2 else ""
                    ws_send(conn, json.dumps({"type": "research", "command": "run-all", "category": cat}))
                elif subcmd == "report":
                    ws_send(conn, json.dumps({"type": "research", "command": "report"}))
                elif subcmd == "capabilities":
                    ws_send(conn, json.dumps({"type": "research", "command": "capabilities"}))
                else:
                    print("  [!] Unknown research command or missing arguments.")
                continue

            if first.lower().startswith("offsets") or first.lower() == "scan":
                log_event("command_offsets")
                ws_send(conn, json.dumps({"type": "offsets"}))
                conn.settimeout(5)
                try:
                    f = ws_recv(conn)
                    if f and f[0] == 0x01:
                        try:
                            data = json.loads(f[1].decode("utf-8"))
                            val = json.loads(data.get("value") or "null")
                            if val and val.get("scan"):
                                s = val["scan"]
                                print("  [OFFSETS] hc=0x%x gd=0x%x nt=0x%x" % (s["hc"], s["gd"], s["nt"]))
                                for k in ("gps", "cls", "ers"):
                                    fl = s.get("found", {}).get(k, [])
                                    print(f"  [OFFSETS] {k}: " +
                                          (", ".join("0x%x" % x for x in fl) if fl else "none"))
                                print("  [OFFSETS] trampoline: " +
                                      str(s.get("verified", {}).get("trampolineBytes", "?")))
                            else:
                                print("  [OFFSETS] scan unavailable (no R/W yet)")
                        except Exception as e:
                            print(f"  [!] Parse offsets error: {e}")
                    else:
                        print("  [!] No response")
                except socket.timeout:
                    print("  [!] Timeout")
                finally:
                    conn.settimeout(None)
                continue

            if first.lower().startswith("resolve "):
                addr = first[8:].strip()
                try:
                    n = int(addr, 0)
                    log_event("command_resolve", addr=n)
                    ws_send(conn, json.dumps({"type": "resolve", "addr": n}))
                    conn.settimeout(5)
                    try:
                        f = ws_recv(conn)
                        if f and f[0] == 0x01: print_ps5(f[1])
                    except socket.timeout:
                        print("  [!] Timeout")
                    finally:
                        conn.settimeout(None)
                except ValueError:
                    print("  [!] Invalid address")
                continue

            if first.lower().startswith("mem "):
                parts = first[4:].split()
                try:
                    a = int(parts[0], 0)
                    cnt = int(parts[1], 0) if len(parts) > 1 else 1
                    log_event("command_mem", addr=a, count=cnt)
                    ws_send(conn, json.dumps({"type": "mem", "addr": a, "count": cnt}))
                    conn.settimeout(5)
                    try:
                        f = ws_recv(conn)
                        if f and f[0] == 0x01: print_ps5(f[1])
                    except socket.timeout:
                        print("  [!] Timeout")
                    finally:
                        conn.settimeout(None)
                except ValueError:
                    print("  [!] Syntax: mem <addr> [n]")
                continue

            if first.lower().startswith("notify "):
                text = first[7:].strip()
                if text:
                    log_event("command_notify", text=text)
                    ws_send(conn, json.dumps({"type": "eval",
                        "code": f"send_notification({json.dumps(text)});'ok'"}))
                    conn.settimeout(5)
                    try:
                        f = ws_recv(conn)
                        if f and f[0] == 0x01: print_ps5(f[1])
                    except socket.timeout:
                        print("  [OK] notification sent")
                    finally:
                        conn.settimeout(None)
                continue

            if first.lower().startswith("send "):
                fname = first[5:].strip()
                for p in [fname, os.path.join(os.path.dirname(__file__), fname)]:
                    if os.path.isfile(p):
                        with open(p, encoding="utf-8") as f:
                            code = f.read()
                        log_event("command_send", file=fname, length=len(code))
                        print(f"  [*] Sending '{p}' ({len(code)} bytes)...")
                        frame = send_to_ps5(code)
                        if frame == "timeout": print("  [!] Timeout")
                        elif frame and frame[0] == 0x01: print_ps5(frame[1])
                        elif not frame: print("  [!] PS5 disconnected"); break
                        break
                else:
                    print(f"  [!] File not found: {fname}")
                continue

            # Multi-line JS code
            lines = [first] if first else []
            while True:
                line = input()
                if line.strip() == "": break
                lines.append(line)
            code = "\n".join(lines)
            if not code.strip(): continue

            log_event("command_eval", length=len(code))
            frame = send_to_ps5(code)
            if frame == "timeout": print("  [!] Timeout (30s)")
            elif frame and frame[0] == 0x01: print_ps5(frame[1])
            elif not frame: print("  [!] PS5 disconnected"); break

        except (EOFError, KeyboardInterrupt):
            print("\n  [!] Interrupted"); break

    log_event("ps5_disconnected", reason="repl_exit")
    with _ps5_lock:
        if _ps5_conn == conn:
            _ps5_conn = None
    try: conn.close()
    except Exception: pass
    print("  [*] Session ended. Waiting for PS5...\n")

# ─── Dispatcher (detect WS vs HTTP) ───────────────────────────────────────

def dispatch(conn, addr):
    """Detect if it's the PS5 (WebSocket GET) or send_payload.py (HTTP POST)."""
    conn.settimeout(10)
    try:
        initial = conn.recv(8)
        if not initial:
            conn.close(); return
    except Exception:
        conn.close(); return
    finally:
        conn.settimeout(None)

    if initial[:4] == b"POST":
        handle_http_inject(conn, initial)
    elif initial[:3] == b"GET":
        handle_ps5(conn, addr, initial)
    else:
        # ROP chain beacon: raw TCP connection — the PS5 ROP chain writes
        # "PS5_RCE_OK\n" then closes. We consume and display it.
        try:
            conn.settimeout(5)
            rest = conn.recv(64) if len(initial) < 64 else b""
            beacon = (initial + rest).decode("utf-8", errors="replace").strip()
            if "PS5_RCE_OK" in beacon:
                log_event("rop_chain_success")
                print("\n  [OK] === PS5 ROP CHAIN ARRIVED (RCE_OK) ===")
            else:
                log_event("unexpected_tcp_connection", data=beacon[:64])
                print(f"\n  [!] Unexpected TCP connection: {beacon[:64]!r}")
        except Exception:
            pass
        finally:
            conn.close()

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    global _auth_token, _no_auth
    parser = argparse.ArgumentParser(description="PS5 Remote JS Loader Server")
    parser.add_argument("--no-auth", action="store_true", help="Disable HMAC Token Authentication")
    args = parser.parse_args()

    _no_auth = args.no_auth

    print(f"\n  === PS5 Remote JS Loader Server ===")
    if not _no_auth:
        _auth_token = secrets.token_hex(16)
        print(f"  [+] Auth Token: {_auth_token}")
    else:
        print(f"  [!] Auth Disabled (--no-auth)")

    # Optional TLS
    cert_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.pem")
    use_tls = os.path.exists(cert_path)
    if use_tls:
        print(f"  [+] TLS Active (server.pem found)")
    else:
        print(f"  [-] TLS Inactive (server.pem not found)")

    print(f"  Port {PORT} : PS5 WebSocket + send_payload.py")
    print(f"  Usage     : py send_payload.py payloads/helloworld.js\n")

    log_event("server_start", port=PORT, tls=use_tls, auth=not _no_auth)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(5)

    if use_tls:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_path)
        srv = context.wrap_socket(srv, server_side=True)

    try:
        while True:
            try:
                conn, addr = srv.accept()
                threading.Thread(target=dispatch, args=(conn, addr), daemon=True).start()
            except ssl.SSLError as e:
                log_event("ssl_error", error=str(e))
                print(f"\n  [!] SSL Error: {e}")
    except KeyboardInterrupt:
        print("\n  [!] Stopping")
        log_event("server_stop")
    finally:
        srv.close()

if __name__ == "__main__":
    main()
