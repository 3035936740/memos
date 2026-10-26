import vertexSource from "@/vendor/rain-effect/shaders/simple.vert?raw";
import fragmentSource from "@/vendor/rain-effect/shaders/water.frag?raw";

/** Small WebGL adapter for the vendored RainEffect refraction shader. */
export const createRainRenderer = (canvas: HTMLCanvasElement, scale: number) => {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: "low-power" });
  if (!gl) return;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Cannot create rain shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Cannot compile rain shader");
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Cannot create rain renderer");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Cannot link rain shader");
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const locations = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, `u_${name}`));
    return locations.get(name)!;
  };
  const textures = Array.from({ length: 4 }, (_, index) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 210, 215, 255]));
    return texture;
  });
  ["waterMap", "textureShine", "textureFg", "textureBg"].forEach((name, index) => gl.uniform1i(uniform(name), index));
  gl.uniform2f(uniform("parallax"), 0, 0);
  gl.uniform1f(uniform("parallaxFg"), 0);
  gl.uniform1f(uniform("parallaxBg"), 0);
  gl.uniform1i(uniform("renderShine"), 0);
  gl.uniform1i(uniform("renderShadow"), 1);
  gl.uniform1f(uniform("minRefraction"), 32 * scale);
  gl.uniform1f(uniform("refractionDelta"), 64 * scale);
  gl.uniform1f(uniform("brightness"), 1.02);
  gl.uniform1f(uniform("alphaMultiply"), 6);
  gl.uniform1f(uniform("alphaSubtract"), 3);
  gl.uniform2f(uniform("backgroundOffset"), 0, 0);
  gl.uniform2f(uniform("backgroundSize"), 1, 1);
  const textureSizes = textures.map(() => ({ width: 1, height: 1 }));
  const upload = (index: number, image: HTMLCanvasElement) => {
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, textures[index]);
    const size = textureSizes[index];
    if (size.width === image.width && size.height === image.height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      size.width = image.width;
      size.height = image.height;
    }
  };
  return {
    background(image: HTMLCanvasElement, extent: [number, number] = [1, 1]) {
      upload(2, image);
      gl.uniform1f(uniform("textureRatio"), image.width / image.height);
      gl.uniform2f(uniform("backgroundSize"), extent[0], extent[1]);
    },
    environment(image: HTMLCanvasElement) {
      upload(3, image);
    },
    scroll(x: number, y: number) {
      gl.uniform2f(uniform("backgroundOffset"), x, y);
    },
    resize(nextScale: number) {
      gl.uniform1f(uniform("minRefraction"), 32 * nextScale);
      gl.uniform1f(uniform("refractionDelta"), 64 * nextScale);
    },
    draw(water: HTMLCanvasElement) {
      upload(0, water);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniform("resolution"), canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      for (const texture of textures) gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
};
