const PRODUCTS = {
  blueprint: {
    amount: 2700,
    name: 'Agentic Dominance Blueprint',
    description: 'Immediate access to the Agentic Dominance PDF blueprint.',
    successPath: '/thank-you.html?product=blueprint&session_id={CHECKOUT_SESSION_ID}',
    cancelPath: '/?checkout=cancelled&product=blueprint',
  },
  'complete-system': {
    amount: 31800,
    name: 'Agentic Dominance Complete System',
    description: 'Immediate access to the Complete System buyer guide and setup workbook.',
    successPath: '/thank-you.html?product=complete-system&session_id={CHECKOUT_SESSION_ID}',
    cancelPath: '/?checkout=cancelled&product=complete-system',
  },
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

async function createStripeCheckoutSession({ secretKey, baseUrl, productKey }) {
  const product = PRODUCTS[productKey]
  if (!product) {
    const error = new Error('Unknown product')
    error.statusCode = 400
    throw error
  }

  const params = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(product.amount),
    'line_items[0][price_data][product_data][name]': product.name,
    'line_items[0][price_data][product_data][description]': product.description,
    'line_items[0][quantity]': '1',
    success_url: `${baseUrl}${product.successPath}`,
    cancel_url: `${baseUrl}${product.cancelPath}`,
    'metadata[product_key]': productKey,
  })

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const payload = await response.json()
  if (!response.ok || !payload.url) {
    const error = new Error(payload?.error?.message || 'Stripe checkout session creation failed')
    error.statusCode = response.status || 500
    throw error
  }

  return payload.url
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY environment variable' })
  }

  try {
    const product = req.query.product || req.body?.product || 'blueprint'
    const url = await createStripeCheckoutSession({
      secretKey,
      baseUrl: getBaseUrl(req),
      productKey: product,
    })

    if (req.method === 'GET') {
      return res.redirect(303, url)
    }

    return res.status(200).json({ url })
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Checkout session error' })
  }
}
