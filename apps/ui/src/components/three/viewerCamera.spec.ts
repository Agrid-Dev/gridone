import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import {
  explodedHeight,
  fitDistance,
  fitView,
  focusView,
  planApproachView,
  planView,
} from "./viewerCamera";

const FOV = 45;

describe("fitDistance", () => {
  it("keeps the sphere inside the narrower view angle", () => {
    // A portrait canvas (aspect < 1) is horizontally tighter, so it needs to
    // back off further than a landscape one for the same radius.
    const portrait = fitDistance(10, FOV, 0.5, 1);
    const landscape = fitDistance(10, FOV, 16 / 9, 1);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it("grows linearly with the margin", () => {
    expect(fitDistance(10, FOV, 1.6, 2)).toBeCloseTo(
      fitDistance(10, FOV, 1.6, 1) * 2,
    );
  });

  it("stays finite for a degenerate radius or aspect", () => {
    expect(fitDistance(0, FOV, 0, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(fitDistance(0, FOV, Number.NaN, 1))).toBe(true);
  });
});

describe("explodedHeight", () => {
  it("adds one gap per storey above the first", () => {
    expect(explodedHeight(3, 4, 1)).toBe(9);
  });

  it("collapses to zero at spread 0 or with a single storey", () => {
    expect(explodedHeight(3, 4, 0)).toBe(0);
    expect(explodedHeight(3, 1, 1)).toBe(0);
    expect(explodedHeight(3, 0, 1)).toBe(0);
  });
});

describe("fitView", () => {
  const base = {
    size: new Vector3(20, 12, 30),
    center: new Vector3(0, 6, 0),
    gap: 4,
    storeyCount: 3,
    fov: FOV,
    aspect: 16 / 9,
  };

  it("backs off further as the building explodes", () => {
    const collapsed = fitView({ ...base, spread: 0 });
    const exploded = fitView({ ...base, spread: 1 });
    expect(exploded.position.distanceTo(exploded.target)).toBeGreaterThan(
      collapsed.position.distanceTo(collapsed.target),
    );
  });

  it("raises the pivot by half of the exploded height", () => {
    const { target } = fitView({ ...base, spread: 1 });
    // gap 4 * (3 - 1) = 8 of extra height, so the pivot rises by 4.
    expect(target.y).toBeCloseTo(10);
    expect(target.x).toBeCloseTo(0);
  });

  it("looks from the default three-quarter direction", () => {
    const { position, target } = fitView({ ...base, spread: 0 });
    const offset = position.clone().sub(target);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBeGreaterThan(0);
    expect(offset.z).toBeGreaterThan(0);
    expect(offset.x).toBeCloseTo(offset.z);
  });

  it("does not mutate the center it is given", () => {
    const center = new Vector3(0, 6, 0);
    fitView({ ...base, center, spread: 1 });
    expect(center.y).toBe(6);
  });
});

describe("focusView", () => {
  const box = new Box3(new Vector3(2, 0, 2), new Vector3(6, 3, 8));
  const args = { box, fov: FOV, aspect: 16 / 9 };

  it("centres on the box", () => {
    const { target } = focusView({
      ...args,
      from: new Vector3(50, 40, 50),
      pivot: new Vector3(0, 0, 0),
    });
    expect(target.x).toBeCloseTo(4);
    expect(target.y).toBeCloseTo(1.5);
    expect(target.z).toBeCloseTo(5);
  });

  it("preserves the direction the camera is already looking from", () => {
    const from = new Vector3(0, 30, 40);
    const pivot = new Vector3(0, 0, 0);
    const { position, target } = focusView({ ...args, from, pivot });
    const before = from.clone().sub(pivot).normalize();
    const after = position.clone().sub(target).normalize();
    expect(after.dot(before)).toBeCloseTo(1);
  });

  it("moves closer than a whole-building fit of the same scene", () => {
    const { position, target } = focusView({
      ...args,
      from: new Vector3(60, 40, 60),
      pivot: new Vector3(0, 0, 0),
    });
    const whole = fitView({
      size: new Vector3(20, 12, 30),
      center: new Vector3(0, 6, 0),
      gap: 4,
      storeyCount: 3,
      spread: 1,
      fov: FOV,
      aspect: 16 / 9,
    });
    expect(position.distanceTo(target)).toBeLessThan(
      whole.position.distanceTo(whole.target),
    );
  });

  it("falls back to the default direction when the camera sits on its pivot", () => {
    const { position, target } = focusView({
      ...args,
      from: new Vector3(1, 1, 1),
      pivot: new Vector3(1, 1, 1),
    });
    const offset = position.clone().sub(target);
    expect(offset.length()).toBeGreaterThan(0);
    expect(offset.x).toBeCloseTo(offset.z);
  });

  it("keeps a usable distance for a zero-size box", () => {
    const { position, target } = focusView({
      ...args,
      box: new Box3(new Vector3(1, 1, 1), new Vector3(1, 1, 1)),
      from: new Vector3(10, 10, 10),
      pivot: new Vector3(0, 0, 0),
    });
    expect(position.distanceTo(target)).toBeGreaterThan(0.5);
  });

  it("carries no orthographic zoom, so the tween leaves the camera's alone", () => {
    const goal = focusView({
      ...args,
      from: new Vector3(10, 10, 10),
      pivot: new Vector3(0, 0, 0),
    });
    const whole = fitView({
      size: new Vector3(20, 12, 30),
      center: new Vector3(0, 6, 0),
      gap: 4,
      storeyCount: 3,
      spread: 0,
      fov: FOV,
      aspect: 16 / 9,
    });
    expect(goal.zoom).toBeUndefined();
    expect(whole.zoom).toBeUndefined();
  });
});

describe("planApproachView", () => {
  // A 40 x 3 x 20 storey sitting between y=12 and y=15.
  const box = new Box3(new Vector3(-20, 12, -10), new Vector3(20, 15, 10));
  const args = { box, fov: FOV, aspect: 16 / 9 };

  it("parks above the storey centre, leaning slightly toward +Z", () => {
    const { position, target } = planApproachView(args);
    const offset = position.clone().sub(target);
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(13.5);
    expect(target.z).toBeCloseTo(0);
    expect(offset.x).toBeCloseTo(0);
    // The +Z lean keeps the azimuth defined and pins screen-up to -Z, matching
    // the orthographic plan that follows.
    expect(offset.z).toBeGreaterThan(0);
    expect(offset.y).toBeGreaterThan(offset.z * 10);
  });

  it("backs off further for a larger footprint", () => {
    const small = planApproachView(args);
    const large = planApproachView({
      ...args,
      box: new Box3(new Vector3(-40, 12, -20), new Vector3(40, 15, 20)),
    });
    expect(large.position.distanceTo(large.target)).toBeGreaterThan(
      small.position.distanceTo(small.target),
    );
  });

  it("does not mutate the box it is given", () => {
    const copy = box.clone();
    planApproachView(args);
    expect(box.min.equals(copy.min)).toBe(true);
    expect(box.max.equals(copy.max)).toBe(true);
  });
});

describe("planView", () => {
  // A 40 x 3 x 20 storey sitting between y=12 and y=15.
  const box = new Box3(new Vector3(-20, 12, -10), new Vector3(20, 15, 10));
  const viewport = { width: 800, height: 450 };

  it("hovers straight above the storey centre", () => {
    const { position, target } = planView({ box, ...viewport });
    expect(position.x).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(17);
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(13.5);
    expect(target.z).toBeCloseTo(0);
  });

  it("fits the tighter viewport axis", () => {
    // Landscape viewport, wide box: width allows 800/40 = 20 px/m, height
    // only 450/20 = 22.5 px/m — width binds (before margin).
    const landscape = planView({ box, ...viewport, margin: 1 });
    expect(landscape.zoom).toBeCloseTo(20);
    // Portrait viewport: the 40 m span now meets 450 px — width still binds,
    // but much tighter.
    const portrait = planView({ box, width: 450, height: 800, margin: 1 });
    expect(portrait.zoom).toBeCloseTo(450 / 40);
  });

  it("zooms out as the margin grows", () => {
    const snug = planView({ box, ...viewport, margin: 1 });
    const roomy = planView({ box, ...viewport, margin: 2 });
    expect(roomy.zoom).toBeCloseTo(snug.zoom / 2);
  });

  it("cuts the section inside the storey, below its ceiling", () => {
    const { position, near } = planView({ box, ...viewport });
    const cut = position.y - near;
    expect(cut).toBeGreaterThan(box.min.y);
    expect(cut).toBeLessThan(box.max.y);
  });

  it("keeps a flat storey's slab inside the cut", () => {
    const flat = new Box3(new Vector3(-20, 12, -10), new Vector3(20, 12, 10));
    const { position, near } = planView({ box: flat, ...viewport });
    // The cut plane must sit above the slab's y, not on or below it.
    expect(position.y - near).toBeGreaterThan(12);
  });

  it("stays finite and positive for a degenerate box or viewport", () => {
    const point = new Box3(new Vector3(1, 1, 1), new Vector3(1, 1, 1));
    const collapsed = planView({ box: point, ...viewport });
    expect(collapsed.zoom).toBeGreaterThan(0);
    expect(Number.isFinite(collapsed.zoom)).toBe(true);
    const zeroViewport = planView({ box, width: 0, height: 0 });
    expect(zeroViewport.zoom).toBeGreaterThan(0);
    expect(zeroViewport.near).toBeGreaterThan(0);
  });

  it("does not mutate the box it is given", () => {
    const copy = box.clone();
    planView({ box, ...viewport });
    expect(box.min.equals(copy.min)).toBe(true);
    expect(box.max.equals(copy.max)).toBe(true);
  });
});
