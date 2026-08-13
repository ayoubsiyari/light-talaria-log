import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { HLS_SRC } from '@/components/landing/landingData';

interface HlsBackgroundProps {
  /** Flip the video vertically (footer reprise). */
  flipped?: boolean;
  overlayClassName?: string;
  className?: string;
}

export function HlsBackground({
  flipped = false,
  overlayClassName = 'bg-black/20',
  className = '',
}: HlsBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(HLS_SRC);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_SRC;
    }

    const play = () => {
      void video.play().catch(() => undefined);
    };
    video.addEventListener('canplay', play);

    return () => {
      video.removeEventListener('canplay', play);
      hls?.destroy();
    };
  }, []);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className={[
          'absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover',
          flipped ? 'scale-y-[-1]' : '',
        ].join(' ')}
      />
      <div className={`absolute inset-0 ${overlayClassName}`} />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}
