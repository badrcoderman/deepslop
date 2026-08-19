#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "payloads", "resizable_arraybuffer_probe.js"), "utf8");

class FakeResizableArrayBuffer {
    constructor(byteLength, options) {
        this.byteLength = byteLength;
        this.maxByteLength = options.maxByteLength;
        this.resizable = true;
    }

    resize(byteLength) {
        this.byteLength = byteLength;
    }
}

class FakeUint8Array {
    constructor(buffer) {
        this.buffer = buffer;
        this.bytes = new Uint8Array(buffer.byteLength);
    }

    get length() {
        return this.buffer.byteLength;
    }

    get byteLength() {
        return this.buffer.byteLength;
    }

    get(index) {
        return this.bytes[index] || 0;
    }

    set(index, value) {
        this.bytes[index] = value;
    }

    copyWithin(target, start, end) {
        this.bytes.copyWithin(target, start, end);
    }
}

function makeUint8ArrayConstructor() {
    return class extends FakeUint8Array {
        constructor(buffer) {
            super(buffer);
            return new Proxy(this, {
                get(target, property) {
                    if (/^\d+$/.test(property)) return target.get(Number(property));
                    return Reflect.get(target, property);
                },
                set(target, property, value) {
                    if (/^\d+$/.test(property)) {
                        target.set(Number(property), value);
                        return true;
                    }
                    return Reflect.set(target, property, value);
                },
            });
        }
    };
}

async function run({ ArrayBuffer: ArrayBufferCtor, Uint8Array: Uint8ArrayCtor }) {
    const output = [];
    const context = {
        ArrayBuffer: ArrayBufferCtor,
        Uint8Array: Uint8ArrayCtor,
        console: { log: () => {} },
        window: {
            addLog: (message) => output.push(message),
            payOut: (message) => output.push(message),
        },
    };
    await vm.runInNewContext(source, context);
    return output.join("\n");
}

async function main() {
    const Uint8ArrayCtor = makeUint8ArrayConstructor();
    const pass = await run({ ArrayBuffer: FakeResizableArrayBuffer, Uint8Array: Uint8ArrayCtor });
    assert.match(pass, /RESIZABLE ARRAYBUFFER PROBE/);
    assert.match(pass, /"status": "PASS"/);
    assert.match(pass, /"copyWithin": "PASS"/);

    class UnsupportedArrayBuffer {
        constructor(byteLength) {
            this.byteLength = byteLength;
            this.maxByteLength = byteLength;
            this.resizable = false;
        }
    }
    const unavailable = await run({ ArrayBuffer: UnsupportedArrayBuffer, Uint8Array: Uint8ArrayCtor });
    assert.match(unavailable, /UNAVAILABLE/);

    class BrokenArrayBuffer extends FakeResizableArrayBuffer {
        resize() {}
    }
    const stopped = await run({ ArrayBuffer: BrokenArrayBuffer, Uint8Array: Uint8ArrayCtor });
    assert.match(stopped, /STOPPED/);

    console.log("resizable ArrayBuffer probe contract: PASS");
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
