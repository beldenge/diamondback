import { Raycaster, Vector2, type Camera } from "three";
import type { InteractableSpec } from "../world/layout";

const REACH = 3.4;

export function pickInteractable(
  camera: Camera,
  interactables: readonly InteractableSpec[],
): InteractableSpec | null {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(0, 0), camera);
  const origin = ray.ray.origin;
  const dir = ray.ray.direction;

  let best: InteractableSpec | null = null;
  let bestDist = REACH;
  for (const item of interactables) {
    const dx = item.x - origin.x;
    const dy = item.y - origin.y;
    const dz = item.z - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > REACH) continue;
    const along = dx * dir.x + dy * dir.y + dz * dir.z;
    if (along < 0.2) continue;
    const closestX = origin.x + dir.x * along;
    const closestY = origin.y + dir.y * along;
    const closestZ = origin.z + dir.z * along;
    const off = Math.hypot(item.x - closestX, item.y - closestY, item.z - closestZ);
    if (off <= item.radius && dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}
