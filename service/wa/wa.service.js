const fs = require('fs')
const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const path = require('path')
const { logInfo, logError } = require('../../utils/logger')

const sessionDir = path.join(process.cwd(), 'sessions')
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true })
}

function startWhatsApp() {
    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: sessionDir
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        }
    })

    client.on('qr', qr => {
        logInfo('QR code received, waiting for scan')
        qrcode.generate(qr, { small: true })
    })

    client.on('ready', () => {
        logInfo('✅ WhatsApp Connected')
    })

    client.on('auth_failure', msg => {
        logError('❌ WhatsApp auth failure', msg)
        setTimeout(() => {
            logInfo('Reinitializing WhatsApp client after auth failure')
            client.initialize().catch(err => logError('Reinitialize failed', err))
        }, 5000)
    })

    client.on('disconnected', reason => {
        logError('🔌 WhatsApp disconnected', reason)
        setTimeout(() => {
            logInfo('Reinitializing WhatsApp client after disconnect')
            client.initialize().catch(err => logError('Reinitialize failed', err))
        }, 5000)
    })

    return client
}

module.exports = { startWhatsApp }