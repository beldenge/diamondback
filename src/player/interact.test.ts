import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { pickInteractable } from "./interact";
import type { InteractableSpec } from "../world/layout";

const bed: InteractableSpec = {
  id: "hotel.bed",
  label: "Sleep until morning",
  kind: "sleep",
  x: 0,
  y: 0.5,
  z: -2,
  radius: 1.2,
};

function camAt(z: number, lookZ = -1): PerspectiveCamera {
  const cam = new PerspectiveCamera(70, 1, 0.1, 100);
  cam.position.set(0, 1.6, z);
  cam.lookAt(0, 1.6, z + lookZ);
  cam.updateMatrixWorld();
  return cam;
}

describe("pickInteractable", () => {
  it("hits a bed the camera is facing within reach", () => {
    expect(pickInteractable(camAt(0, -1), [bed])?.id).toBe("hotel.bed");
  });

  it("ignores a bed behind the camera", () => {
    expect(pickInteractable(camAt(0, 1), [bed])).toBeNull();
  });

  it("ignores a bed that is too far", () => {
    expect(pickInteractable(camAt(20, -1), [bed])).toBeNull();
  });
});
