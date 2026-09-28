"use client";

/**
 * A photo, full screen, on the phone: the whiteboard a diagram was generated
 * from, or the one about to be sent. Tap anywhere to close.
 */
export function MobilePhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onClose(); }} role="dialog" aria-label={alt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-3 right-3 h-10 w-10 rounded-full bg-black/60 text-white text-2xl leading-none" aria-label="Close">×</button>
    </div>
  );
}
