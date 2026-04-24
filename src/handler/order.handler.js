const { API_KEY } = require('../config')
const payment = require('../service/payment.service')
const premku = require('../service/premku.service')
const db = require('../../database/db')
const { logInfo, logError } = require('../utils/logger')
const { formatCurrency } = require('../utils/format')
const qrcode = require('qrcode')
const crypto = require('crypto')

let isProcessingOrders = false
let isExpiringOrders = false

// Cache in-memory untuk transaksi QR (ringan, auto cleanup)
const qrTransactions = new Map()
const lastUserOrder = new Map() // Anti-spam: track last order per user
const CLEANUP_INTERVAL = 10 * 60 * 1000 // 10 menit
const CHECK_INTERVAL = 15 * 1000 // 15 detik
const ORDER_COOLDOWN = 30 * 1000 // 30 detik anti-spam

// Auto cleanup transaksi lama
setInterval(() => {
  const now = Date.now()
  for (const [invoice, data] of qrTransactions.entries()) {
    if (now - data.timestamp > CLEANUP_INTERVAL) {
      qrTransactions.delete(invoice)
    }
  }
}, CLEANUP_INTERVAL)

// Interval check status otomatis
setInterval(async () => {
  for (const [invoice, data] of qrTransactions.entries()) {
    if (data.status === 'pending') {
      try {
        const statusResponse = await premku.checkOrder(API_KEY, invoice)
        if (statusResponse.status === 'success' && Array.isArray(statusResponse.accounts) && statusResponse.accounts.length) {
          await fulfillQrOrder(data.client, invoice, statusResponse.accounts[0])
        }
      } catch (error) {
        logError('QR status check failed', { invoice, error: error.message })
      }
    }
  }
}, CHECK_INTERVAL)

async function processPendingOrders(client) {
  if (isProcessingOrders) return
  isProcessingOrders = true

  try {
    const orders = db.getActiveOrders()
    if (!orders.length) return

    for (const order of orders) {
      try {
        const paymentStatus = await payment.checkDeposit(API_KEY, order.invoice_pay)
        const status = paymentStatus.data?.status || paymentStatus.status || ''
        logInfo('Checking payment status', { invoice: order.invoice, status })

        if (status === 'success') {
          await fulfillOrder(client, order)
        } else if (status === 'expired' || status === 'failed') {
          db.updateOrder(order.invoice, { status: 'EXPIRED' })
          await client.sendMessage(order.user, `⏳ Pesanan ${order.invoice} kedaluwarsa. Silakan buat ulang jika masih ingin membeli.`)
        }
      } catch (error) {
        logError('Payment check failed', {
          invoice: order.invoice,
          error: error.message,
          stack: error.stack
        })
      }
    }
  } catch (error) {
    logError('Process pending orders failed', {
      error: error.message,
      stack: error.stack
    })
  } finally {
    isProcessingOrders = false
  }
}

async function fulfillOrder(client, order) {
  const existing = db.getOrder(order.invoice)
  if (!existing || existing.status !== 'WAITING') {
    return
  }

  try {
    const orderResponse = await premku.createOrder(API_KEY, order.product_id, 1, order.invoice)
    if (!orderResponse.success) {
      logError('Premku order creation failed', {
        invoice: order.invoice,
        response: orderResponse
      })
      return
    }

    const statusResponse = await premku.checkOrder(API_KEY, orderResponse.invoice)
    if (statusResponse.status !== 'success' || !Array.isArray(statusResponse.accounts) || !statusResponse.accounts.length) {
      logInfo('Order not ready yet', { invoice: order.invoice, status: statusResponse.status })
      return
    }

    const account = statusResponse.accounts[0]
    const [password, ...noteParts] = (account.password || '').split(' - ')
    const note = noteParts.filter(Boolean).join(' - ')

    try {
      if (order.qr_message_id && typeof client.deleteMessage === 'function') {
        await client.deleteMessage(order.user, order.qr_message_id, false)
      }
    } catch (deleteError) {
      logError('Failed to remove QR message', {
        invoice: order.invoice,
        error: deleteError.message
      })
    }

    const successMessage =
`✅ *PEMBAYARAN BERHASIL*\n\n📦 Produk: *${order.product_name}*\n💰 Total: Rp *${formatCurrency(order.total)}*\n\n📧 Username: ${account.username}\n🔑 Password: ${password || '-'}\n${note ? `\n📝 Catatan: ${note}` : ''}\n\n📄 Invoice: *${order.invoice}*\n\nTerima kasih telah menggunakan *Premiumin Plus* 🚀`

    try {
      await client.sendMessage(order.user, successMessage)
      db.updateOrder(order.invoice, { status: 'SUCCESS' })
      logInfo('Order fulfilled', { invoice: order.invoice })
    } catch (sendError) {
      logError('Failed to send success message', {
        invoice: order.invoice,
        error: sendError.message
      })
      // Still mark as success since account was delivered
      db.updateOrder(order.invoice, { status: 'SUCCESS' })
    }
  } catch (error) {
    logError('Fulfill order failed', {
      invoice: order.invoice,
      error: error.message,
      stack: error.stack
    })
  }
}

async function expireOldOrders(client) {
  if (isExpiringOrders) return
  isExpiringOrders = true
  try {
    const orders = db.getActiveOrders()
    const now = Date.now()

    for (const order of orders) {
      if (now - order.created_at > 5 * 60 * 1000) {
        db.updateOrder(order.invoice, { status: 'EXPIRED' })
        await client.sendMessage(order.user, `⏳ Waktu pembayaran untuk ${order.invoice} telah berakhir. Silakan buat kembali jika masih ingin membeli.`)
        logInfo('Order expired due timeout', { invoice: order.invoice })
      }
    }
  } catch (error) {
    logError('Order expiration failed', error)
  } finally {
    isExpiringOrders = false
  }
}

function startOrderWatcher(client) {
  // Increased intervals to reduce CPU load
  // Check pending orders every 15 seconds (was 10)
  const orderCheckInterval = setInterval(() => {
    processPendingOrders(client).catch(error => logError('Pending order checker failed', error))
  }, 15 * 1000)

  // Check expiring orders every 90 seconds (was 60)
  const expirationInterval = setInterval(() => {
    expireOldOrders(client).catch(error => logError('Order expiration failed', error))
  }, 90 * 1000)

  // Cleanup function for graceful shutdown
  return {
    stop: () => {
      clearInterval(orderCheckInterval)
      clearInterval(expirationInterval)
    }
  }
}

// Fungsi baru: Generate ref_id unik untuk anti-duplicate
function generateRefId() {
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex')
  return `${timestamp}-${random}`
}

// Fungsi baru: Create order dengan QR payment
async function createQrOrder(client, userId, productId, productName, total) {
  try {
    // Anti-spam: Check last order
    const lastOrder = lastUserOrder.get(userId)
    if (lastOrder && Date.now() - lastOrder < ORDER_COOLDOWN) {
      await client.sendMessage(userId, '⏳ Tunggu 30 detik sebelum membuat order baru untuk menghindari spam.')
      return
    }

    // Generate unique ref_id
    const refId = generateRefId()

    // Create order via API Premku
    const orderResponse = await premku.createOrder(API_KEY, productId, 1, refId)

    if (!orderResponse.success) {
      logError('QR Order creation failed', { userId, productId, response: orderResponse })
      await client.sendMessage(userId, `❌ Gagal membuat order: ${orderResponse.message || 'Unknown error'}`)
      return
    }

    const invoice = orderResponse.invoice

    // Generate QR code (simulasi - bisa diganti dengan API jika ada)
    const qrData = `PAY:${invoice}:${total}` // Simulasi data QR
    const qrCodeUrl = await qrcode.toDataURL(qrData)

    // Simpan transaksi di cache
    qrTransactions.set(invoice, {
      userId,
      invoice,
      status: 'pending',
      product: { id: productId, name: productName },
      total,
      timestamp: Date.now(),
      client
    })

    // Update last order untuk anti-spam
    lastUserOrder.set(userId, Date.now())

    // Kirim invoice dan QR ke user
    const message = `🛒 *ORDER BARU*\n\n📦 Produk: ${productName}\n💰 Total: Rp ${formatCurrency(total)}\n📄 Invoice: ${invoice}\n\n🔗 QR Code: ${qrCodeUrl}\n\nSilakan scan QR untuk pembayaran. Bot akan cek status otomatis.`

    await client.sendMessage(userId, message)
    logInfo('QR Order created', { invoice, userId, productId })

  } catch (error) {
    logError('Create QR order failed', { userId, productId, error: error.message })
    await client.sendMessage(userId, '❌ Terjadi kesalahan saat membuat order. Coba lagi nanti.')
  }
}

// Fungsi baru: Fulfill QR order saat status success
async function fulfillQrOrder(client, invoice, account) {
  const transaction = qrTransactions.get(invoice)
  if (!transaction) return

  try {
    const [password, ...noteParts] = (account.password || '').split(' - ')
    const note = noteParts.filter(Boolean).join(' - ')

    const successMessage =
`✅ *PEMBAYARAN BERHASIL*\n\n📦 Produk: *${transaction.product.name}*\n💰 Total: Rp *${formatCurrency(transaction.total)}*\n\n📧 Username: ${account.username}\n🔑 Password: ${password || '-'}\n${note ? `\n📝 Catatan: ${note}` : ''}\n\n📄 Invoice: *${invoice}*\n\nTerima kasih telah menggunakan *Premiumin Plus* 🚀`

    await client.sendMessage(transaction.userId, successMessage)

    // Update status dan hapus dari cache
    transaction.status = 'success'
    qrTransactions.delete(invoice)

    logInfo('QR Order fulfilled', { invoice })

  } catch (error) {
    logError('Fulfill QR order failed', { invoice, error: error.message })
  }
}

module.exports = {
  startOrderWatcher,
  createQrOrder
}
