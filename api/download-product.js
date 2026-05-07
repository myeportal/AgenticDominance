const fs = require('node:fs')
const path = require('node:path')

const PRODUCTS = {
  blueprint: {
    amount: 2700,
    filePath: path.join(process.cwd(), 'ebook', 'agentic_dominance.pdf'),
    downloadName: 'agentic_dominance_blueprint.pdf',
    unauthorizedMessage: 'This download link is not authorized for the blueprint product.',
  },
  'complete-system': {
    amount: 31800,
    filePath: path.join(process.cwd(), 'product', 'agentic_dominance_complete_system_guide.pdf'),
    downloadName: 'agentic_dominance_complete_system_guide.pdf',
    unauthorizedMessage: 'This download link is not authorized for the complete system product.',
  },
  empire: {
    amount: 78600,
    filePath: path.join(process.cwd(), 'product', 'agentic_dominance_empire_dfy_guide.pdf'),
    downloadName: 'agentic_dominance_empire_dfy_guide.pdf',
    unauthorizedMessage: 'This download link is not authorized for the empire product.',
  },
}

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
  const productKey = req.query.product || 'blueprint'
  const product = PRODUCTS[productKey]

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing session_id' })
  }

  if (!product) {
    return res.status(400).json({ error: 'Unknown product' })
  }

  try {
    const session = await fetchCheckoutSession(secretKey, sessionId)
    const paid = session.payment_status === 'paid' || session.status === 'complete'
    const correctProduct = session.metadata?.product_key === productKey
    const correctAmount = session.amount_total === product.amount

    if (!paid || !correctProduct || !correctAmount) {
      return res.status(403).json({ error: product.unauthorizedMessage })
    }

    if (!fs.existsSync(product.filePath)) {
      return res.status(404).json({ error: 'Product file not found on server.' })
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${product.downloadName}"`)
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')

    return fs.createReadStream(product.filePath).pipe(res)
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Download authorization failed' })
  }
}
