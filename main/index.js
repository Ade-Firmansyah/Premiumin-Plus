require('dotenv').config()

const { createClient } = require('../src/service/wa/wa.service')
const { handleIncomingMessage } = require('../src/handler/message.handler')
const { startOrderWatcher } = require('../src/handler/order.handler')
const { logInfo, logError } = require('../src/utils/logger')

let client = null
let orderInterval = null
let restartTimeout = null

function setupClientEvents(clientInstance) {
    clientInstance.on('message', async msg => {
        await handleIncomingMessage(clientInstance, msg)
    })

    clientInstance.on('ready', () => {
        logInfo('WhatsApp client ready')
        startOrderWatcher(clientInstance)
    })
}

async function startBot() {
    try {
        logInfo('🚀 BOT START')

        client = createClient()
        setupClientEvents(client)
        client.initialize()
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