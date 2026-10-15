import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Izinkan frontend (Vite) mengakses server ini
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompileRequest(BaseModel):
    code: str


@app.post("/compile")
def compile_sketch(req: CompileRequest):
    # Folder sementara, otomatis dihapus setelah selesai
    with tempfile.TemporaryDirectory() as tmp:
        # arduino-cli mewajibkan nama folder = nama file .ino
        sketch_dir = Path(tmp) / "sketch"
        sketch_dir.mkdir()
        (sketch_dir / "sketch.ino").write_text(req.code, encoding="utf-8")

        build_dir = Path(tmp) / "build"

        try:
            result = subprocess.run(
                [
                    "arduino-cli", "compile",
                    "--fqbn", "arduino:avr:uno",
                    "--output-dir", str(build_dir),
                    str(sketch_dir),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Compile terlalu lama (timeout)."}

        if result.returncode != 0:
            # Sembunyikan path folder sementara di server
            clean = result.stderr.replace(str(sketch_dir / "sketch.ino"), "sketch.ino")
            return {"success": False, "error": clean}

        hex_content = (build_dir / "sketch.ino.hex").read_text()
        return {"success": True, "hex": hex_content}