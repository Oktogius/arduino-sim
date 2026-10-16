import os
import re
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Pengaturan dari environment variable ---
# Di komputer sendiri tidak perlu diisi (pakai nilai default).
# Di server online, isi ALLOWED_ORIGINS dengan alamat website frontend,
# misalnya: https://arduino-sim.pages.dev
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
]
# Berapa compile boleh berjalan bersamaan (tiap compile makan CPU & RAM)
MAX_PARALLEL_COMPILES = int(os.environ.get("MAX_PARALLEL_COMPILES", "2"))
# Batas ukuran kode (karakter). Sketch biasa jauh di bawah ini.
MAX_CODE_LENGTH = 100_000

app = FastAPI()

# Izinkan frontend mengakses server ini
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["*"],
)

compile_slots = threading.Semaphore(MAX_PARALLEL_COMPILES)


class CompileRequest(BaseModel):
    code: str


# --- Pemeriksaan keamanan sederhana ---
# Compiler bisa dipakai untuk "mengintip" file server, misalnya
# #include "/etc/passwd" akan menampilkan isi file itu di pesan error.
# Pemeriksaan ini menolak trik yang umum. Ini BUKAN pertahanan utama:
# pertahanan utamanya adalah container Docker yang tidak menyimpan rahasia.
INCLUDE_PATTERN = re.compile(r'(?:#|%:)\s*include\s*([<"])([^>"]*)[>"]')
COMPUTED_INCLUDE = re.compile(r'(?:#|%:)\s*include\s+(?![<"])')
ASM_FILE_DIRECTIVE = re.compile(r"\.\s*(?:incbin|include)\b")


def check_code(code: str) -> str | None:
    """Mengembalikan pesan error kalau kode ditolak, None kalau aman."""
    if len(code) > MAX_CODE_LENGTH:
        return f"Kode terlalu panjang (maksimal {MAX_CODE_LENGTH} karakter)."

    # Samakan dulu bentuk kode seperti yang dilihat preprocessor:
    # gabungkan baris yang dipotong dengan "\" dan buang komentar /* */
    normalized = re.sub(r"\\\r?\n", "", code)
    normalized = re.sub(r"/\*.*?\*/", " ", normalized, flags=re.S)

    for match in INCLUDE_PATTERN.finditer(normalized):
        path = match.group(2).strip()
        if (
            path.startswith(("/", "\\"))
            or re.match(r"[A-Za-z]:", path)
            or ".." in path
        ):
            return f'#include "{path}" tidak diizinkan. Gunakan library, misalnya <Servo.h>.'

    if COMPUTED_INCLUDE.search(normalized):
        return "#include harus memakai <...> atau \"...\" secara langsung."

    if ASM_FILE_DIRECTIVE.search(normalized):
        return "Direktif assembler .incbin/.include tidak diizinkan."

    return None


@app.post("/compile")
def compile_sketch(req: CompileRequest):
    problem = check_code(req.code)
    if problem:
        return {"success": False, "error": problem}

    # Tolak kalau slot compile penuh, daripada server kewalahan
    if not compile_slots.acquire(blocking=False):
        return {"success": False, "error": "Server sedang sibuk, coba lagi sebentar."}

    try:
        return run_compile(req.code)
    finally:
        compile_slots.release()


def run_compile(code: str):
    # Folder sementara, otomatis dihapus setelah selesai
    with tempfile.TemporaryDirectory() as tmp:
        # arduino-cli mewajibkan nama folder = nama file .ino
        sketch_dir = Path(tmp) / "sketch"
        sketch_dir.mkdir()
        (sketch_dir / "sketch.ino").write_text(code, encoding="utf-8")
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
            # Sembunyikan path folder server dari pesan error
            clean = (
                result.stderr
                .replace(str(sketch_dir / "sketch.ino"), "sketch.ino")
                .replace(tmp, "")
                .replace(str(Path.home()), "~")
            )
            return {"success": False, "error": clean}

        hex_content = (build_dir / "sketch.ino.hex").read_text()
        return {"success": True, "hex": hex_content}