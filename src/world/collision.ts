export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function pointHitsAabb(x: number, z: number, radius: number, box: Aabb): boolean {
  const nx = Math.max(box.minX, Math.min(x, box.maxX));
  const nz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < radius * radius;
}

export function resolveCircleAabbs(
  x: number,
  z: number,
  prevX: number,
  prevZ: number,
  radius: number,
  boxes: readonly Aabb[],
): { x: number; z: number } {
  let nextX = x;
  let nextZ = z;
  if (boxes.some((box) => pointHitsAabb(nextX, prevZ, radius, box))) {
    nextX = prevX;
  }
  if (boxes.some((box) => pointHitsAabb(nextX, nextZ, radius, box))) {
    nextZ = prevZ;
  }
  return { x: nextX, z: nextZ };
}

export function clampToBounds(
  x: number,
  z: number,
  bounds: Aabb,
): { x: number; z: number } {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, z)),
  };
}
