import * as THREE from "three";
import SpriteText from "three-spritetext";

export function _generateRingsBase({
  rows,
  cols,
  ID_mm,
  WD_mm,
  OD_mm,
  centerSpacing,
  layout = [],
}: {
  rows: number;
  cols: number;
  ID_mm: number;
  WD_mm: number;
  OD_mm: number;
  centerSpacing?: number;
  layout?: any[];
}) {
  const spacing = centerSpacing ?? 7.5;
  const rings: any[] = [];

  for (let r = 0; r < rows; r++) {
    const rowOffset = r % 2 === 1 ? spacing / 2 : 0;
    const tilt = layout[r]?.tilt ?? 0;
    const tiltRad = THREE.MathUtils.degToRad(tilt);

    for (let c = 0; c < cols; c++) {
      rings.push({
        row: r,
        col: c,
        x: c * spacing + rowOffset,
        y: r * spacing * 0.866,
        z: 0,
        innerDiameter: ID_mm,
        wireDiameter: WD_mm,
        radius: OD_mm / 2,
        centerSpacing: spacing,
        tilt,
        tiltRad,
      });
    }
  }

  return rings;
}

export function generateRingsDesigner(opts: any) {
  const { rows, cols, innerDiameter, wireDiameter, centerSpacing, angleIn = 25, angleOut = -25, layout = [] } = opts;

  const finalLayout: any[] = [];
  for (let r = 0; r < rows; r++) {
    finalLayout[r] = {
      ...(layout[r] || {}),
      tilt: r % 2 === 0 ? angleIn : angleOut,
    };
  }

  return _generateRingsBase({
    rows,
    cols,
    ID_mm: innerDiameter,
    WD_mm: wireDiameter,
    OD_mm: innerDiameter + 2 * wireDiameter,
    centerSpacing,
    layout: finalLayout,
  });
}

export const generateRings = generateRingsDesigner;