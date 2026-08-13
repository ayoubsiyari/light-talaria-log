import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  baseA: number;
  twinkle: number;
  phase: number;
  spark: boolean;
}

/** Drifting, twinkling starfield — paused offscreen and under reduced motion. */
export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;

    const count = () => (width < 640 ? 56 : 110);

    const seed = () => {
      const n = count();
      stars = Array.from({ length: n }, (_, i) => {
        const spark = i % 9 === 0;
        const speed = spark ? 22 : 10 + Math.random() * 16;
        const angle = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: spark ? 1.6 + Math.random() * 0.8 : 0.4 + Math.random() * 1.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.65 - 4,
          baseA: spark ? 0.85 : 0.35 + Math.random() * 0.45,
          twinkle: 1.1 + Math.random() * 2.4,
          phase: Math.random() * Math.PI * 2,
          spark,
        };
      });
    };

    const wrap = (s: Star) => {
      const m = 6;
      if (s.x < -m) s.x = width + m;
      if (s.x > width + m) s.x = -m;
      if (s.y < -m) s.y = height + m;
      if (s.y > height + m) s.y = -m;
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduced) paint(0);
    };

    const paint = (dt: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        if (dt > 0) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.phase += s.twinkle * dt;
          wrap(s);
        }
        const pulse = 0.5 + 0.5 * Math.sin(s.phase);
        const a = s.baseA * (0.28 + 0.72 * pulse);
        const r = s.r * (0.75 + 0.35 * pulse);

        if (s.spark && pulse > 0.55) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(200, 225, 255, ${a * 0.18})`;
          ctx.arc(s.x, s.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(210, 228, 255, ${a})`;
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      paint(dt);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduced || running || !visible) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      last = 0;
      cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    if (!reduced) start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      aria-hidden="true"
    />
  );
}
