(function() {
    const manifest = {
        name: "net-info",
        version: "1.0.0",
        description: "Network interfaces and IPv6 tests",
        category: "network",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 2000
    };

    async function run(opts) {
        let results = {
            status: "AVAILABLE",
            online: typeof navigator !== 'undefined' ? navigator.onLine : null,
            connection: null,
            webrtc_supported: typeof RTCPeerConnection !== 'undefined',
            local_ips: []
        };

        if (typeof navigator !== 'undefined' && navigator.connection) {
            results.connection = {
                type: navigator.connection.type || null,
                effectiveType: navigator.connection.effectiveType || null,
                downlink: navigator.connection.downlink || null,
                rtt: navigator.connection.rtt || null,
                saveData: navigator.connection.saveData !== undefined ? navigator.connection.saveData : null
            };
        }

        if (results.webrtc_supported) {
            try {
                const ips = await new Promise((resolve) => {
                    const localIps = [];
                    const pc = new RTCPeerConnection({ iceServers: [] });
                    
                    try {
                        pc.createDataChannel("");
                    } catch (e) {
                        // Ignore
                    }
                    
                    pc.onicecandidate = (event) => {
                        if (!event.candidate) {
                            resolve(localIps);
                            return;
                        }
                        const candidate = event.candidate.candidate;
                        const match = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(candidate);
                        if (match && localIps.indexOf(match[1]) === -1) {
                            // Exclude mDNS local hostnames like xxx.local, but regex above only matches IP formats anyway
                            localIps.push(match[1]);
                        }
                    };
                    
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .catch(err => resolve(localIps));

                    // Use a short timeout of 1000ms for WebRTC gathering
                    const timeoutMs = opts.timeout_ms ? Math.min(opts.timeout_ms, 1500) : 1000;
                    setTimeout(() => {
                        try {
                            pc.close();
                        } catch(e) {}
                        resolve(localIps);
                    }, timeoutMs);
                });
                results.local_ips = ips;
            } catch (e) {
                if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                    DSResearch.log("WebRTC IP collection failed: " + e.message);
                }
            }
        }

        return results;
    }

    if (typeof DSResearch !== "undefined") {
        DSResearch.register(manifest, run);
    }
})();
