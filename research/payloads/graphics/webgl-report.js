(function() {
    const manifest = {
        name: "gfx-webgl-report",
        version: "1.0.0",
        description: "WebGL capabilities and limits",
        category: "graphics",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["WebGL"],
        estimated_duration_ms: 500
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
        let version = 2;
        if (!gl) {
            gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            version = 1;
        }

        if (!gl) {
            return { status: "UNAVAILABLE", reason: "No WebGL" };
        }

        try {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
            const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            
            const limits = {
                MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                MAX_CUBE_MAP_TEXTURE_SIZE: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
                MAX_RENDERBUFFER_SIZE: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
                MAX_VERTEX_ATTRIBS: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                MAX_VERTEX_UNIFORM_VECTORS: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                MAX_VARYING_VECTORS: gl.getParameter(gl.MAX_VARYING_VECTORS),
                MAX_COMBINED_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
                MAX_VERTEX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
                MAX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
                MAX_FRAGMENT_UNIFORM_VECTORS: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                ALIASED_LINE_WIDTH_RANGE: Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)),
                ALIASED_POINT_SIZE_RANGE: Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE))
            };

            const extensions = gl.getSupportedExtensions();

            return {
                status: "AVAILABLE",
                webgl_version: version,
                vendor: vendor,
                renderer: renderer,
                gl_version: gl.getParameter(gl.VERSION),
                shading_language_version: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                limits: limits,
                extensions: extensions,
                context_attributes: gl.getContextAttributes()
            };
        } catch (e) {
            return { status: "FAILED", error: e.message };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
