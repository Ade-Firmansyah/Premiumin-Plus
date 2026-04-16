const fs = require('fs')
const path = require('path')
const { MessageMedia } = require('whatsapp-web.js')
const premku = require('../service/premku/premku.service')
const payment = require('../service/payment/payment.service')

const pendingPath = path.join(__dirname, '../database/pending.json')

function readDB() {
    if (!fs.existsSync(pendingPath)) return {}
    const raw = fs.readFileSync(pendingPath, 'utf8').trim()
    return raw ? JSON.parse(raw) : {}
}

function saveDB(data) {
    fs.writeFileSync(pendingPath, JSON.stringify(data, null, 2))
}

function createQrMedia(qrImage) {
    if (!qrImage) return null

    const base64 = qrImage.includes(',') ? qrImage.split(',')[1] : qrImage
    return new MessageMedia('image/png', base64)
}

function getMarginPercentage(price) {
    if (price <= 4999) return 0.79
    if (price <= 8999) return 0.59
    if (price <= 19999) return 0.19
    if (price <= 100000) return 0.10
    return 0.10
}

function calculateSaleBase(price) {
    const marginPct = getMarginPercentage(price)
    return Math.ceil(price + price * marginPct)
}

function randomCode() {
    return Math.floor(Math.random() * (349 - 119 + 1)) + 119
}

function generateUnique(base, db) {
    let final = base
    let code

    do {
        code = randomCode()
        final = base + code
    } while (Object.values(db).some(x => x.total === final && x.status === 'WAITING'))

    return { total: final, code }
}

async function handleCommand(client, msg) {
    const text = msg.body.toLowerCase().trim()

    // ================= GREETING =================
    if (['p','ping','halo','test','assalamualaikum'].includes(text)) {
        const hour = new Date().getHours()

        let greet = 'Selamat Malam 🌙'
        if (hour >= 4 && hour < 10) greet = 'Selamat Pagi 🌅'
        else if (hour < 15) greet = 'Selamat Siang ☀️'
        else if (hour < 18.5) greet = 'Selamat Sore 🌆'

        return client.sendMessage(msg.from,
`${greet}!

Selamat datang di *Premiumin Plus* 🚀  
Pusat akun premium legal, murah, dan full otomatis ⚡

Mau cari akun apa hari ini?

📌 *Menu Utama:*
• Ketik *STOK* → lihat katalog produk
• Ketik *MENU* → menu lengkap
• Ketik *ADMIN* → bantuan langsung

💸 *Mau untung lebih?*
Gabung jadi *RESELLER* dan dapat harga lebih murah!  
Bisa jual ulang dengan profit bebas 🔥

Ketik *RESELLER* untuk info lengkap.`
        )
    }

    // ================= MENU =================
    if (text === 'menu') {
        return client.sendMessage(msg.from,
`😎 *MENU PREMIUMIN PLUS*

📌 *Menu Utama:*
• ketik *stok* → cek produk tersedia
• ketik *buy* → info pembelian produk
• ketik *admin* → hubungi admin (no toxic / no rasis)
• website → SSM Panel (Beta)`
        )
    }

    if (text === 'admin') {
        return client.sendMessage(msg.from, 'WA: 083129999931')
    }

    if (text === 'website') {
        return client.sendMessage(msg.from, 'https://digitalpanelsmm.com')
    }

    if (text === 'reseller') {
        return client.sendMessage(msg.from,
`💰 *PROGRAM RESELLER PREMIUMIN PLUS*

Keuntungan jadi Reseller:
✅ Harga lebih murah 10-20%
✅ Komisi otomatis
✅ Support 24/7
✅ Produk lengkap

📊 *Tier Reseller:*
🥉 Bronze: 5 transaksi/bulan → Diskon 10%
🥈 Silver: 15 transaksi/bulan → Diskon 15%
🥇 Gold: 30 transaksi/bulan → Diskon 20%

📞 *Cara Daftar:*
1. Minimal deposit Rp 50.000
2. Chat admin untuk aktivasi
3. Dapat panel reseller pribadi

💬 Hubungi: 083129999931`
        )
    }

    // ================= STOK =================
    if (text === 'stok') {
        const res = await premku.getProducts(process.env.API_KEY)

        let msgText = '🛒 *KATALOG PREMIUMIN PLUS*\n\n'

        res.products.forEach(p => {
            if (p.stock <= 0) return

            const basePrice = calculateSaleBase(p.price)
            const code = p.id

            msgText += `📦 *${p.name}*\n`
            msgText += `📊 Stok: ${p.stock}\n`
            msgText += `💰 Rp *${basePrice.toLocaleString('id-ID')}*\n`
            msgText += `🔑 buy ${code}\n\n`
        })

        msgText += 'Ketik: buy id atau buyid\nContoh: buy 1'

        return client.sendMessage(msg.from, msgText)
    }

    // ================= BUY =================
    if (text.startsWith('buy')) {
        const match = text.match(/^buy\s*(\d+)$/i)
        const id = match ? parseInt(match[1], 10) : null

        if (!id) {
            return client.sendMessage(msg.from, '❌ Format salah. Ketik: buy 1 atau buy1')
        }

        try {
            const products = await premku.getProducts(process.env.API_KEY)
            console.log('Products fetched:', products.products.length)

            const product = products.products.find(p => p.id == id)
            if (!product) {
                console.log('Product not found for ID:', id)
                return client.sendMessage(msg.from, '❌ Produk tidak ditemukan')
            }

            let db = readDB()
            const base = calculateSaleBase(product.price)
            const { total, code } = generateUnique(base, db)

            const invoice = 'INV-' + Date.now()

            // 🔥 BUAT DEPOSIT
            const pay = await payment.createDeposit(process.env.API_KEY, total)
            console.log('Payment response:', pay)

            if (!pay.success) {
                console.log('Payment failed:', pay.message)
                return client.sendMessage(msg.from, `❌ Gagal buat pembayaran: ${pay.message || 'Unknown error'}`)
            }

            db[invoice] = {
                user: msg.from,
                product_id: id,
                total,
                code,
                invoice_pay: pay.data.invoice,
                status: 'WAITING'
            }

            saveDB(db)

            const caption =
`💳 *PEMBAYARAN PREMIUMIN PLUS*

📦 *${product.name}*
💰 Total: Rp *${total.toLocaleString('id-ID')}*
📄 Invoice: ${pay.data.invoice}

⚠️ *WAJIB bayar sesuai nominal!*
⏳ Batas waktu: 5 menit
🔄 Otomatis diproses setelah bayar

❌ cancel ${invoice}`

            const media = createQrMedia(pay.data.qr_image)
            if (media) {
                const sentMessage = await client.sendMessage(msg.from, media, { caption })
                if (sentMessage && sentMessage.id) {
                    db[invoice].qr_message_id = sentMessage.id._serialized || sentMessage.id
                    saveDB(db)
                }
                return sentMessage
            }

            return client.sendMessage(msg.from,
`${caption}

💳 QRIS:
${pay.data.qr_raw}`
            )
        } catch (error) {
            console.error('Buy error:', error.message)
            return client.sendMessage(msg.from, `❌ Terjadi kesalahan: ${error.message}`)
        }
    }

    // ================= CANCEL =================
    if (text.startsWith('cancel')) {
        const match = text.match(/^cancel\s*(INV-[0-9]+)$/i)
        const invoice = match ? match[1] : null
        if (!invoice) {
            return client.sendMessage(msg.from, '❌ Format: cancel INV-123456789')
        }

        try {
            let db = readDB()
            if (!db[invoice] || db[invoice].user !== msg.from) {
                return client.sendMessage(msg.from, '❌ Invoice tidak ditemukan atau bukan milik Anda')
            }

            if (db[invoice].status !== 'WAITING') {
                return client.sendMessage(msg.from, '❌ Invoice sudah diproses atau expired')
            }

            const cancelRes = await payment.cancelDeposit(process.env.API_KEY, db[invoice].invoice_pay)
            console.log('Cancel response:', cancelRes)

            const success = cancelRes?.success === true || cancelRes?.status === 'success' || String(cancelRes?.message || '').toLowerCase().includes('batal')
            if (success) {
                db[invoice].status = 'CANCELLED'
                saveDB(db)
                return client.sendMessage(msg.from, '✅ Pesanan dibatalkan')
            }

            const responseMessage = cancelRes?.message || cancelRes?.data?.message || 'Unknown error'
            return client.sendMessage(msg.from, `❌ Gagal cancel: ${responseMessage}`)
        } catch (error) {
            console.error('Cancel error:', error)
            return client.sendMessage(msg.from, `❌ Terjadi kesalahan: ${error.message || error}`)
        }
    }
}
module.exports = { handleCommand }

//node index.js