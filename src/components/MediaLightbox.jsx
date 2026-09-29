import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

// Shared, view-only media preview. Kept outside the canvas transform so the
// asset opens at screen size regardless of the board's current pan/zoom.
export default function MediaLightbox({ asset, onClose }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    // Capture before board-wide shortcuts: otherwise Escape can clear the
    // canvas selection, re-render this component, and remove this listener
    // before the same event reaches it.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  if (!asset) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={asset.label ? `Preview ${asset.label}` : 'Media preview'}
      className="fixed inset-0 z-[140] flex flex-col items-center justify-center p-10"
      style={{ background: 'rgba(8,8,8,0.86)' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close preview"
        title="Close preview (Esc)"
        className="absolute top-5 right-5 grid place-items-center w-9 h-9 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X size={20} />
      </button>

      <div
        className="max-w-[90vw] max-h-[82vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {asset.type === 'video' ? (
          <video src={asset.src} controls autoPlay className="max-w-full max-h-[82vh] rounded-[6px]" />
        ) : (
          <img
            src={asset.src}
            alt={asset.label || ''}
            className="max-w-full max-h-[82vh] object-contain rounded-[6px]"
          />
        )}
      </div>

      {(asset.label || asset.projectName) && (
        <div className="mt-4 text-center" onClick={(e) => e.stopPropagation()}>
          {asset.label && <div className="text-[13px] text-white/90">{asset.label}</div>}
          {asset.projectName && (
            <div className="font-serif text-[12px] text-white/55 mt-0.5">{asset.projectName}</div>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}
