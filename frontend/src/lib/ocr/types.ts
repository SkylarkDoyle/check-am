/** RGBA pixels, same layout as the browser's ImageData. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One 8-bit channel. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
