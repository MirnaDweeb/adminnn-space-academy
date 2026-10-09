// Consistent success envelope for every endpoint.
function sendSuccess(res, statusCode, data, meta = undefined) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
