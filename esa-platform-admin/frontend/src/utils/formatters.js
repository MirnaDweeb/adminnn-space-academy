export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatCurrencyEGP(amount) {
  if (amount === undefined || amount === null) return '—';
  return `EGP ${Number(amount).toLocaleString()}`;
}

export function humanizeStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').toLowerCase();
}
