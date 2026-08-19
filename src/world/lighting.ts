import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Scene,
} from "three";
import { LIGHTING_BY_CLOCK, type ClockSlot } from "../core/time";

export interface TownLights {
  sun: DirectionalLight;
  hemi: HemisphereLight;
}

export function createTownLights(scene: Scene, clock: ClockSlot): TownLights {
  const sun = new DirectionalLight(0xffffff, 1);
  sun.castShadow = false;
  const hemi = new HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(sun);
  scene.add(hemi);
  applyLighting(scene, { sun, hemi }, clock);
  return { sun, hemi };
}

export function applyLighting(scene: Scene, lights: TownLights, clock: ClockSlot): void {
  const p = LIGHTING_BY_CLOCK[clock];
  lights.sun.color.setHex(p.sunColor);
  lights.sun.intensity = p.sunIntensity;
  lights.sun.position.set(...p.sunPosition);
  lights.hemi.color.setHex(p.hemiSky);
  lights.hemi.groundColor.setHex(p.hemiGround);
  lights.hemi.intensity = p.hemiIntensity;
  scene.background = new Color(p.background);
  scene.fog = new Fog(p.fogColor, p.fogNear, p.fogFar);
}
