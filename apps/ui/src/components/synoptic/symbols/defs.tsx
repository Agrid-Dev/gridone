/** Ids of the gradients the kit paints volumes with. One `<KitDefs>` per
 *  svg declares them; a `url(#…)` fill on a body reads the first one in
 *  the document, so two plates on a page share the same set. */
export const KIT_GRADIENT = {
  /** Top face of a box: light at the back, metal at the front. */
  top: "syn-top",
  /** The `+y` face, the darker of the two visible sides. */
  left: "syn-left",
  /** The `+x` face. */
  right: "syn-right",
  /** Round bodies: a highlight a third of the way across. */
  cylinder: "syn-cyl",
  /** A bar or a tube, lit from above. */
  tube: "syn-tube",
  brass: "syn-brass",
  vessel: "syn-vessel",
  slab: "syn-slab",
} as const;

export const fillUrl = (id: string) => `url(#${id})`;

type Stop = { offset: number; token: string };

const stop = ({ offset, token }: Stop) => (
  <stop
    key={offset}
    offset={offset}
    style={{ stopColor: `hsl(var(--synoptic-${token}))` }}
  />
);

const LINEAR: {
  id: string;
  from: [number, number];
  to: [number, number];
  stops: Stop[];
}[] = [
  {
    id: KIT_GRADIENT.top,
    from: [0, 0],
    to: [0, 1],
    stops: [
      { offset: 0, token: "metal-hi" },
      { offset: 1, token: "metal" },
    ],
  },
  {
    id: KIT_GRADIENT.left,
    from: [0, 0],
    to: [1, 0],
    stops: [
      { offset: 0, token: "metal" },
      { offset: 1, token: "metal-lo" },
    ],
  },
  {
    id: KIT_GRADIENT.right,
    from: [0, 0],
    to: [1, 0],
    stops: [
      { offset: 0, token: "metal-hi" },
      { offset: 1, token: "metal" },
    ],
  },
  {
    id: KIT_GRADIENT.cylinder,
    from: [0, 0],
    to: [1, 0],
    stops: [
      { offset: 0, token: "metal-lo" },
      { offset: 0.28, token: "metal-hi" },
      { offset: 0.6, token: "metal" },
      { offset: 1, token: "metal-lo" },
    ],
  },
  {
    id: KIT_GRADIENT.tube,
    from: [0, 0],
    to: [0, 1],
    stops: [
      { offset: 0, token: "metal-hi" },
      { offset: 0.5, token: "metal" },
      { offset: 1, token: "metal-lo" },
    ],
  },
  {
    id: KIT_GRADIENT.brass,
    from: [0, 0],
    to: [1, 1],
    stops: [
      { offset: 0, token: "brass-hi" },
      { offset: 1, token: "brass-lo" },
    ],
  },
  {
    id: KIT_GRADIENT.slab,
    from: [0, 0],
    to: [1, 1],
    stops: [
      { offset: 0, token: "slab-hi" },
      { offset: 1, token: "slab-lo" },
    ],
  },
];

/** The gradients of the illustrated kit, every stop a theme token so a
 *  body shades the same way in light and dark. Rendered once per plate,
 *  before anything that fills with them. */
export function KitDefs() {
  return (
    <defs data-kit-defs>
      {LINEAR.map(({ id, from, to, stops }) => (
        <linearGradient
          key={id}
          id={id}
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
        >
          {stops.map(stop)}
        </linearGradient>
      ))}
      <radialGradient id={KIT_GRADIENT.vessel} cx={0.35} cy={0.3} r={0.8}>
        {[
          { offset: 0, token: "vessel-hi" },
          { offset: 0.55, token: "vessel-lo" },
          { offset: 1, token: "vessel-lo" },
        ].map(stop)}
      </radialGradient>
    </defs>
  );
}
