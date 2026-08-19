#!/usr/bin/env python3
"""Serve DeepSlop and receive bounded in-memory SPRX dumps.

The receiver stores every request directly on disk. The browser sends one
small binary chunk and waits for the acknowledgement before reading another.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


MAX_CHUNK = 0x800
MAX_MODULE = 0x800000
COMPONENT_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
ALLOWED_MODULES = {
    "libSceGvMp4Parser.sprx",
    "libSceAvPlayer.sprx",
    "libSceMetadataReaderWriter.sprx",
    "libSceEditMp4.sprx",
    "libSceWebmParserMdrw.sprx",
    "libSceContentSearch.sprx",
    "libSceAbstractStorage.sprx",
    "libSceAbstractLocal.sprx",
    "libSceIpmi.sprx",
}


def safe_component(value: str, label: str) -> str:
    if not isinstance(value, str) or not COMPONENT_RE.fullmatch(value):
        raise ValueError(f"invalid {label}")
    return value


def number(value, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"invalid {label}")
    if isinstance(value, int):
        result = value
    elif isinstance(value, str):
        result = int(value, 0)
    else:
        raise ValueError(f"invalid {label}")
    if result < 0:
        raise ValueError(f"invalid {label}")
    return result


def merge_range(ranges: list[list[int]], start: int, end: int) -> list[list[int]]:
    merged: list[list[int]] = []
    for left, right in sorted(ranges + [[start, end]]):
        if merged and left <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], right)
        else:
            merged.append([left, right])
    return merged


def complete(ranges: list[list[int]], expected: int) -> bool:
    return expected == 0 or (len(ranges) == 1 and ranges[0] == [0, expected])


def next_offset(ranges: list[list[int]]) -> int:
    return ranges[0][1] if ranges and ranges[0][0] == 0 else 0


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            block = stream.read(0x10000)
            if not block:
                return digest.hexdigest()
            digest.update(block)


class DumpHandler(SimpleHTTPRequestHandler):
    server_version = "DeepSlopDump/1.0"

    @property
    def dump_root(self) -> Path:
        return self.server.dump_root  # type: ignore[attr-defined]

    @property
    def cors_origin(self) -> str | None:
        return self.server.cors_origin  # type: ignore[attr-defined]

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        if self.cors_origin:
            self.send_header("Access-Control-Allow-Origin", self.cors_origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Dump-Id, X-Module, X-Segment, X-Offset")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/__deepslop/dump/ping":
            self.write_json(200, {
                "ok": True,
                "receiver": self.server_version,
                "maxChunk": MAX_CHUNK,
                "maxModule": MAX_MODULE,
            })
            return
        if parsed.path == "/__deepslop/dump/status":
            try:
                dump_id = safe_component(parse_qs(parsed.query).get("dumpId", [""])[0], "dumpId")
                self.write_json(200, self.status(dump_id))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/__deepslop/dump/start":
                self.start_dump()
            elif parsed.path == "/__deepslop/dump/chunk":
                self.write_chunk()
            elif parsed.path == "/__deepslop/dump/finish":
                self.finish_dump()
            else:
                self.write_json(404, {"ok": False, "error": "unknown endpoint"})
        except Exception as error:
            self.write_json(400, {"ok": False, "error": str(error)})

    def read_body(self, maximum: int = 0x100000) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError as error:
            raise ValueError("invalid Content-Length") from error
        if length < 0 or length > maximum:
            raise ValueError("request body exceeds limit")
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError("request body truncated")
        return body

    def write_json(self, status: int, value: dict) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def paths(self, dump_id: str, module: str) -> tuple[Path, Path]:
        folder = (self.dump_root / dump_id / module).resolve()
        root = self.dump_root.resolve()
        if root not in folder.parents:
            raise ValueError("dump path escaped root")
        folder.mkdir(parents=True, exist_ok=True)
        return folder, folder / "state.json"

    def load_state(self, dump_id: str) -> tuple[dict, Path]:
        dump_id = safe_component(dump_id, "dumpId")
        candidates = list((self.dump_root / dump_id).glob("*/state.json"))
        if len(candidates) != 1:
            raise ValueError("dump session not found or ambiguous")
        state_path = candidates[0]
        return json.loads(state_path.read_text(encoding="utf-8")), state_path

    def save_state(self, state: dict, state_path: Path) -> None:
        fd, temp_name = tempfile.mkstemp(prefix="state-", suffix=".tmp", dir=state_path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(state, stream, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_name, state_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def start_dump(self) -> None:
        payload = json.loads(self.read_body(0x10000).decode("utf-8"))
        dump_id = safe_component(payload.get("dumpId", ""), "dumpId")
        module = safe_component(payload.get("module", ""), "module")
        if module not in ALLOWED_MODULES:
            raise ValueError("module is not allowlisted")
        firmware = str(payload.get("firmware", ""))
        if firmware != "13.60":
            raise ValueError("exact firmware 13.60 required")
        segments = payload.get("segments")
        if not isinstance(segments, list) or not segments or len(segments) > 32:
            raise ValueError("invalid segment list")

        normalized = []
        seen_indices = set()
        total_filesz = 0
        for entry in segments:
            if not isinstance(entry, dict):
                raise ValueError("invalid segment entry")
            index = number(entry.get("index"), "segment index")
            filesz = number(entry.get("pFilesz"), "pFilesz")
            p_offset = number(entry.get("pOffset"), "pOffset")
            if index > 128 or index in seen_indices:
                raise ValueError("invalid or duplicate segment index")
            if filesz > MAX_MODULE or p_offset > MAX_MODULE or p_offset + filesz > MAX_MODULE:
                raise ValueError("segment exceeds module limit")
            seen_indices.add(index)
            total_filesz += filesz
            normalized.append({
                "index": index,
                "flags": str(entry.get("flags", "")),
                "address": str(entry.get("address", "")),
                "pOffset": p_offset,
                "pVaddr": str(entry.get("pVaddr", "")),
                "pFilesz": filesz,
                "pMemsz": str(entry.get("pMemsz", "")),
                "ranges": [],
            })
        if total_filesz > MAX_MODULE:
            raise ValueError("module total exceeds module limit")

        folder, state_path = self.paths(dump_id, module)
        if state_path.exists():
            raise ValueError("dump session already exists")
        state = {
            "manifest": {
                "dumpId": dump_id,
                "firmware": firmware,
                "module": module,
                "base": str(payload.get("base", "")),
                "loadBias": str(payload.get("loadBias", "")),
                "segments": normalized,
            },
            "finished": False,
        }
        for segment in normalized:
            (folder / f"segment-{segment['index']}.memory.bin.part").touch(mode=0o600, exist_ok=True)
        self.save_state(state, state_path)
        self.write_json(200, {"ok": True, "dumpId": dump_id, "next": self.status_from_state(state)})

    def segment_paths(self, state: dict, segment: dict) -> tuple[Path, Path, Path]:
        dump_id = state["manifest"]["dumpId"]
        module = state["manifest"]["module"]
        folder, _ = self.paths(dump_id, module)
        index = segment["index"]
        return (
            folder / f"segment-{index}.memory.bin.part",
            folder / "file-image.sprx.part",
            folder / f"segment-{index}.memory.bin",
        )

    def write_chunk(self) -> None:
        dump_id = safe_component(self.headers.get("X-Dump-Id", ""), "dumpId")
        module = safe_component(self.headers.get("X-Module", ""), "module")
        segment_index = number(self.headers.get("X-Segment", "-1"), "segment")
        offset = number(self.headers.get("X-Offset", "-1"), "offset")
        body = self.read_body(MAX_CHUNK)
        if not body:
            raise ValueError("empty chunk")

        state, state_path = self.load_state(dump_id)
        if state.get("finished"):
            raise ValueError("dump session is already finished")
        manifest = state["manifest"]
        if manifest["module"] != module:
            raise ValueError("module does not match dump session")
        segment = next((item for item in manifest["segments"] if item["index"] == segment_index), None)
        if segment is None:
            raise ValueError("unknown segment")
        expected = segment["pFilesz"]
        if offset + len(body) > expected:
            raise ValueError("chunk exceeds segment")

        memory_path, image_path, _ = self.segment_paths(state, segment)
        memory_fd = os.open(memory_path, os.O_RDWR | os.O_CREAT, 0o600)
        image_fd = os.open(image_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            os.pwrite(memory_fd, body, offset)
            os.pwrite(image_fd, body, segment["pOffset"] + offset)
        finally:
            os.close(memory_fd)
            os.close(image_fd)

        segment["ranges"] = merge_range(segment["ranges"], offset, offset + len(body))
        self.save_state(state, state_path)
        self.write_json(200, {
            "ok": True,
            "dumpId": dump_id,
            "segment": segment_index,
            "nextOffset": next_offset(segment["ranges"]),
            "received": next_offset(segment["ranges"]),
            "expected": expected,
        })

    def status_from_state(self, state: dict) -> dict:
        return {
            str(segment["index"]): {
                "nextOffset": next_offset(segment["ranges"]),
                "received": next_offset(segment["ranges"]),
                "expected": segment["pFilesz"],
                "complete": complete(segment["ranges"], segment["pFilesz"]),
            }
            for segment in state["manifest"]["segments"]
        }

    def status(self, dump_id: str) -> dict:
        state, _ = self.load_state(dump_id)
        return {"ok": True, "dumpId": dump_id, "finished": state["finished"], "segments": self.status_from_state(state)}

    def finish_dump(self) -> None:
        payload = json.loads(self.read_body(0x10000).decode("utf-8"))
        dump_id = safe_component(payload.get("dumpId", ""), "dumpId")
        state, state_path = self.load_state(dump_id)
        if any(not complete(segment["ranges"], segment["pFilesz"]) for segment in state["manifest"]["segments"]):
            raise ValueError("dump is incomplete")
        if state.get("finished"):
            raise ValueError("dump session is already finished")

        folder, _ = self.paths(dump_id, state["manifest"]["module"])
        outputs = []
        for segment in state["manifest"]["segments"]:
            memory_part, _, memory_final = self.segment_paths(state, segment)
            os.replace(memory_part, memory_final)
            outputs.append({
                "segment": segment["index"],
                "file": memory_final.name,
                "sha256": sha256_file(memory_final),
            })

        image_part = folder / "file-image.sprx.part"
        image_final = folder / "file-image.sprx"
        if image_part.exists():
            os.replace(image_part, image_final)
            image_sha = sha256_file(image_final)
        else:
            image_sha = None
        state["finished"] = True
        state["manifest"]["outputs"] = outputs
        state["manifest"]["fileImage"] = {"file": image_final.name, "sha256": image_sha}
        manifest_path = folder / "manifest.json"
        manifest_path.write_text(json.dumps(state["manifest"], indent=2) + "\n", encoding="utf-8")
        self.save_state(state, state_path)
        self.write_json(200, {"ok": True, "dumpId": dump_id, "manifest": str(manifest_path.relative_to(self.dump_root))})


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve DeepSlop and receive OOM-safe SPRX dumps")
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--cors-origin", default=None)
    args = parser.parse_args()

    root = args.root.resolve()
    dump_root = root / "dumps"
    dump_root.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.bind, args.port), DumpHandler)
    server.root = root  # type: ignore[attr-defined]
    server.dump_root = dump_root  # type: ignore[attr-defined]
    server.cors_origin = args.cors_origin  # type: ignore[attr-defined]
    os.chdir(root)
    print(f"DeepSlop: http://192.168.8.47:{args.port}/")
    print(f"Dump output: {dump_root}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping receiver")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
