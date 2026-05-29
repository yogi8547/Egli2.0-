/**
 * ParticleBackground — Canvas-based animated particle system that creates
 * a subtle data-flow effect in the background.
 *
 * Particles move upward like data packets, with glowing trails and
 * varying speeds/opacities. Performance-optimized with requestAnimationFrame.
 */

import React, { useRef, useEffect, useCallback } from 'react';

const PARTICLE_COUNT = 60;
const COLORS = [
  'rgba(129, 161, 193, {opacity})',  // accent
  'rgba(136, 192, 208, {opacity})',  // accent-600
  'rgba(163, 190, 140, {opacity})',  // success
  'rgba(180, 142, 173, {opacity})',  // info
  'rgba(235, 203, 139, {opacity})',  // warning
];

function createParticle(width, height) {
  const colorTmpl = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -(0.2 + Math.random() * 0.6),
    size: 1.5 + Math.random() * 2.5,
    opacity: 0.15 + Math.random() * 0.35,
    pulseSpeed: 0.02 + Math.random() * 0.03,
    pulsePhase: Math.random() * Math.PI * 2,
    colorTmpl,
    life: 0.5 + Math.random() * 0.5,
  };
}

export default function ParticleBackground({ intensity = 1 }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animFrameRef = useRef(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    dimensionsRef.current = { width: canvas.width, height: canvas.height };
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Initialize particles
    const { width, height } = dimensionsRef.current;
    particlesRef.current = Array.from({ length: PARTICLE_COUNT * intensity }, () =>
      createParticle(width, height)
    );

    let time = 0;

    function animate() {
      time++;
      const { width, height } = dimensionsRef.current;
      if (!width || !height) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const opacity = (1 - dist / 120) * 0.12;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(129, 161, 193, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Update and draw particles
      for (const p of particles) {
        // Pulse opacity
        const pulse = Math.sin(time * p.pulseSpeed + p.pulsePhase) * 0.3 + 0.7;
        const currentOpacity = p.opacity * pulse;

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        // Draw particle
        const color = p.colorTmpl.replace('{opacity}', currentOpacity);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Glow trail
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        gradient.addColorStop(0, p.colorTmpl.replace('{opacity}', currentOpacity * 0.4));
        gradient.addColorStop(1, p.colorTmpl.replace('{opacity}', 0));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [intensity, resize]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  );
}
