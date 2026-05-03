// Default Freeform design shown to Crafter-tier users as a read-only preview.
// Inspired by the rainbow scale maille bracelet from Woven Rainbows by Erin:
//   /images/etsy/il_fullxfull.6878698285_5vj8.jpg
//
// Layout: 4 rows × 14 cols of dark rings framing 2 rows × 7 rainbow scales.
// Geometry matches default Weave Tuner settings.

export interface DefaultRing {
  row: number;
  col: number;
  cluster: number;
  color: string;
}

export interface DefaultDesign {
  version: 2;
  type: "freeform";
  geometry: {
    innerDiameter: number;
    wireDiameter: number;
    centerSpacing: number;
    angleIn: number;
    angleOut: number;
  };
  rings: DefaultRing[];
  scaleColors: Array<{ key: string; color: string }>; // key = "row,col"
  previewImage: string; // public path
}

// Rainbow palette (red → purple)
const RAINBOW = [
  "#e53e3e", // red
  "#dd6b20", // orange
  "#d69e2e", // yellow
  "#38a169", // green
  "#2b9bd4", // teal/cyan
  "#3b5bdb", // blue
  "#7048e8", // purple
];

const RING_COLOR = "#2a2a2a"; // dark silver — matches the black rings in the reference

function makeRings(): DefaultRing[] {
  const rings: DefaultRing[] = [];
  // 4 rows × 14 cols of background rings
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 14; col++) {
      rings.push({ row, col, cluster: 1, color: RING_COLOR });
    }
  }
  return rings;
}

function makeScaleColors(): Array<{ key: string; color: string }> {
  const scales: Array<{ key: string; color: string }> = [];
  // Row 1: 7 rainbow scales, cols 3–9
  RAINBOW.forEach((color, i) => {
    scales.push({ key: `1,${i + 3}`, color });
  });
  // Row 2: 6 scales offset by half, cols 3–8 (repeat rainbow shifted by 1)
  for (let i = 0; i < 6; i++) {
    scales.push({ key: `2,${i + 3}`, color: RAINBOW[(i + 1) % RAINBOW.length] });
  }
  return scales;
}

const defaultFreeformDesign: DefaultDesign = {
  version: 2,
  type: "freeform",
  geometry: {
    innerDiameter: 7.94,
    wireDiameter: 1.2,
    centerSpacing: 6.7,
    angleIn: 25,
    angleOut: -25,
  },
  rings: makeRings(),
  scaleColors: makeScaleColors(),
  previewImage: "/images/etsy/il_fullxfull.6878698285_5vj8.jpg",
};

export default defaultFreeformDesign;
