import type { Pt } from "../types";
import { extrude } from "./extrude";
import { pointsAttr } from "./plan";

const FACE_CLASS: Record<"x" | "y", string> = {
  x: "fill-synoptic-body-x",
  y: "fill-synoptic-body-y",
};

type BodyProps = {
  /** Plan outline in cells. */
  outline: Pt[];
  z0: number;
  z1: number;
};

/** A plan outline given height in the isometric view: the two toned side
 *  faces, the silhouette band and the top face. */
export function Body({ outline, z0, z1 }: BodyProps) {
  const { faces, band, top } = extrude(outline, z0, z1);
  return (
    <>
      {faces.map((face, i) => (
        <polygon
          key={i}
          points={pointsAttr(face.points)}
          className={FACE_CLASS[face.axis]}
        />
      ))}
      <polygon
        points={pointsAttr(band)}
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-none stroke-synoptic-stroke"
      />
      <polygon
        points={pointsAttr(top)}
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-synoptic-body stroke-synoptic-stroke"
      />
    </>
  );
}
