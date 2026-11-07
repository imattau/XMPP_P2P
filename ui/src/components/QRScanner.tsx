import { useEffect, useRef, useState } from 'react'

type DetectedCode = { rawValue?: string }
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedCode[]> }
type DetectorConstructor = (new (options?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> }

/** Camera based QR scanner. Browser camera permission is requested only on mount. */
export default function QRScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let frame = 0
    let stream: MediaStream | undefined
    const DetectorApi = (window as typeof window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector

    if (!DetectorApi) {
      setError('QR scanning is not supported by this browser. Use the relay link or enter the address manually.')
      return
    }

    const start = async () => {
      let formats: string[] | undefined
      try { formats = await DetectorApi.getSupportedFormats?.() } catch { /* older implementations may omit format introspection */ }
      if (formats && !formats.includes('qr_code')) {
        setError('QR scanning is not supported by this browser. Use the relay link or enter the address manually.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available. Open this app over HTTPS or use the relay link.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const detector = new DetectorApi({ formats: ['qr_code'] })
        const scan = async () => {
          if (!active || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes.find(code => code.rawValue)?.rawValue
            if (value) {
              active = false
              onScan(value)
              return
            }
          } catch {
            // Keep scanning while the camera is warming up or frames are unavailable.
          }
          if (active) frame = window.requestAnimationFrame(() => void scan())
        }
        frame = window.requestAnimationFrame(() => void scan())
      } catch (cause) {
        if (!active) return
        const name = cause instanceof DOMException ? cause.name : ''
        setError(name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'Could not open the camera. Use the relay link or enter the address manually.')
      }
    }

    void start()
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="relay-scan-title">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="relay-scan-title" className="text-sm font-semibold text-foreground">Scan relay QR code</h2>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary">Close</button>
        </div>
        <video ref={videoRef} autoPlay muted playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
        <p role="status" className={`mt-3 text-xs leading-relaxed ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || 'Point your camera at a relay QR code.'}
        </p>
      </div>
    </div>
  )
}
