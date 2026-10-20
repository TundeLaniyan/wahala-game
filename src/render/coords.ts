/** Maps grid tiles to world space. The arena is centred on the origin; +y (grid south) is +z (towards the camera). */
export interface Layout {
  width: number;
  height: number;
  wx(x: number): number;
  wz(y: number): number;
}

export function createLayout(width: number, height: number): Layout {
  return {
    width,
    height,
    wx: (x) => x - width / 2 + 0.5,
    wz: (y) => y - height / 2 + 0.5,
  };
}
