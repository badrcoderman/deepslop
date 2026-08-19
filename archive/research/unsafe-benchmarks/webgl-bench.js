(function() {
    const manifest = {
        name: "gfx-webgl-bench",
        version: "1.0.0",
        description: "WebGL rendering throughput",
        category: "graphics",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["WebGL"],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        if (typeof document === 'undefined' || !document.createElement) {
            return { status: "UNAVAILABLE", reason: "No DOM" };
        }
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) {
            return { status: "UNAVAILABLE", reason: "No getContext" };
        }
        
        let gl = canvas.getContext('webgl2');
        if (!gl) gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { status: "UNAVAILABLE", reason: "No WebGL" };

        canvas.width = 1920;
        canvas.height = 1080;
        gl.viewport(0, 0, canvas.width, canvas.height);

        try {
            const vsSource = `
                attribute vec4 aVertexPosition;
                void main() {
                    gl_Position = aVertexPosition;
                }
            `;
            const fsSource = `
                precision mediump float;
                uniform vec4 uColor;
                void main() {
                    gl_FragColor = uColor;
                }
            `;
            
            function loadShader(gl, type, source) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
                }
                return shader;
            }

            const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
            const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error("Program link error: " + gl.getProgramInfoLog(program));
            }

            const positionAttributeLocation = gl.getAttribLocation(program, "aVertexPosition");
            const colorUniformLocation = gl.getUniformLocation(program, "uColor");

            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            const positions = [
                -0.5,  0.5,
                 0.5,  0.5,
                -0.5, -0.5,
                 0.5, -0.5,
            ];
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

            const timeout = opts.timeout_ms || 10000;
            const start = performance.now();
            let frames = 0;
            let drawCalls = 0;

            gl.useProgram(program);
            gl.enableVertexAttribArray(positionAttributeLocation);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

            while (performance.now() - start < timeout) {
                gl.clearColor(0.0, 0.0, 0.0, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                for (let i = 0; i < 500; i++) {
                    gl.uniform4f(colorUniformLocation, (i % 10) / 10, ((i*2) % 10) / 10, ((i*3) % 10) / 10, 1.0);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    drawCalls++;
                }

                gl.finish();
                frames++;
            }

            const duration = performance.now() - start;

            gl.deleteBuffer(positionBuffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);

            return {
                status: "AVAILABLE",
                duration_ms: duration,
                frames: frames,
                fps: (frames / (duration / 1000)),
                draw_calls: drawCalls,
                draw_calls_per_sec: (drawCalls / (duration / 1000))
            };
        } catch (e) {
            return { status: "FAILED", error: e.message };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
