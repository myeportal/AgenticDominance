const fs = require('node:fs')
const path = require('node:path')

const BLUEPRINT_PRODUCT_KEY = 'blueprint'
const BLUEPRINT_AMOUNT = 2700
const BLUEPRINT_PATH = path.join(process.cwd(), 'ebook', 'agentic_dominance.pdf')

async function fetchCheckoutSession(secretKey, sessionId) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  })

  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Stripe session lookup failed')
    error.statusCode = response.status || 500
    throw error
  }

  return payload
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY environment variable' })
  }

  const sessionId = req.query.session_id
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing session_id' })
  }

  try {
    const session = await fetchCheckoutSession(secretKey, sessionId)
    const paid = session.payment_status === 'paid' || session.status === 'complete'
    const correctProduct = session.metadata?.product_key === BLUEPRINT_PRODUCT_KEY
    const correctAmount = session.amount_total === BLUEPRINT_AMOUNT

    if (!paid || !correctProduct || !correctAmount) {
      return res.status(403).json({ error: 'This download link is not authorized for the blueprint product.' })
    }

    if (!fs.existsSync(BLUEPRINT_PATH)) {
      return res.status(404).json({ error: 'Blueprint file not found on server.' })
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="agentic_dominance_blueprint.pdf"')
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')

    return fs.createReadStream(BLUEPRINT_PATH).pipe(res)
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Download authorization failed' })
  }
}
