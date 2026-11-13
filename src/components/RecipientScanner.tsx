import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, X } from 'lucide-react'
import { scannedRecipient } from '../lib/scanned-recipient'

type Props = { onScan: (address: `0x${string}`) => void; onCancel: () => void }

export default function RecipientScanner({ onScan, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let frame = 0
    let stream: MediaStream | undefined
    let lastChecked = 0
    const videoElement = videoRef.current
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function check(timestamp: number) {
      if (!active) return
      const video = videoRef.current
      if (video && context && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && timestamp - lastChecked >= 120) {
        lastChecked = timestamp
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' })
        if (result) {
          try {
            const address = scannedRecipient(result.data)
            active = false
            stream?.getTracks().forEach(track => track.stop())
            onScan(address)
            return
          } catch {
            setError('This QR is not a wallet address. Scan a JANUS receive QR or enter an address manually.')
          }
        }
      }
      frame = requestAnimationFrame(check)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera scanning is unavailable in this browser. Enter the address manually.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
        if (!active) { stream.getTracks().forEach(track => track.stop()); return }
        const video = videoRef.current
        if (!video) { stream.getTracks().forEach(track => track.stop()); return }
        video.srcObject = stream
        await video.play()
        if (active) frame = requestAnimationFrame(check)
      } catch {
        if (active) setError('Camera access was unavailable. Allow camera permission or enter the address manually.')
      }
    }
    void start()
    return () => {
      active = false
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
      if (videoElement) videoElement.srcObject = null
    }
  }, [onScan])

  return <section className="rounded-xl border border-white/10 bg-black/20 p-3" aria-label="Scan recipient QR">
    <div className="flex items-center justify-between gap-2 mb-3"><span className="inline-flex items-center gap-2 text-sm font-medium"><Camera size={16} /> Scan wallet QR</span>
      <button type="button" onClick={onCancel} className="p-2 rounded-lg text-[#A8B0BE]" aria-label="Close camera"><X size={17} /></button></div>
    <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-square max-h-72 rounded-lg bg-[#0B0D12] object-cover" aria-label="Camera preview" />
    <p className="mt-2 text-xs text-[#A8B0BE]">Point your camera at a JANUS receive QR. The address will appear in the Send form for review.</p>
    {error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}
  </section>
}
