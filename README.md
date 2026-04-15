# 🤖 WhatsApp Bot Premiumku

Bot WhatsApp otomatis untuk jual akun premium (auto stok, auto pembayaran, auto kirim akun).

---

## 🚀 INSTALL (DARI 0)

### 1. Clone / Download Project

```bash
git clone https://github.com/digitalpanel2024-ai/wa-bot-premium.git
cd wa-bot-premium
```

---

### 2. Install Dependency

```bash
npm install
```

---

### 3. Setup ENV

Buat file `.env`

```env
API_KEY=ISI_API_PREMKU_KAMU
```

---

### 4. Jalankan Bot

```bash
node main/index.js
```

Scan QR → selesai ✅

---

## 📌 COMMAND USER

* `ping / p / cek` → test bot
* `menu` → menu utama
* `stok` → lihat produk
* `buy [id]` → beli produk

Contoh:

```bash
buy 1
```

---

## 💳 FLOW PEMBELIAN

1. User ketik `buy`
2. Bot generate harga + kode unik
3. Bot kirim QRIS
4. User bayar
5. Bot auto cek pembayaran
6. Bot auto order ke Premku
7. Bot kirim akun ke user

---

## 🔐 KEAMANAN

JANGAN upload:

* `.env`
* `sessions/`
* `node_modules/`

---

## ⚙️ LIBRARY

* whatsapp-web.js
* axios
* dotenv
* qrcode-terminal

Install manual:

```bash
npm install whatsapp-web.js axios dotenv qrcode-terminal
```

---

## 🧠 FITUR

✔ Auto stok dari Premku
✔ Auto generate pembayaran
✔ Auto cek pembayaran
✔ Auto kirim akun
✔ Anti duplicate transaksi

---

## ⚠️ NOTE

* QR kadang delay → normal
* Pastikan API_KEY benar
* Gunakan Node.js v18+

---

## 🔥 NEXT

Upgrade:

* Auto cancel 5 menit
* UI premium
* Multi API provider
* Deploy VPS 24 jam

---

🚀 Bot siap dipakai jualan otomatis
