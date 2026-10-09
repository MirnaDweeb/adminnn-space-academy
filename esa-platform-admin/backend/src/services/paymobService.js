const crypto = require('crypto');

// Paymob Accept Gateway Service (Egypt)
// Handles Authentication, Order Registration, Payment Key generation,
// Checkout URL construction, and SHA512 HMAC signature verification.

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY || 'mock_sandbox_key_esa_2026';
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || 'mock_hmac_secret_esa_2026_secured';
const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID || '412398';
const PAYMOB_IFRAME_ID = process.env.PAYMOB_IFRAME_ID || '849201';
const PAYMOB_BASE_URL = (process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com/api').replace(/\/+$/, '');
const IS_SIMULATION = process.env.PAYMOB_SANDBOX_SIMULATION === 'true' || PAYMOB_API_KEY.startsWith('mock');

/**
 * Calculates Paymob SHA-512 HMAC according to official Paymob specification.
 * Concatenates 20 specific transaction fields in exact lexicographical order:
 * amount_cents, created_at, currency, error_occured, has_parent_transaction, id,
 * integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
 * is_standalone_payment, is_voided, order.id, owner, pending,
 * source_data.pan, source_data.sub_type, source_data.type, success
 */
function calculateHmac(transactionObj, secret = PAYMOB_HMAC_SECRET) {
  const tx = transactionObj.obj || transactionObj;

  const extract = (path) => {
    const parts = path.split('.');
    let cur = tx;
    for (const p of parts) {
      if (cur == null) return '';
      cur = cur[p];
    }
    return cur !== undefined && cur !== null ? String(cur) : '';
  };

  const concatenated = [
    extract('amount_cents'),
    extract('created_at'),
    extract('currency'),
    extract('error_occured'),
    extract('has_parent_transaction'),
    extract('id'),
    extract('integration_id'),
    extract('is_3d_secure'),
    extract('is_auth'),
    extract('is_capture'),
    extract('is_refunded'),
    extract('is_standalone_payment'),
    extract('is_voided'),
    extract('order.id') || extract('order'),
    extract('owner'),
    extract('pending'),
    extract('source_data.pan'),
    extract('source_data.sub_type'),
    extract('source_data.type'),
    extract('success'),
  ].join('');

  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

/**
 * Validates HMAC signature from Paymob callback.
 */
function verifyHmac(payload, receivedHmac) {
  if (!receivedHmac || typeof receivedHmac !== 'string') {
    return false;
  }
  const calculated = calculateHmac(payload, PAYMOB_HMAC_SECRET);
  if (calculated.length !== receivedHmac.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(calculated, 'utf-8'), Buffer.from(receivedHmac, 'utf-8'));
}

/**
 * Step 1: Authenticate with Paymob Accept API.
 */
async function authenticate() {
  if (IS_SIMULATION) {
    return `sim_token_${Date.now()}`;
  }

  const res = await fetch(`${PAYMOB_BASE_URL}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: PAYMOB_API_KEY }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paymob authentication failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.token;
}

/**
 * Step 2: Register Order with Paymob.
 */
async function registerOrder({ authToken, amountCents, merchantOrderId, items = [] }) {
  if (IS_SIMULATION) {
    return {
      id: Math.floor(10000000 + Math.random() * 90000000),
      merchant_order_id: merchantOrderId,
      amount_cents: amountCents,
      currency: 'EGP',
    };
  }

  const res = await fetch(`${PAYMOB_BASE_URL}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: 'false',
      amount_cents: amountCents,
      currency: 'EGP',
      merchant_order_id: merchantOrderId,
      items,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paymob order registration failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Step 3: Generate Payment Key token.
 */
async function generatePaymentKey({
  authToken,
  amountCents,
  orderId,
  billingData,
  integrationId = PAYMOB_INTEGRATION_ID,
}) {
  if (IS_SIMULATION) {
    return `sim_payment_key_${orderId}_${Date.now()}`;
  }

  const res = await fetch(`${PAYMOB_BASE_URL}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: billingData,
      currency: 'EGP',
      integration_id: Number(integrationId),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paymob payment key generation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.token;
}

/**
 * Step 4: Construct checkout URL for client redirection / iframe.
 */
function getCheckoutUrl(paymentKeyToken) {
  if (IS_SIMULATION) {
    // In sandbox simulation, use local checkout simulator endpoint that mirrors Paymob iframe
    return `/student/payments/checkout-sandbox?token=${encodeURIComponent(paymentKeyToken)}`;
  }
  return `${PAYMOB_BASE_URL}/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(paymentKeyToken)}`;
}

/**
 * Inquires transaction status directly from Paymob API.
 */
async function inquireTransaction(transactionId) {
  if (IS_SIMULATION) {
    return null;
  }

  const authToken = await authenticate();
  const res = await fetch(`${PAYMOB_BASE_URL}/acceptance/transactions/${transactionId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}

/**
 * Builds a valid simulated Paymob transaction callback payload.
 * Useful for automated tests and sandbox checkout flows.
 */
function buildSimulatedCallback({
  transactionId,
  orderId,
  amountCents,
  success = true,
  pending = false,
  merchantOrderId = '',
  sourceType = 'card',
  pan = '2346',
  secret = PAYMOB_HMAC_SECRET,
}) {
  const createdAt = new Date().toISOString();
  const payload = {
    type: 'TRANSACTION',
    obj: {
      id: transactionId,
      pending,
      success,
      amount_cents: amountCents,
      currency: 'EGP',
      is_auth: false,
      is_capture: false,
      is_standalone_payment: true,
      is_voided: false,
      is_refunded: false,
      is_3d_secure: true,
      integration_id: Number(PAYMOB_INTEGRATION_ID),
      profile_id: 12345,
      has_parent_transaction: false,
      order: {
        id: orderId,
        merchant_order_id: merchantOrderId,
      },
      created_at: createdAt,
      source_data: {
        pan,
        type: sourceType,
        sub_type: 'MasterCard',
      },
      data: {
        message: success ? 'Approved' : 'Declined',
      },
      error_occured: !success,
      owner: 98765,
    },
  };

  const hmac = calculateHmac(payload, secret);
  return { payload, hmac };
}

module.exports = {
  calculateHmac,
  verifyHmac,
  authenticate,
  registerOrder,
  generatePaymentKey,
  getCheckoutUrl,
  inquireTransaction,
  buildSimulatedCallback,
  PAYMOB_INTEGRATION_ID,
  PAYMOB_IFRAME_ID,
  IS_SIMULATION,
};
