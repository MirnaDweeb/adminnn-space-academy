import Modal from './Modal';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmTone = 'danger',
  loading = false,
  icon = 'fa-triangle-exclamation',
}) {
  const footer = (
    <>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={onClose}
        disabled={loading}
      >
        {cancelText}
      </button>
      <button
        type="button"
        className={`btn btn-${confirmTone} btn-sm`}
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            Processing...
          </>
        ) : (
          confirmText
        )}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer} size="sm">
      <div className="d-flex align-items-start gap-3">
        <div
          className={`rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0 bg-${confirmTone}-subtle text-${confirmTone}`}
          style={{ width: '42px', height: '42px' }}
        >
          <i className={`fa-solid ${icon}`} aria-hidden="true"></i>
        </div>
        <div className="text-secondary" style={{ fontSize: '0.95rem' }}>
          {message}
        </div>
      </div>
    </Modal>
  );
}
