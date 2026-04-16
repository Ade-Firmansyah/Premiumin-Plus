const axios = require('axios')
const { retryAsync } = require('../../utils/retry')
const { logInfo, logError } = require('../../utils/logger')

const PREMKU_API_BASE = 'https://premku.com/api'
const client = axios.create({ baseURL: PREMKU_API_BASE, timeout: 10000 })

async function getProducts(apiKey) {
    return retryAsync(async () => {
        const res = await client.post('/products', { api_key: apiKey })
        logInfo('Premku getProducts response', { status: res.status, data: res.data })
        return res.data
    })
}

async function createOrder(apiKey, product_id, qty, ref_id) {
    return retryAsync(async () => {
        const res = await client.post('/order', {
            api_key: apiKey,
            product_id,
            qty,
            ref_id
        })
        logInfo('Premku createOrder response', { status: res.status, data: res.data })
        return res.data
    })
}

async function checkOrder(apiKey, invoice) {
    return retryAsync(async () => {
        const res = await client.post('/status', {
            api_key: apiKey,
            invoice
        })
        logInfo('Premku checkOrder response', { status: res.status, data: res.data })
        return res.data
    })
}

module.exports = {
    getProducts,
    createOrder,
    checkOrder
}