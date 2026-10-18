# Image untuk server compile: Python + arduino-cli + core Arduino AVR.
# Dipakai saat deploy, supaya server online punya lingkungan yang sama
# persis di mana pun dijalankan.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pasang arduino-cli
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh

# Jalankan sebagai user biasa (bukan root) untuk membatasi kerusakan
# kalau ada yang berhasil menyalahgunakan compiler
RUN useradd --create-home app
USER app
WORKDIR /home/app
ENV PATH="/home/app/.local/bin:${PATH}"

# Pasang core Arduino AVR (sama seperti "arduino-cli core install" di Windows)
RUN arduino-cli core update-index && arduino-cli core install arduino:avr
# Library untuk contoh sketch. "DHT sensor library" butuh "Adafruit Unified Sensor"
RUN arduino-cli lib install Servo LiquidCrystal "DHT sensor library" "Adafruit Unified Sensor"

# Compile sketch kosong sekali saat build, supaya cache core sudah siap
# dan compile pertama pengguna tidak lambat
RUN mkdir -p /tmp/warm/warm \
    && printf 'void setup(){}\nvoid loop(){}\n' > /tmp/warm/warm/warm.ino \
    && arduino-cli compile --fqbn arduino:avr:uno /tmp/warm/warm \
    && rm -rf /tmp/warm

COPY --chown=app requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
COPY --chown=app main.py .

# Banyak layanan hosting menentukan port lewat variabel PORT
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]