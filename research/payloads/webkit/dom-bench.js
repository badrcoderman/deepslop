(function() {
    const manifest = {
        name: "wk-dom-bench",
        version: "1.0.0",
        description: "DOM operation throughput",
        category: "webkit",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        const start = performance.now();
        
        if (typeof document === 'undefined') {
            return { status: "UNAVAILABLE", reason: "DOM not available" };
        }

        try {
            const container = document.createElement("div");
            container.style.display = "none";
            document.body.appendChild(container);

            const numElements = 5000;

            // Creation and insertion
            const createStart = performance.now();
            const frag = document.createDocumentFragment();
            for (let i = 0; i < numElements; i++) {
                const el = document.createElement("div");
                el.className = "bench-item";
                el.textContent = "Item " + i;
                el.dataset.id = i;
                frag.appendChild(el);
            }
            container.appendChild(frag);
            const createTime = performance.now() - createStart;

            // Querying
            const queryStart = performance.now();
            const items = container.querySelectorAll(".bench-item");
            let foundCount = items.length;
            for (let i = 0; i < 1000; i++) {
                container.querySelector(`[data-id="${i}"]`);
            }
            const queryTime = performance.now() - queryStart;

            // Modification
            const modStart = performance.now();
            for (let i = 0; i < numElements; i++) {
                items[i].style.color = "red";
                items[i].classList.add("updated");
            }
            const modTime = performance.now() - modStart;

            // Removal
            const remStart = performance.now();
            container.innerHTML = "";
            const remTime = performance.now() - remStart;

            document.body.removeChild(container);

            return {
                status: "AVAILABLE",
                total_time_ms: performance.now() - start,
                results: {
                    elements: numElements,
                    create_insert_ms: createTime,
                    query_ms: queryTime,
                    found_elements: foundCount,
                    modify_ms: modTime,
                    remove_ms: remTime
                }
            };
        } catch (e) {
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
