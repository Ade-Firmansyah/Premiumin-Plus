const { logRetry } = require('./logger')

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function retryAsync(fn, options = {}) {
    const retries = options.retries || 3
    const minDelay = options.minDelay || 2000
    const maxDelay = options.maxDelay || 3000

    let attempt = 1
    while (true) {
        try {
            return await fn()
        } catch (error) {
            if (attempt >= retries) {
                throw error
            }

            const waitMs = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1))
            logRetry(`Attempt ${attempt} failed, retrying in ${waitMs}ms`, {
                error: error.message,
                attempt,
                retries
            })
            await delay(waitMs)
            attempt += 1
        }
    }
}

module.exports = {
    retryAsync
}
