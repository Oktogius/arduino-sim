// Galeri contoh: setiap contoh berisi kode DAN rangkaian.
// File ini hanya berisi data (tampilan menu ada di gallery.ts).
//
// Rangkaian ditulis dengan format teks yang sama dengan simpanan dan link
// berbagi (circuit.ts), misalnya "led-13-red.button-2-green.pot-A0".
// Teks ini tetap diperiksa decodeCircuit() saat dimuat, sama seperti data
// dari link, jadi salah ketik di sini tidak bisa merusak papan.

export interface Example {
  id: string; // nama pendek, unik
  title: string; // judul di menu
  group: string; // judul kelompok di menu
  summary: string; // satu kalimat di menu
  howTo: string; // cara mencoba, tampil di bawah toolbar setelah dimuat
  libraries: string[]; // library Arduino yang dibutuhkan, misalnya ["Servo"]
  bounce?: boolean; // true = mode Bouncing dinyalakan saat contoh dimuat
  plotter?: boolean; // true = tab Serial Plotter dibuka saat contoh dimuat
  circuit: string; // rangkaian dalam format teks circuit.ts
  code: string;
}

const DASAR = "Dasar";
const TOMBOL = "Tombol";
const SENSOR = "Sensor";
const LIBRARY = "Butuh library";

export const EXAMPLES: readonly Example[] = [
  {
    id: "bawaan",
    title: "Contoh bawaan",
    group: DASAR,
    summary:
      "Kecepatan kedip LED diatur potensiometer, tombol membuatnya menyala terus.",
    howTo:
      "Geser slider potensiometer untuk mengubah kecepatan kedip. Tahan tombol: LED menyala terus.",
    libraries: [],
    circuit: "led-13-red.button-2-green.pot-A0",
    code: `// Putar potensiometer untuk mengatur kecepatan kedip LED.
// Tahan tombol untuk membuat LED menyala terus.
void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  int pot = analogRead(A0);              // 0..1023
  bool ditekan = digitalRead(2) == LOW;

  Serial.print("A0 = ");
  Serial.print(pot);
  Serial.println(ditekan ? "  [tombol ditekan]" : "");

  if (ditekan) {
    digitalWrite(13, HIGH);
    delay(100);
  } else {
    int jeda = pot / 4 + 50;             // 50..305 ms
    digitalWrite(13, HIGH);
    delay(jeda);
    digitalWrite(13, LOW);
    delay(jeda);
  }
}
`,
  },
  {
    id: "blink",
    title: "Blink",
    group: DASAR,
    summary:
      "LED pin 13 menyala 1 detik, mati 1 detik. Program pertama di Arduino.",
    howTo:
      "Klik Compile & Run. LED berkedip setiap 1 detik. Coba ubah angka delay.",
    libraries: [],
    circuit: "led-13-red",
    code: `// Blink: LED di pin 13 menyala 1 detik, mati 1 detik, berulang terus.
void setup() {
  pinMode(13, OUTPUT);      // pin 13 dipakai sebagai output
}

void loop() {
  digitalWrite(13, HIGH);   // LED menyala
  delay(1000);              // tunggu 1000 ms = 1 detik
  digitalWrite(13, LOW);    // LED mati
  delay(1000);
}
`,
  },
  {
    id: "fade",
    title: "Fade (PWM)",
    group: DASAR,
    summary: "LED pin 9 perlahan terang lalu redup dengan analogWrite().",
    howTo:
      "LED terang-redup bergantian, angka PWM di bawah LED naik-turun 0-100%.",
    libraries: [],
    circuit: "led-9-yellow",
    code: `// Fade: LED di pin 9 perlahan terang lalu redup, memakai PWM.
// analogWrite() hanya berfungsi di pin bertanda ~ (3, 5, 6, 9, 10, 11).
const int LED = 9;
int terang = 0;    // 0 = mati, 255 = terang penuh
int langkah = 5;   // perubahan kecerahan setiap putaran loop

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  analogWrite(LED, terang);
  terang += langkah;
  if (terang <= 0 || terang >= 255) {
    langkah = -langkah;   // sampai di ujung: balik arah
  }
  delay(30);
}
`,
  },
  {
    id: "lalu-lintas",
    title: "Lampu lalu lintas",
    group: DASAR,
    summary: "Tiga LED bergantian: hijau, kuning, merah.",
    howTo:
      "Hijau 4 detik, kuning 1,5 detik, merah 4 detik, berulang. Namanya juga tampil di Serial Monitor.",
    libraries: [],
    circuit: "led-12-red.led-11-yellow.led-10-green",
    code: `// Lampu lalu lintas: hijau -> kuning -> merah, berulang.
const int MERAH = 12;
const int KUNING = 11;
const int HIJAU = 10;

// Nyalakan satu lampu saja, matikan yang lain, lalu tunggu
void nyalakan(int pin, const char *nama, unsigned long lama) {
  digitalWrite(MERAH, pin == MERAH ? HIGH : LOW);
  digitalWrite(KUNING, pin == KUNING ? HIGH : LOW);
  digitalWrite(HIJAU, pin == HIJAU ? HIGH : LOW);
  Serial.println(nama);
  delay(lama);
}

void setup() {
  Serial.begin(9600);
  pinMode(MERAH, OUTPUT);
  pinMode(KUNING, OUTPUT);
  pinMode(HIJAU, OUTPUT);
}

void loop() {
  nyalakan(HIJAU, "HIJAU: jalan", 4000);
  nyalakan(KUNING, "KUNING: hati-hati", 1500);
  nyalakan(MERAH, "MERAH: berhenti", 4000);
}
`,
  },
  {
    id: "plotter",
    title: "Serial Plotter",
    group: DASAR,
    summary: "Nilai potensiometer dan gelombang sinus digambar sebagai grafik.",
    howTo:
      "Tab Serial Plotter sudah dibuka. Klik Compile & Run, lalu geser slider potensiometer: " +
      "garis pot ikut naik-turun, garis sinus bergelombang terus.",
    libraries: [],
    plotter: true,
    circuit: "pot-A0",
    code: `// Serial Plotter: dua garis di grafik.
// Format: nama:nilai, dipisah koma, satu baris (println) = satu titik.
void setup() {
  Serial.begin(9600);
}

void loop() {
  float t = millis() / 1000.0;              // waktu dalam detik
  int gelombang = 512 + 400 * sin(t * 3);   // gelombang sinus 112..912

  Serial.print("pot:");
  Serial.print(analogRead(A0));
  Serial.print(",sinus:");
  Serial.println(gelombang);
  delay(20);
}
`,
  },
  {
    id: "tombol-led",
    title: "Tombol + LED",
    group: TOMBOL,
    summary:
      "LED menyala selama tombol ditekan (digitalRead dan INPUT_PULLUP).",
    howTo: "Tahan tombol: LED menyala. Lepas: LED mati.",
    libraries: [],
    circuit: "led-13-red.button-2-green",
    code: `// Tombol + LED: LED menyala selama tombol ditekan.
// Tombol dipasang ke GND dan memakai INPUT_PULLUP:
// dilepas = HIGH, ditekan = LOW (active low).
const int TOMBOL = 2;
const int LED = 13;

void setup() {
  pinMode(TOMBOL, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (digitalRead(TOMBOL) == LOW) {   // LOW = sedang ditekan
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
`,
  },
  {
    id: "debounce",
    title: "Debounce",
    group: TOMBOL,
    summary:
      "Satu tekan = satu hitungan, walaupun kontak tombol bergetar. Mode Bouncing ikut menyala.",
    howTo:
      "Mode Bouncing dinyalakan. Setiap tekan, LED berganti nyala/mati dan hitungan bertambah 1. " +
      "Ubah PAKAI_DEBOUNCE menjadi false lalu Run lagi: satu tekan bisa terhitung beberapa kali.",
    libraries: [],
    bounce: true,
    circuit: "led-13-green.button-2-green",
    code: `// Debounce: setiap tekan tombol menyalakan/mematikan LED (toggle).
// Mode Bouncing sudah dinyalakan: kontak tombol bergetar 1-5 ms seperti
// tombol asli. Coba ubah PAKAI_DEBOUNCE menjadi false, lalu Compile & Run:
// satu tekan bisa terhitung beberapa kali dan LED jadi tidak menentu.
const bool PAKAI_DEBOUNCE = true;
const unsigned long JEDA_DEBOUNCE = 20;  // ms, lebih lama dari getaran terpanjang

const int TOMBOL = 2;
const int LED = 13;

int hitung = 0;
bool ledNyala = false;
int stabil = HIGH;           // kondisi tombol yang sudah dipercaya
int bacaanTerakhir = HIGH;   // bacaan mentah sebelumnya
unsigned long waktuBerubah = 0;

void setup() {
  Serial.begin(9600);
  pinMode(TOMBOL, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.println(PAKAI_DEBOUNCE ? "Debounce: AKTIF" : "Debounce: MATI");
}

void loop() {
  int s = digitalRead(TOMBOL);
  if (s != bacaanTerakhir) {   // sinyal masih bergerak: mulai hitung ulang
    waktuBerubah = millis();
    bacaanTerakhir = s;
  }

  // Tanpa debounce, setiap getaran langsung dianggap tekanan baru
  bool sudahStabil = !PAKAI_DEBOUNCE || millis() - waktuBerubah > JEDA_DEBOUNCE;

  if (sudahStabil && s != stabil) {
    stabil = s;
    if (stabil == LOW) {       // baru saja ditekan
      hitung++;
      ledNyala = !ledNyala;
      digitalWrite(LED, ledNyala ? HIGH : LOW);
      Serial.print("Ditekan: ");
      Serial.println(hitung);
    }
  }
}
`,
  },
  {
    id: "led-berjalan",
    title: "LED berjalan",
    group: TOMBOL,
    summary:
      "Empat LED menyala bergiliran. Tombol pin 2 membalik arah, pin 3 mengganti kecepatan.",
    howTo:
      "Tekan tombol hijau (pin 2) untuk membalik arah, tombol merah (pin 3) untuk cepat/lambat.",
    libraries: [],
    circuit:
      "led-10-red.led-11-yellow.led-12-green.led-13-blue.button-2-green.button-3-red",
    code: `// LED berjalan: empat LED menyala bergiliran.
// Tombol pin 2 = balik arah, tombol pin 3 = ganti kecepatan.
const int LED[] = {10, 11, 12, 13};
int posisi = 0, arah = 1, jeda = 200;
int lalu2 = HIGH, lalu3 = HIGH;
unsigned long terakhirGeser = 0;

void setup() {
  for (int i = 0; i < 4; i++) pinMode(LED[i], OUTPUT);
  pinMode(2, INPUT_PULLUP);
  pinMode(3, INPUT_PULLUP);
  digitalWrite(LED[posisi], HIGH);  // LED pertama langsung menyala
}

void loop() {
  int t2 = digitalRead(2), t3 = digitalRead(3);
  if (t2 == LOW && lalu2 == HIGH) arah = -arah;                    // baru ditekan
  if (t3 == LOW && lalu3 == HIGH) jeda = (jeda == 200) ? 60 : 200;
  lalu2 = t2;
  lalu3 = t3;

  // millis(), bukan delay(), supaya tombol tetap terbaca saat menunggu
  if (millis() - terakhirGeser >= jeda) {
    terakhirGeser = millis();
    digitalWrite(LED[posisi], LOW);
    posisi = (posisi + arah + 4) % 4;
    digitalWrite(LED[posisi], HIGH);
  }

  delay(10);  // debounce sederhana, lebih lama dari getaran terpanjang
}
`,
  },
  {
    id: "ldr",
    title: "LDR: lampu otomatis",
    group: SENSOR,
    summary:
      "LED menyala sendiri saat gelap. Nilai lux dihitung dari analogRead().",
    howTo:
      "Geser slider Cahaya ke kiri (gelap, di bawah 50 lux): LED menyala. " +
      "Nilai lux juga tampil di Serial Monitor dan Serial Plotter.",
    libraries: [],
    circuit: "ldr-A0.led-13-yellow",
    code: `// LDR: LED menyala otomatis saat gelap.
// Rumus lux sama dengan modul fotoresistor di Wokwi.
const float GAMMA = 0.7;
const float RL10 = 50;   // hambatan LDR (kΩ) pada 10 lux

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
}

void loop() {
  int nilai = analogRead(A0);          // gelap = besar, terang = kecil
  float tegangan = nilai / 1024.0 * 5;
  float hambatan = 2000 * tegangan / (1 - tegangan / 5);
  float lux = pow(RL10 * 1e3 * pow(10, GAMMA) / hambatan, 1 / GAMMA);

  digitalWrite(13, lux < 50 ? HIGH : LOW);   // gelap: lampu menyala
  Serial.print("lux:");
  Serial.println(lux);
  delay(200);
}
`,
  },
  {
    id: "hc-sr04",
    title: "HC-SR04: ukur jarak",
    group: SENSOR,
    summary:
      "Jarak benda diukur dengan pulseIn(). LED menyala kalau benda lebih dekat dari 20 cm.",
    howTo:
      "Geser slider Jarak: angka di Serial Monitor mengikuti. Di bawah 20 cm, LED menyala.",
    libraries: [],
    circuit: "ultrasonic-9-10.led-13-red",
    code: `// HC-SR04: mengukur jarak dengan gelombang ultrasonik.
// LED menyala kalau ada benda lebih dekat dari 20 cm.
const int TRIG = 9;
const int ECHO = 10;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(13, OUTPUT);
}

void loop() {
  // Pulsa 10 µs di TRIG memulai pengukuran
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // ECHO HIGH selama gelombang pergi lalu memantul kembali (dalam µs)
  long durasi = pulseIn(ECHO, HIGH);
  float jarak = durasi / 58.0;        // sekitar 58 µs per cm (pergi-pulang)

  digitalWrite(13, jarak < 20 ? HIGH : LOW);
  Serial.print("jarak:");
  Serial.println(jarak);
  delay(100);
}
`,
  },
  {
    id: "dht22",
    title: "DHT22: suhu & kelembapan",
    group: SENSOR,
    summary:
      "Membaca suhu dan kelembapan setiap 2 detik dengan library DHT dari Adafruit.",
    howTo:
      "Geser slider Suhu dan Lembap: nilai baru terbaca paling lambat 2 detik kemudian " +
      "(DHT22 memang hanya boleh dibaca tiap 2 detik). Coba juga tab Serial Plotter.",
    libraries: ["DHT"],
    circuit: "dht22-2",
    code: `// DHT22: membaca suhu dan kelembapan.
// Butuh library "DHT sensor library" dari Adafruit.
#include <DHT.h>

DHT dht(2, DHT22);   // pin data 2, jenis sensor DHT22

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);                        // DHT22 hanya boleh dibaca tiap 2 detik
  float suhu = dht.readTemperature();   // °C
  float lembap = dht.readHumidity();    // %
  if (isnan(suhu) || isnan(lembap)) {
    Serial.println("Gagal membaca DHT22, periksa kabel dan pin");
    return;
  }
  Serial.print("suhu:");
  Serial.print(suhu);
  Serial.print(",kelembapan:");
  Serial.println(lembap);
}
`,
  },
  {
    id: "servo-pot",
    title: "Servo + Potensiometer",
    group: LIBRARY,
    summary: "Lengan servo pin 9 mengikuti putaran potensiometer A0.",
    howTo:
      "Geser slider potensiometer: lengan servo ikut berputar 0-180°, sudutnya juga tampil di Serial Monitor.",
    libraries: ["Servo"],
    circuit: "servo-9.pot-A0",
    code: `// Servo + Potensiometer: lengan servo mengikuti putaran potensiometer.
// Butuh library Servo.
#include <Servo.h>

Servo servo;

void setup() {
  Serial.begin(9600);
  servo.attach(9);       // sinyal servo di pin 9
}

void loop() {
  int pot = analogRead(A0);                // 0..1023
  int sudut = map(pot, 0, 1023, 0, 180);   // ubah ke 0..180 derajat
  servo.write(sudut);
  Serial.println(sudut);
  delay(20);
}
`,
  },
  {
    id: "lcd-hello",
    title: "LCD Hello",
    group: LIBRARY,
    summary:
      "Tulisan, karakter buatan (hati), nilai A0, dan detik berjalan di LCD 16x2.",
    howTo:
      "Baris 1: Halo, Arduino! dan ikon hati. Baris 2: nilai A0 (geser slider) dan detik. " +
      "Perhatikan setCursor() setelah createChar().",
    libraries: ["LiquidCrystal"],
    circuit: "lcd-12-11-5-4-3-2.pot-A0",
    code: `// LCD Hello: tulisan, karakter buatan, dan angka di LCD 16x2.
// Butuh library LiquidCrystal.
#include <LiquidCrystal.h>

// Urutan pin: RS, E, D4, D5, D6, D7 (sama dengan dropdown di LCD)
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

byte hati[8] = {
  0b00000, 0b01010, 0b11111, 0b11111,
  0b11111, 0b01110, 0b00100, 0b00000
};

void setup() {
  lcd.begin(16, 2);
  lcd.createChar(0, hati);
  // createChar() meninggalkan alamat tulis di memori karakter (CGRAM).
  // Tanpa setCursor() di sini, tulisan berikutnya tidak tampil di layar.
  lcd.setCursor(0, 0);
  lcd.print("Halo, Arduino!");
  lcd.setCursor(15, 0);
  lcd.write(byte(0));    // karakter buatan nomor 0 (hati)
}

void loop() {
  lcd.setCursor(0, 1);   // kolom 0, baris 2
  lcd.print("A0=");
  lcd.print(analogRead(A0));
  lcd.print("   ");      // hapus sisa angka lama yang lebih panjang
  lcd.setCursor(10, 1);
  lcd.print(millis() / 1000);
  lcd.print("s");
  delay(100);
}
`,
  },
];

// Contoh yang dipakai saat belum ada kode tersimpan
export const DEFAULT_EXAMPLE = EXAMPLES[0];
