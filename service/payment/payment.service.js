const axios = require('axios')
const { retryAsync } = require('../../utils/retry')
const { logInfo } = require('../../utils/logger')

const client = axios.create({ baseURL: 'https://premku.com/api', timeout: 10000 })

async function createDeposit(apiKey, amount) {
    return retryAsync(async () => {
        const res = await client.post('/pay', { api_key: apiKey, amount })
        logInfo('Payment createDeposit response', { status: res.status, data: res.data })
        return res.data
    })
}

async function checkDeposit(apiKey, invoice) {
    return retryAsync(async () => {
        const res = await client.post('/pay_status', { api_key: apiKey, invoice })
        logInfo('Payment checkDeposit response', { status: res.status, data: res.data })
        return res.data
    })
}

async function cancelDeposit(apiKey, invoice) {
    return retryAsync(async () => {
        const res = await client.post('/cancel_pay', { api_key: apiKey, invoice })
        logInfo('Payment cancelDeposit response', { status: res.status, data: res.data })
        return res.data
    })
}

module.exports = {
    createDeposit,
    checkDeposit,
    cancelDeposit
}