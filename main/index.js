require('dotenv').config()

const { startWhatsApp } = require('../service/wa/wa.service')
const { handleMessage } = require('../handler/message.handler')
const { checkOrders } = require('../handler/order.handler')
const { logInfo, logError } = require('../utils/logger')

let client = null
let orderInterval = null
let restartTimeout = null

function setupClientEvents(clientInstance) {
    clientInstance.on('message', async msg => {
        await handleMessage(clientInstance, msg)
    })

    clientInstance.on('ready', () => {
        logInfo('WhatsApp client ready')
    })
}

function startOrderCheck(clientInstance) {
    if (orderInterval) clearInterval(orderInterval)
    orderInterval = setInterval(() => {
        checkOrders(clientInstance).catch(err => logError('Order check failed', err))
    }, 10000)
}

async function startBot() {
    try {
        logInfo('🚀 BOT START')

        client = startWhatsApp()
        setupClientEvents(client)
        client.initialize()
        startOrderCheck(client)
    } catch (error) {
        logError('Failed to start bot', error)
        scheduleRestart()
    }
}

function scheduleRestart() {
    if (restartTimeout) return
    restartTimeout = setTimeout(() => {
        restartTimeout = null
        logInfo('Restarting bot after failure')
        startBot()
    }, 5000)
}

process.on('uncaughtException', err => {
    logError('Uncaught exception', err)
    scheduleRestart()
})

process.on('unhandledRejection', err => {
    logError('Unhandled rejection', err)
    scheduleRestart()
})

startBot()