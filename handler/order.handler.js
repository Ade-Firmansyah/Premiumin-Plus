const fs = require('fs')
const path = require('path')
const payment = require('../service/payment/payment.service')
const premku = require('../service/premku/premku.service')
const { logInfo, logError } = require('../utils/logger')

const pendingPath = path.join(__dirname, '../database/pending.json')

function readDB() {
    if (!fs.existsSync(pendingPath)) return {}
    const raw = fs.readFileSync(pendingPath, 'utf8').trim()
    return raw ? JSON.parse(raw) : {}
}

function saveDB(data) {
    fs.writeFileSync(pendingPath, JSON.stringify(data, null, 2))
}

async function checkOrders(client) {
    let db = readDB()

    for (const key in db) {
        const trx = db[key]

        if (trx.status !== 'WAITING') continue

        try {
            const pay = await payment.checkDeposit(
                process.env.API_KEY,
                trx.invoice_pay
            )
            console.log('Check payment for', key, ':', pay)

            if (pay.data?.status === 'success') {
                console.log('Payment success for', key, '- creating order')

                // 🔥 ORDER KE PREMKU
                const order = await premku.createOrder(
                    process.env.API_KEY,
                    trx.product_id,
                    1,
                    key
                )
                console.log('Order response:', order)

                if (!order.success) {
                    console.log('Order failed:', order.message)
                    continue
                }

                const status = await premku.checkOrder(
                    process.env.API_KEY,
                    order.invoice
                )
                console.log('Check order status:', status)

                if (status.status === 'success' && status.accounts && status.accounts.length > 0) {
                    const acc = status.accounts[0]

                    // Parse password and note from API response
                    const passwordParts = acc.password.split(' - ')
                    const password = passwordParts[0]
                    const note = passwordParts.slice(1).join(' - ')

                    if (trx.qr_message_id && typeof client.deleteMessage === 'function') {
                        try {
                            await client.deleteMessage(trx.user, trx.qr_message_id, false)
                            logInfo('Deleted QR image message for order', { invoice: key })
                        } catch (deleteError) {
                            logError('Could not delete QR message', { invoice: key, error: deleteError.message })
                        }
                    }

                    await client.sendMessage(trx.user,
`✅ *PEMBAYARAN BERHASIL*

📦 Produk: ${status.product}
💰 Total: Rp ${trx.total?.toLocaleString('id-ID') || '-'}

📧 Email: ${acc.username}
🔑 Password: ${password}

📄 Invoice: ${key}
${note ? `\n📝 *Catatan:* ${note}` : ''}

Terima kasih telah menggunakan *Premiumin Plus* 🚀`
                    )

                    db[key].status = 'SUCCESS'
                    logInfo('Order completed successfully', { invoice: key })
                } else {
                    logInfo('Order not ready yet', { invoice: key, status: status.status })
                }
            } else if (pay.data?.status === 'expired' || pay.data?.status === 'failed') {
                db[key].status = 'EXPIRED'
                console.log('Payment expired for', key)
            }
        } catch (error) {
            console.error('Error checking order', key, ':', error.message)
        }
    }

    saveDB(db)
}

module.exports = { checkOrders }