export interface BirdFlight {
  x: number; y: number; heading: number; phase: number; flock: number; speed: number;
}

export function createBirdFlights(width: number, height: number): BirdFlight[] {
  return Array.from({ length: 6 }, (_, i) => ({
    x: width * (i < 3 ? 0.3 : 0.7) + (i % 3) * 22,
    y: height * (i < 3 ? 0.35 : 0.65) + (i % 3) * 17,
    heading: i < 3 ? 0.4 : 3.5, phase: i * 2.399, flock: Math.floor(i / 3), speed: 24 + i * 1.3,
  }));
}

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Bounded steering, separation and changing thermal centers; no gameplay input. */
export function stepBirdFlights(birds: BirdFlight[], time: number, dt: number, width: number, height: number): void {
  const previous = birds.map(b => ({ x: b.x, y: b.y, heading: b.heading }));
  birds.forEach((bird, index) => {
    const cycle = time / 44 + bird.flock * 0.61;
    const leg = Math.floor(cycle);
    const progress = cycle - leg;
    const seed = leg * 2.399 + bird.flock * 3.1;
    const cx = width * (0.5 + 0.27 * Math.sin(seed));
    const cy = height * (0.5 + 0.25 * Math.cos(seed * 1.7));
    const orbit = time * 0.19 + bird.phase * 0.15;
    const radius = progress > 0.52 ? 72 : 22;
    let dx = cx + Math.cos(orbit) * radius - bird.x;
    let dy = cy + Math.sin(orbit) * radius * 0.72 - bird.y;
    let separationX = 0, separationY = 0;
    previous.forEach((other, j) => {
      if (j === index) return;
      const sx = bird.x - other.x, sy = bird.y - other.y;
      const distance = Math.hypot(sx, sy);
      if (distance > 0 && distance < 35) {
        separationX += sx / distance * (35 - distance) * 5;
        separationY += sy / distance * (35 - distance) * 5;
      }
    });
    const distance = Math.max(1, Math.hypot(dx, dy));
    dx = dx / distance * 80 + separationX;
    dy = dy / distance * 80 + separationY;
    // Early, gradual inward steering leaves enough space for a real turn.
    const margin = 110;
    dx += Math.max(0, margin - bird.x) * 4 - Math.max(0, bird.x - width + margin) * 4;
    dy += Math.max(0, margin - bird.y) * 4 - Math.max(0, bird.y - height + margin) * 4;
    const desired = Math.atan2(dy, dx) + Math.sin(time * 0.37 + bird.phase) * 0.10;
    const turn = wrapAngle(desired - bird.heading);
    bird.heading += Math.max(-0.70 * dt, Math.min(0.70 * dt, turn));
    const speed = bird.speed * (1 + 0.08 * Math.sin(time * 0.5 + bird.phase));
    bird.x += Math.cos(bird.heading) * speed * dt;
    bird.y += Math.sin(bird.heading) * speed * dt;
  });
}
