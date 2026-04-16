const { handleCommand } = require('./command.handler')
const { logInfo, logError } = require('../utils/logger')

const messageQueue = []
let isProcessing = false

async function processQueue(client) {
    if (isProcessing) return
    isProcessing = true

    while (messageQueue.length > 0) {
        const next = messageQueue.shift()
        try {
            logInfo('Processing queued message', { from: next.msg.from, body: next.msg.body })
            await handleCommand(client, next.msg)
        } catch (error) {
            logError('Error processing queued message', { error: error.message, body: next.msg.body })
        }
    }

    isProcessing = false
}

async function handleMessage(client, msg) {
    if (!msg.body) return
    messageQueue.push({ msg })
    if (!isProcessing) {
        await processQueue(client)
    }
}

module.exports = { handleMessage }