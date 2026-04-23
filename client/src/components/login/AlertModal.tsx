import type { CSSProperties } from 'react'

type AlertModalProps = {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onRequestClose: () => void
}

/**
 * 对应 `index.php` 中
 * `#alertModalOverlay.modal-overlay` + `.modal-box` 与内层 `#modalTitle` / `#modalMessage` / `#modalConfirmBtn`
 */
export function AlertModal({
  open,
  title,
  message,
  onConfirm,
  onRequestClose,
}: AlertModalProps) {
  return (
    <div
      id="alertModalOverlay"
      className={open ? 'modal-overlay is-open' : 'modal-overlay'}
      aria-hidden={!open}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onRequestClose()
      }}
    >
      <div
        className="modal-box"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalMessage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-icon-wrap">
          <i
            className="fas fa-exclamation-triangle modal-icon"
            aria-hidden="true"
          />
        </div>
        <h3 id="modalTitle" className="modal-title">
          {title}
        </h3>
        <p id="modalMessage" className="modal-message" style={msgStyle(message)}>
          {message}
        </p>
        <div className="modal-actions">
          <button
            type="button"
            id="modalConfirmBtn"
            className="modal-btn modal-btn-primary"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

function msgStyle(message: string): CSSProperties {
  if (message === '') return { minHeight: '1.55em' }
  return {}
}
