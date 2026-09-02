/**
 * Day / night. `N` swaps: sky dome gradient, sun/moon light, fog, the
 * warm-window night group, and lamp glows. Fog stays light enough that
 * the mission is visible from the south gate, as the film shows.
 */
import * as THREE from "three";
import { applyNightMats } from "./materials";
import { PAL } from "./palette";

function gradientTex(top: string, mid: string, bottom: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  readonly group = new THREE.Group();

  night = false;

  private dome: THREE.Mesh;

  private dayTex: THREE.Texture;

  private nightTex: THREE.Texture;

  private stars: THREE.Points;

  private hemi: THREE.HemisphereLight;

  private sun: THREE.DirectionalLight;

  private nightGroup: THREE.Group;

  constructor(scene: THREE.Scene, nightGroup: THREE.Group) {
    this.nightGroup = nightGroup;
    // the film's sky is a nearly flat (102,127,193) down to the horizon
    this.dayTex = gradientTex("#5f78be", PAL.skyDay, PAL.skyHorizonDay);
    this.nightTex = gradientTex("#080d1d", PAL.skyNight, PAL.skyHorizonNight);
    const domeMat = new THREE.MeshBasicMaterial({
      map: this.dayTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), domeMat);
    this.dome.position.set(52, 0, 60);
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // stars
    const starGeom = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 500; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 460;
      pts.push(
        52 + r * Math.cos(e) * Math.cos(a),
        r * Math.sin(e),
        60 + r * Math.cos(e) * Math.sin(a),
      );
    }
    starGeom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(
      starGeom,
      new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, fog: false }),
    );
    this.stars.visible = false;
    this.group.add(this.stars);

    // the stills are lit mostly by ambient with a high southern sun:
    // faces differ little in tone
    this.hemi = new THREE.HemisphereLight(0xc4d0e6, 0x6e6052, 1.0);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.3);
    this.sun.position.set(80, 150, 130);
    this.sun.target.position.set(52, 0, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -130;
    this.sun.shadow.camera.right = 130;
    this.sun.shadow.camera.top = 130;
    this.sun.shadow.camera.bottom = -130;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    scene.fog = new THREE.Fog(0x667fc1, 60, 260);
    this.apply(scene);
  }

  toggle(scene: THREE.Scene): void {
    this.night = !this.night;
    this.apply(scene);
  }

  private apply(scene: THREE.Scene): void {
    const mat = this.dome.material as THREE.MeshBasicMaterial;
    if (this.night) {
      mat.map = this.nightTex;
      this.stars.visible = true;
      this.hemi.intensity = 0.65;
      this.hemi.color.set(0x5a6a94);
      this.hemi.groundColor.set(0x2a2630);
      this.sun.intensity = 0.85;
      this.sun.color.set(0x9fb4e8);
      this.sun.position.set(-60, 120, -80);
      scene.fog = new THREE.Fog(0x141c33, 40, 260);
      this.nightGroup.visible = true;
    } else {
      mat.map = this.dayTex;
      this.stars.visible = false;
      this.hemi.intensity = 1.0;
      this.hemi.color.set(0xc4d0e6);
      this.hemi.groundColor.set(0x6e6052);
      this.sun.intensity = 1.3;
      this.sun.color.set(0xfff0d8);
      this.sun.position.set(80, 150, 130);
      scene.fog = new THREE.Fog(0x667fc1, 60, 260);
      this.nightGroup.visible = false;
    }
    mat.needsUpdate = true;
    applyNightMats(this.night);
  }
}
