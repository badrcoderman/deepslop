#!/usr/bin/env python3
"""Small end-to-end contract test for the disk-backed SPRX receiver."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sprx_dump_receiver", ROOT / "tools" / "sprx_dump_receiver.py")
receiver = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(receiver)


def request(url: str, method: str, body: bytes, headers: dict[str, str] | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def main() -> None:
    with tempfile.TemporaryDirectory() as temp:
        dump_root = Path(temp) / "dumps"
        dump_root.mkdir()
        server = receiver.ThreadingHTTPServer(("127.0.0.1", 0), receiver.DumpHandler)
        server.dump_root = dump_root
        server.cors_origin = None
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            code, result = request(base + "/__deepslop/dump/ping", "GET", b"")
            assert code == 200 and result["ok"] and result["maxChunk"] == receiver.MAX_CHUNK

            manifest = {
                "dumpId": "test-session",
                "firmware": "13.60",
                "module": "libSceAvPlayer.sprx",
                "base": "0x800000000",
                "loadBias": "0x800000000",
                "segments": [{
                    "index": 0,
                    "flags": "0x5",
                    "address": "0x800000000",
                    "pOffset": 0x20,
                    "pVaddr": "0x0",
                    "pFilesz": 5,
                    "pMemsz": "0x5",
                }],
            }
            oversized = {
                **manifest,
                "dumpId": "oversized-session",
                "segments": [{**manifest["segments"][0], "pOffset": receiver.MAX_MODULE}],
            }
            code, result = request(base + "/__deepslop/dump/start", "POST", json.dumps(oversized).encode(), {"Content-Type": "application/json"})
            assert code == 400 and "module limit" in result["error"]

            code, result = request(base + "/__deepslop/dump/start", "POST", json.dumps(manifest).encode(), {"Content-Type": "application/json"})
            assert code == 200 and result["ok"]

            headers = {
                "Content-Type": "application/octet-stream",
                "X-Dump-Id": "test-session",
                "X-Module": "libSceAvPlayer.sprx",
                "X-Segment": "0",
                "X-Offset": "0",
            }
            code, result = request(base + "/__deepslop/dump/chunk", "POST", b"hello", headers)
            assert code == 200 and result["nextOffset"] == 5

            code, result = request(base + "/__deepslop/dump/finish", "POST", b'{"dumpId":"test-session"}', {"Content-Type": "application/json"})
            assert code == 200 and result["ok"]

            code, result = request(base + "/__deepslop/dump/start", "POST", json.dumps(manifest).encode(), {"Content-Type": "application/json"})
            assert code == 400 and "already exists" in result["error"]

            folder = dump_root / "test-session" / "libSceAvPlayer.sprx"
            assert (folder / "segment-0.memory.bin").read_bytes() == b"hello"
            image = (folder / "file-image.sprx").read_bytes()
            assert image[0x20:0x25] == b"hello"

            code, result = request(base + "/__deepslop/dump/chunk", "POST", b"x", headers)
            assert code == 400 and "finished" in result["error"]
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    assert receiver.next_offset([[0, 5]]) == 5
    assert receiver.complete([[0, 5]], 5)
    assert receiver.complete([], 0)
    print("SPRX dump receiver contract: PASS")


if __name__ == "__main__":
    main()
