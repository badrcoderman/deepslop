(function() {
    const manifest = {
        name: "wk-idb-bench",
        version: "1.0.0",
        description: "IndexedDB throughput",
        category: "webkit",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["IndexedDB"],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        const start = performance.now();
        const dbName = "ds_bench_db_" + Date.now();
        
        if (typeof indexedDB === 'undefined') {
            return { status: "UNAVAILABLE", reason: "indexedDB not supported" };
        }

        let db = null;
        try {
            // Open DB
            db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    db.createObjectStore("store", { keyPath: "id" });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            // Write bench
            const writeStart = performance.now();
            const numRecords = 500;
            
            await new Promise((resolve, reject) => {
                const tx = db.transaction("store", "readwrite");
                const store = tx.objectStore("store");
                for (let i = 0; i < numRecords; i++) {
                    store.put({ id: i, data: "x".repeat(1024) }); // 1KB records
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            const writeTime = performance.now() - writeStart;

            // Read bench
            const readStart = performance.now();
            let readCount = 0;
            await new Promise((resolve, reject) => {
                const tx = db.transaction("store", "readonly");
                const store = tx.objectStore("store");
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        readCount++;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = () => reject(req.error);
            });
            const readTime = performance.now() - readStart;

            db.close();
            
            // Cleanup
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve(); // Ignore cleanup errors
            });

            return {
                status: "AVAILABLE",
                total_time_ms: performance.now() - start,
                results: {
                    records: numRecords,
                    record_size_bytes: 1024,
                    write_time_ms: writeTime,
                    read_time_ms: readTime,
                    read_count: readCount
                }
            };
        } catch (e) {
            if (db) db.close();
            return {
                status: "FAILED",
                error: e.message,
                total_time_ms: performance.now() - start
            };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
