const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const { logInfo, logError } = require('../utils/logger')
const { SESSION_PATH } = require('../config')

let latestQrDataUrl = null
let qrServer = null
// Fix: Flag untuk prevent multiple instance
let isStarting = false

function ensureSessionPath() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }
}

function killExistingBrowsers() {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const isLinux = process.platform === 'linux'

    try {
      if (isWindows) {
        // Kill Chrome processes on Windows
        const killChrome = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t'], { stdio: 'inherit' })
        const killChromium = spawn('taskkill', ['/f', '/im', 'chromium.exe', '/t'], { stdio: 'inherit' })

        let completed = 0
        const checkComplete = () => {
          completed++
          if (completed === 2) {
            logInfo('Killed existing Chrome/Chromium processes on Windows')
            resolve()
          }
        }

        killChrome.on('close', checkComplete)
        killChromium.on('close', checkComplete)
        killChrome.on('error', checkComplete)
        killChromium.on('error', checkComplete)

      } else if (isLinux) {
        // Kill Chromium processes on Linux
        const killChromium = spawn('pkill', ['-f', 'chromium'], { stdio: 'inherit' })
        const killChrome = spawn('pkill', ['-f', 'chrome'], { stdio: 'inherit' })

        let completed = 0
        const checkComplete = () => {
          completed++
          if (completed === 2) {
            logInfo('Killed existing Chromium/Chrome processes on Linux')
            resolve()
          }
        }

        killChromium.on('close', checkComplete)
        killChrome.on('close', checkComplete)
        killChromium.on('error', checkComplete)
        killChrome.on('error', checkComplete)

      } else {
        // Unsupported platform, just resolve
        logInfo('Browser kill not supported on this platform')
        resolve()
      }
    } catch (error) {
      logError('Failed to kill existing browsers', error)
      resolve()
    }
  })
}

function clearSessionData() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      const files = fs.readdirSync(SESSION_PATH)
      for (const file of files) {
        const filePath = path.join(SESSION_PATH, file)
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath)
        }
      }
      logInfo('Cleared existing session data')
    }
  } catch (error) {
    logError('Failed to clear session data', error)
  }
}

// Fix: Clean SingletonLock tanpa hapus session utama
function cleanSingletonLock() {
  try {
    const lockFile = path.join(SESSION_PATH, 'SingletonLock')
    if (fs.existsSync(lockFile)) {
      fs.rmSync(lockFile, { force: true })
      logInfo('Cleaned SingletonLock file')
    }
  } catch (error) {
    logError('Failed to clean SingletonLock', error)
  }
}

function startQrHttpServer(port = process.env.PORT || 3000) {
  if (qrServer) {
    return
  }

  qrServer = http.createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/qr') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('Not found')
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WhatsApp QR</title>
  <style>body{font-family:Arial,sans-serif;text-align:center;padding:30px;background:#111;color:#fff}img{max-width:100%;height:auto;border:4px solid #fff;box-shadow:0 0 20px rgba(255,255,255,.2)}.hint{margin-top:16px;font-size:16px;opacity:.8;}</style>
</head>
<body>
  <h1>Scan WhatsApp QR</h1>
  ${latestQrDataUrl ? `<img src="${latestQrDataUrl}" alt="WhatsApp QR Code"/>` : '<p>Menunggu QR baru...</p>'}
  <p class="hint">Reload halaman jika QR belum muncul.</p>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  })

  qrServer.on('error', (err) => {
    logError('QR HTTP server error', err)
  })

  qrServer.listen(port, () => {
    logInfo(`QR page available on http://localhost:${port} (use Railway public URL)`)
  })
}

function createClient() {
  ensureSessionPath()

  // Fix: Clean SingletonLock sebelum start
  cleanSingletonLock()

  // For Railway deployment, use different configuration
  const isRailway = process.env.RAILWAY_ENVIRONMENT
  const isProduction = process.env.NODE_ENV === 'production'

  if (isRailway) {
    clearSessionData()
    killExistingBrowsers()
  }

  // For local development, always use unique session path to avoid conflicts
  let sessionPath = SESSION_PATH
  if (!isRailway) {
    sessionPath = path.join(SESSION_PATH, `session_${Date.now()}`)
  } else {
    sessionPath = path.join(SESSION_PATH, `session_${Date.now()}`)
  }

  // Optimasi: Fungsi untuk create client dengan retry
  const createClientWithRetry = (retryCount = 0) => {
    // Fix: Prevent multiple instance
    if (isStarting) {
      logInfo('Client creation already in progress, skipping')
      return
    }
    isStarting = true

    try {
      // Fix: Kill browser lama sebelum launch
      killExistingBrowsers().then(() => {
        // Use stable session configuration to prevent random logouts
        const client = new Client({
        authStrategy: new LocalAuth({
          clientId: "bot-session",
          dataPath: "./sessions"
        }),
        puppeteer: {
          headless: true, // Wajib headless untuk Linux VPS
          executablePath: isRailway ? '/usr/bin/chromium' : (isProduction ? '/usr/bin/chromium-browser' : undefined), // Optimize: Set for Ubuntu VPS
          args: [
            // Optimasi Linux headless low memory: args untuk Ubuntu VPS
            '--no-sandbox', // Disable sandbox untuk containerized env
            '--disable-setuid-sandbox', // Disable setuid sandbox
            '--disable-dev-shm-usage', // Disable shared memory usage (penting untuk Docker/Railway)
            '--disable-gpu', // Disable GPU acceleration (tidak perlu di headless)
            '--disable-background-networking', // Kurangi background networking
            '--disable-extensions', // Disable extensions untuk ringan
            '--disable-sync', // Disable sync untuk performa
            '--disable-default-apps', // Disable default apps
            '--disable-renderer-backgrounding', // Disable renderer backgrounding
            '--single-process', // Single process untuk hemat RAM
            '--no-zygote', // No zygote process
            // Tambahan optimasi RAM & CPU untuk low memory
            '--disable-accelerated-2d-canvas', // Disable accelerated canvas
            '--disable-features=TranslateUI,BlinkGenPropertyTrees', // Disable translate dan property trees
            '--disable-breakpad', // Disable breakpad
            '--disable-client-side-phishing-detection', // Disable phishing detection
            '--disable-hang-monitor', // Disable hang monitor
            '--disable-popup-blocking', // Disable popup blocking
            '--disable-preconnect', // Disable preconnect
            '--disable-domain-reliability', // Disable domain reliability
            '--disable-component-update', // Disable component update
            '--disable-ipc-flooding-protection', // Disable IPC flooding protection
            '--disable-background-timer-throttling', // Disable background timer throttling
            '--disable-backgrounding-occluded-windows', // Disable backgrounding occluded windows
            '--disable-renderer-backgrounding', // Disable renderer backgrounding
            '--disable-features=UserMediaScreenCapturing,VizDisplayCompositor', // Disable media capturing dan compositor
            '--no-first-run', // Skip first run
            '--no-pings', // No pings
            '--disable-logging', // Disable logging untuk performa
            '--disable-dev-tools', // Disable dev tools
            '--disable-software-rasterizer', // Disable software rasterizer
            '--disable-web-security', // Disable web security untuk low memory
            '--memory-pressure-off', // Matikan memory pressure handling
            '--max_old_space_size=256', // Optimize: Batasi heap size 256MB untuk low memory VPS
            '--optimize-for-size', // Optimasi untuk ukuran kecil
            // Khusus Railway/Ubuntu low memory
            ...(isRailway || isProduction ? [
              '--disable-background-timer-throttling', // Kurangi throttling
              '--disable-backgrounding-occluded-windows', // Disable backgrounding
              '--disable-features=UserMediaScreenCapturing', // Disable screen capturing
              '--disable-component-extensions-with-background-pages', // Disable background extensions
            ] : [])
          ]
        }
      })

      // Optimasi: Cleanup event listeners untuk hindari memory leak
      client.on('qr', qr => {
        logInfo('QR code generated, scan with WhatsApp mobile app')
        qrcode.generate(qr, { small: true })

        QRCode.toDataURL(qr)
          .then((url) => {
            latestQrDataUrl = url
            logInfo('QR image generated for browser preview')
          })
          .catch((error) => {
            logError('Failed to generate QR image', error)
          })
      })

      client.on('ready', () => {
        logInfo('WhatsApp client ready')
        isStarting = false // Reset flag setelah ready
        // Optimasi: Cleanup QR server setelah ready jika tidak diperlukan
        if (qrServer && !process.env.PORT && !process.env.RAILWAY_ENVIRONMENT) {
          qrServer.close(() => logInfo('QR server closed after ready'))
        }
      })

      client.on('auth_failure', (msg) => {
        logError('WhatsApp authentication failure', { message: msg })
        isStarting = false // Reset flag pada error
        // Optimasi: Jangan reconnect otomatis untuk hindari loop
      })

      client.on('disconnected', (reason) => {
        isStarting = false // Reset flag pada disconnect
        if (reason === 'LOGOUT') {
          logInfo('User logged out from phone - session ended')
          // Optimasi: Cleanup session jika logout
          clearSessionData()
        } else {
          logError('WhatsApp disconnected unexpectedly', { reason })
          // Optimasi: Retry reconnect max 3x dengan delay
          if (retryCount < 3) {
            logInfo(`Attempting WhatsApp reconnect (${retryCount + 1}/3)`)
            setTimeout(() => {
              try {
                client.initialize().catch(err => {
                  logError('WhatsApp reconnect error', err)
                  // Jika gagal, coba create client baru
                  if (retryCount < 2) {
                    createClientWithRetry(retryCount + 1)
                  }
                })
              } catch (initError) {
                logError('Failed to initialize reconnect', initError)
              }
            }, 5000 * (retryCount + 1)) // Exponential backoff
          } else {
            logError('Max reconnect attempts reached, giving up')
          }
        }
      })

      // Optimasi: Handle browser crash
      client.on('browser_crashed', () => {
        logError('Puppeteer browser crashed')
        isStarting = false // Reset flag pada crash
        // Optimasi: Restart client jika crash
        if (retryCount < 3) {
          logInfo(`Restarting client after crash (${retryCount + 1}/3)`)
          setTimeout(() => createClientWithRetry(retryCount + 1), 10000)
        }
      })

      return client

      // Fix: Try/catch initialize dengan retry
      client.initialize().catch((initError) => {
        logError('Failed to initialize WhatsApp client', initError)
        isStarting = false // Reset flag
        // Retry max 3x
        if (retryCount < 3) {
          logInfo(`Retrying client initialization (${retryCount + 1}/3)`)
          setTimeout(() => createClientWithRetry(retryCount + 1), 5000)
        } else {
          logError('Max initialization attempts reached')
        }
      })

      }).catch((killError) => {
        logError('Failed to kill browsers before launch', killError)
        isStarting = false // Reset flag jika kill gagal
      })

    } catch (error) {
      logError('Failed to create WhatsApp client', error)
      isStarting = false // Reset flag pada error
      // Optimasi: Retry create client max 3x
      if (retryCount < 3) {
        logInfo(`Retrying client creation (${retryCount + 1}/3)`)
        return setTimeout(() => createClientWithRetry(retryCount + 1), 5000)
      } else {
        throw new Error('Max client creation attempts reached')
      }
    }
  }

  const client = createClientWithRetry()

  if (process.env.PORT || process.env.RAILWAY_ENVIRONMENT) {
    startQrHttpServer()
  }

  return client
}

module.exports = {
  createClient,
  killExistingBrowsers,
  MessageMedia
}
