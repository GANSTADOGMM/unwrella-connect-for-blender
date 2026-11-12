<!-- coderabbit-ai-generated:v1 -->

# Unwrella Studio

A local web workspace for Blender's Smart UV Project. Upload an OBJ, adjust the projection settings, unwrap it, and download an OBJ containing the new UV coordinates. The built-in sample is available on startup. Material libraries are not imported or exported; the output contains geometry, normals, and UVs.

## Run locally

Requires Node.js 20 or later, Python 3.11, and the Blender 4.2.0 Python module. For example, on Linux x86-64:

```sh
cd web
npm install
python3.11 -m venv .venv
.venv/bin/pip install bpy==4.2.0
BLENDER_PYTHON="$PWD/.venv/bin/python" npm start
```

Open http://localhost:3000. Set `PORT` to change the port. `BLENDER_PYTHON` must point to a Python executable with `bpy` installed. Run the API integration tests with `BLENDER_PYTHON="$PWD/.venv/bin/python" npm test`.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:543be5af6df6b8f2ca189eced0154017767168da5bd26cfa61f757667dede27c -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b6c0d4f1c028b4369a53d6224bf3641400371cd273d4e0802557bc03b2eea42a -->

Uploads are processed in temporary directories and removed after processing. The server is designed for a trusted local environment; it does not include authentication or user accounts and binds to loopback by default. For remote access, use an authenticated and encrypted boundary, such as an HTTPS reverse proxy or encrypted VPN. Set `HOST` to the required address and `PUBLIC_ORIGIN` to the exact browser-facing origin (for example, `https://studio.example.com`). OBJ files are limited to 10 MB. The worker runs for at most two minutes, with up to two concurrent requests including uploads.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->