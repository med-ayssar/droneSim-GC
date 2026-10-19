export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function headingDeg(rawHeading: number, yawRad: number): number {
  const raw = Number.isFinite(rawHeading) ? rawHeading : radToDeg(yawRad);
  return wrap360(raw);
}

export function cardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(wrap360(deg) / 45) % 8];
}
