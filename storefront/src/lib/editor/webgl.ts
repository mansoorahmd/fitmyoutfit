/** Whether this browser can make a WebGL 2 context, which the designer needs (it is drawn in 3D). */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return !!canvas.getContext("webgl2")
  } catch {
    return false
  }
}
