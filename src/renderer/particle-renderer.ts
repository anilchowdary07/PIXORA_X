// ============================================================
// Pixel Mosaic X — High-Performance Particle Renderer
// Supports: WebGPU (Primary) -> WebGL 2 -> WebGL 1 -> Canvas 2D (CPU Fallback)
// ============================================================

import type { AnimationConfig, AnimationStyle } from '../engine/types.ts';
import { DEFAULT_ANIMATION_CONFIG } from '../engine/types.ts';

export type RendererBackend = 'WebGPU' | 'WebGL 2' | 'WebGL 1' | 'Canvas 2D';

// ---- WebGL Shader Sources ----

const WEBGL_VERTEX_SHADER = `
attribute vec2 a_sourcePos;
attribute vec2 a_targetPos;
attribute vec3 a_color;
attribute float a_delay;

uniform float u_progress;
uniform float u_particleSize;
uniform float u_animStyle;
uniform float u_motionIntensity;
uniform float u_time;

varying vec3 v_color;
varying float v_alpha;

float easeInOutCubic(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

float hash21(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

void main() {
  float delaySpread = 0.35;
  float particleProgress = clamp((u_progress - a_delay * delaySpread) / (1.0 - delaySpread), 0.0, 1.0);
  float ep = easeInOutCubic(particleProgress);

  vec2 pos;

  // Flow (0)
  if (u_animStyle < 0.5) {
    vec2 mid = mix(a_sourcePos, a_targetPos, 0.5);
    float n1 = (hash21(a_sourcePos * 17.3) - 0.5) * u_motionIntensity * 0.4;
    float n2 = (hash21(a_sourcePos * 23.7 + 1.0) - 0.5) * u_motionIntensity * 0.4;
    mid += vec2(n1, n2);
    float t = ep;
    pos = (1.0 - t) * (1.0 - t) * a_sourcePos + 2.0 * (1.0 - t) * t * mid + t * t * a_targetPos;
  }
  // Explosion (1)
  else if (u_animStyle < 1.5) {
    float scatter = sin(particleProgress * 3.14159) * u_motionIntensity;
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = a_sourcePos - center;
    float len = length(dir);
    vec2 explodeOffset = (len > 0.001 ? normalize(dir) : vec2(hash21(a_sourcePos) - 0.5, hash21(a_sourcePos + 5.0) - 0.5)) * scatter * 0.4;
    pos = mix(a_sourcePos, a_targetPos, ep) + explodeOffset;
  }
  // Swarm (2)
  else if (u_animStyle < 2.5) {
    float group = floor(hash21(a_sourcePos * 7.0) * 6.0) / 6.0;
    float gp = clamp((u_progress - group * 0.4) / 0.6, 0.0, 1.0);
    float ge = easeInOutCubic(gp);
    pos = mix(a_sourcePos, a_targetPos, ge);
    float swirl = sin(ge * 6.283 + group * 6.283) * (1.0 - ge) * u_motionIntensity * 0.08;
    pos += vec2(swirl, cos(ge * 6.283 + group * 6.283) * (1.0 - ge) * u_motionIntensity * 0.08);
  }
  // Wave (3)
  else if (u_animStyle < 3.5) {
    float waveDelay = a_targetPos.x * 0.6 + a_targetPos.y * 0.2;
    float wp = clamp((u_progress - waveDelay * 0.5) / 0.5, 0.0, 1.0);
    float we = easeInOutCubic(wp);
    pos = mix(a_sourcePos, a_targetPos, we);
    pos.y += sin(wp * 6.283 + a_targetPos.x * 12.0) * (1.0 - we) * u_motionIntensity * 0.04;
  }
  // Morph (4)
  else {
    pos = mix(a_sourcePos, a_targetPos, easeInOutCubic(u_progress));
  }

  vec2 clipPos = pos * 2.0 - 1.0;
  clipPos.y = -clipPos.y;
  gl_Position = vec4(clipPos, 0.0, 1.0);
  gl_PointSize = u_particleSize;

  v_color = a_color;
  v_alpha = smoothstep(0.0, 0.05, particleProgress);
}
`;

const WEBGL_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float alpha = smoothstep(0.25, 0.1, d) * v_alpha;
  gl_FragColor = vec4(v_color, alpha);
}
`;

// ---- WebGPU WGSL Shaders ----

const WGSL_SHADERS = `
struct Uniforms {
  progress: f32,
  particleSize: f32,
  animStyle: f32,
  motionIntensity: f32,
  time: f32,
  aspectRatio: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
  @location(0) sourcePos: vec2<f32>,
  @location(1) targetPos: vec2<f32>,
  @location(2) color: vec3<f32>,
  @location(3) delay: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) alpha: f32,
  @location(2) quadCoord: vec2<f32>,
};

fn easeInOutCubic(t: f32) -> f32 {
  if (t < 0.5) {
    return 4.0 * t * t * t;
  } else {
    return 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }
}

fn hash21(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

@vertex
fn vs_main(
  in: VertexInput,
  @builtin(vertex_index) v_idx: u32
) -> VertexOutput {
  var out: VertexOutput;

  let delaySpread = 0.35;
  let particleProgress = clamp((u.progress - in.delay * delaySpread) / (1.0 - delaySpread), 0.0, 1.0);
  let ep = easeInOutCubic(particleProgress);

  var pos = in.sourcePos;

  // Flow (0)
  if (u.animStyle < 0.5) {
    var mid = mix(in.sourcePos, in.targetPos, 0.5);
    let n1 = (hash21(in.sourcePos * 17.3) - 0.5) * u.motionIntensity * 0.4;
    let n2 = (hash21(in.sourcePos * 23.7 + 1.0) - 0.5) * u.motionIntensity * 0.4;
    mid += vec2<f32>(n1, n2);
    let t = ep;
    pos = (1.0 - t) * (1.0 - t) * in.sourcePos + 2.0 * (1.0 - t) * t * mid + t * t * in.targetPos;
  }
  // Explosion (1)
  else if (u.animStyle < 1.5) {
    let scatter = sin(particleProgress * 3.14159) * u.motionIntensity;
    let center = vec2<f32>(0.5, 0.5);
    let dir = in.sourcePos - center;
    let len = length(dir);
    var explodeOffset = vec2<f32>(hash21(in.sourcePos) - 0.5, hash21(in.sourcePos + 5.0) - 0.5);
    if (len > 0.001) {
      explodeOffset = normalize(dir);
    }
    pos = mix(in.sourcePos, in.targetPos, ep) + explodeOffset * scatter * 0.4;
  }
  // Swarm (2)
  else if (u.animStyle < 2.5) {
    let group = floor(hash21(in.sourcePos * 7.0) * 6.0) / 6.0;
    let gp = clamp((u.progress - group * 0.4) / 0.6, 0.0, 1.0);
    let ge = easeInOutCubic(gp);
    pos = mix(in.sourcePos, in.targetPos, ge);
    let swirl = sin(ge * 6.283 + group * 6.283) * (1.0 - ge) * u.motionIntensity * 0.08;
    pos += vec2<f32>(swirl, cos(ge * 6.283 + group * 6.283) * (1.0 - ge) * u.motionIntensity * 0.08);
  }
  // Wave (3)
  else if (u.animStyle < 3.5) {
    let waveDelay = in.targetPos.x * 0.6 + in.targetPos.y * 0.2;
    let wp = clamp((u.progress - waveDelay * 0.5) / 0.5, 0.0, 1.0);
    let we = easeInOutCubic(wp);
    pos = mix(in.sourcePos, in.targetPos, we);
    pos.y += sin(wp * 6.283 + in.targetPos.x * 12.0) * (1.0 - we) * u.motionIntensity * 0.04;
  }
  // Morph (4)
  else {
    pos = mix(in.sourcePos, in.targetPos, easeInOutCubic(u.progress));
  }

  // Quad vertices
  let quadOffsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  var clipPos = pos * 2.0 - 1.0;
  clipPos.y = -clipPos.y;

  let quadOffset = quadOffsets[v_idx];
  let pSize = u.particleSize * 0.0025;
  clipPos += vec2<f32>(quadOffset.x * pSize, quadOffset.y * pSize * u.aspectRatio);

  out.position = vec4<f32>(clipPos, 0.0, 1.0);
  out.color = in.color;
  out.alpha = smoothstep(0.0, 0.05, particleProgress);
  out.quadCoord = quadOffset;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let d = dot(in.quadCoord, in.quadCoord);
  if (d > 1.0) {
    discard;
  }
  let softEdge = smoothstep(1.0, 0.4, d);
  return vec4<f32>(in.color, in.alpha * softEdge);
}
`;

function compileShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

const ANIM_STYLE_MAP: Record<AnimationStyle, number> = {
  flow: 0,
  explosion: 1,
  swarm: 2,
  wave: 3,
  morph: 4,
};

// ---- Particle Renderer ----

export class ParticleRenderer {
  private canvas: HTMLCanvasElement;
  private backend: RendererBackend = 'Canvas 2D';

  // WebGL context & state
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private sourcePosBuffer: WebGLBuffer | null = null;
  private targetPosBuffer: WebGLBuffer | null = null;
  private colorBuffer: WebGLBuffer | null = null;
  private delayBuffer: WebGLBuffer | null = null;

  // WebGPU context & state (typed as any to remain zero-dependency)
  private gpuDevice: any = null;
  private gpuPipeline: any = null;
  private gpuUniformBuffer: any = null;
  private gpuParticleBuffer: any = null;
  private gpuBindGroup: any = null;
  private gpuContext: any = null;

  // Canvas 2D fallback
  private ctx2d: CanvasRenderingContext2D | null = null;

  // Animation state
  private animationId = 0;
  private particleCount = 0;
  private progress = 0;
  private config: AnimationConfig;
  private isPlaying = false;
  private isPaused = false;
  private startTime = 0;
  private pausedAt = 0;
  private pauseOffset = 0;
  private onComplete: (() => void) | null = null;
  private onProgressUpdate: ((p: number) => void) | null = null;
  private fpsHistory: number[] = [];
  private lastFrameTime = 0;

  // CPU data for canvas fallback
  private cpuSourcePos: Float32Array | null = null;
  private cpuTargetPos: Float32Array | null = null;
  private cpuColors: Uint8Array | null = null;
  private cpuDelays: Float32Array | null = null;

  // Uniform & attribute locations
  private uProgress = -1;
  private uParticleSize = -1;
  private uAnimStyle = -1;
  private uMotionIntensity = -1;
  private uTime = -1;
  private aSourcePos = -1;
  private aTargetPos = -1;
  private aColor = -1;
  private aDelay = -1;

  constructor(canvas: HTMLCanvasElement, config?: Partial<AnimationConfig>) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_ANIMATION_CONFIG, ...config };
  }

  /**
   * Attempt asynchronous upgrade to WebGPU if hardware supports it.
   * If WebGPU is unsupported or fails, falls back cleanly to WebGL 2 -> WebGL 1 -> Canvas 2D.
   */
  async initWebGPUIfSupported(): Promise<RendererBackend> {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
      try {
        const gpu = (navigator as any).gpu;
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          const device = await adapter.requestDevice();
          const context: any = this.canvas.getContext('webgpu');
          if (device && context) {
            const format = gpu.getPreferredCanvasFormat();
            context.configure({
              device,
              format,
              alphaMode: 'premultiplied',
            });

            const shaderModule = device.createShaderModule({
              code: WGSL_SHADERS,
            });

            const uniformBuffer = device.createBuffer({
              size: 32, // 8 x 4 bytes
              usage: 0x0040 | 0x0008, // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            const pipeline = device.createRenderPipeline({
              layout: 'auto',
              vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                  {
                    arrayStride: 32, // 8 floats
                    stepMode: 'instance',
                    attributes: [
                      { shaderLocation: 0, offset: 0, format: 'float32x2' },  // sourcePos
                      { shaderLocation: 1, offset: 8, format: 'float32x2' },  // targetPos
                      { shaderLocation: 2, offset: 16, format: 'float32x3' }, // color
                      { shaderLocation: 3, offset: 28, format: 'float32' },   // delay
                    ],
                  },
                ],
              },
              fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [
                  {
                    format,
                    blend: {
                      color: {
                        srcFactor: 'src-alpha',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add',
                      },
                      alpha: {
                        srcFactor: 'one',
                        dstFactor: 'one-minus-src-alpha',
                        operation: 'add',
                      },
                    },
                  },
                ],
              },
              primitive: {
                topology: 'triangle-list',
              },
            });

            this.gpuDevice = device;
            this.gpuPipeline = pipeline;
            this.gpuUniformBuffer = uniformBuffer;
            this.gpuContext = context;
            this.gpuBindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                {
                  binding: 0,
                  resource: { buffer: uniformBuffer },
                },
              ],
            });

            this.backend = 'WebGPU';
            console.log('⚡ Pixel Mosaic X: WebGPU Pipeline Initialized Successfully');
            return 'WebGPU';
          }
        }
      } catch (err) {
        console.warn('WebGPU init failed, using WebGL fallback:', err);
      }
    }
    if (!this.gl && !this.ctx2d) {
      this.initGL();
    }
    return this.backend;
  }

  private initGL(): void {
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null =
      this.canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });

    if (gl) {
      this.backend = 'WebGL 2';
    } else {
      gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
      if (gl) this.backend = 'WebGL 1';
    }

    if (!gl) {
      console.warn('WebGL not available, falling back to Canvas 2D');
      this.backend = 'Canvas 2D';
      this.ctx2d = this.canvas.getContext('2d');
      return;
    }

    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER);
    if (!vs || !fs) {
      console.warn('Shader compilation failed, falling back to Canvas 2D');
      this.backend = 'Canvas 2D';
      this.ctx2d = this.canvas.getContext('2d');
      return;
    }

    this.program = createProgram(gl, vs, fs);
    if (!this.program) {
      this.backend = 'Canvas 2D';
      this.ctx2d = this.canvas.getContext('2d');
      return;
    }

    gl.useProgram(this.program);

    this.aSourcePos = gl.getAttribLocation(this.program, 'a_sourcePos');
    this.aTargetPos = gl.getAttribLocation(this.program, 'a_targetPos');
    this.aColor = gl.getAttribLocation(this.program, 'a_color');
    this.aDelay = gl.getAttribLocation(this.program, 'a_delay');

    this.uProgress = gl.getUniformLocation(this.program, 'u_progress') as number;
    this.uParticleSize = gl.getUniformLocation(this.program, 'u_particleSize') as number;
    this.uAnimStyle = gl.getUniformLocation(this.program, 'u_animStyle') as number;
    this.uMotionIntensity = gl.getUniformLocation(this.program, 'u_motionIntensity') as number;
    this.uTime = gl.getUniformLocation(this.program, 'u_time') as number;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.039, 0.039, 0.059, 1.0);
  }

  setParticles(
    sourcePositions: Float32Array,
    targetPositions: Float32Array,
    colors: Uint8Array,
    _width: number,
    _height: number
  ): void {
    if (this.backend !== 'WebGPU' && !this.gl && !this.ctx2d) {
      this.initGL();
    }
    this.particleCount = sourcePositions.length / 2;

    const delays = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      const sx = sourcePositions[i * 2];
      const sy = sourcePositions[i * 2 + 1];
      delays[i] = sx * 0.3 + sy * 0.7;
    }

    this.cpuSourcePos = sourcePositions;
    this.cpuTargetPos = targetPositions;
    this.cpuColors = colors;
    this.cpuDelays = delays;

    // WebGPU buffer upload
    if (this.backend === 'WebGPU' && this.gpuDevice) {
      const stride = 8; // floats: sx, sy, tx, ty, r, g, b, delay
      const particleBufferData = new Float32Array(this.particleCount * stride);
      for (let i = 0; i < this.particleCount; i++) {
        const off = i * stride;
        particleBufferData[off] = sourcePositions[i * 2];
        particleBufferData[off + 1] = sourcePositions[i * 2 + 1];
        particleBufferData[off + 2] = targetPositions[i * 2];
        particleBufferData[off + 3] = targetPositions[i * 2 + 1];
        particleBufferData[off + 4] = colors[i * 3] / 255;
        particleBufferData[off + 5] = colors[i * 3 + 1] / 255;
        particleBufferData[off + 6] = colors[i * 3 + 2] / 255;
        particleBufferData[off + 7] = delays[i];
      }

      this.gpuParticleBuffer = this.gpuDevice.createBuffer({
        size: particleBufferData.byteLength,
        usage: 0x0020 | 0x0008, // GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        mappedAtCreation: true,
      });
      new Float32Array(this.gpuParticleBuffer.getMappedRange()).set(particleBufferData);
      this.gpuParticleBuffer.unmap();
    }

    // WebGL buffer upload
    if (this.gl) {
      const gl = this.gl;

      this.sourcePosBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sourcePosBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, sourcePositions, gl.STATIC_DRAW);

      this.targetPosBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.targetPosBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, targetPositions, gl.STATIC_DRAW);

      const normalizedColors = new Float32Array(this.particleCount * 3);
      for (let i = 0; i < this.particleCount * 3; i++) {
        normalizedColors[i] = colors[i] / 255;
      }
      this.colorBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, normalizedColors, gl.STATIC_DRAW);

      this.delayBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.delayBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, delays, gl.STATIC_DRAW);
    }
  }

  play(onComplete?: () => void, onProgress?: (p: number) => void): void {
    this.onComplete = onComplete || null;
    this.onProgressUpdate = onProgress || null;
    this.isPlaying = true;
    this.isPaused = false;
    this.progress = 0;
    this.startTime = performance.now();
    this.pauseOffset = 0;
    this.fpsHistory = [];
    this.lastFrameTime = this.startTime;
    this.animate();
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.pausedAt = performance.now();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pauseOffset += performance.now() - this.pausedAt;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  restart(): void {
    this.stop();
    if (this.onComplete) {
      const cb = this.onComplete;
      this.play(cb, this.onProgressUpdate || undefined);
    } else {
      this.play(undefined, this.onProgressUpdate || undefined);
    }
  }

  skipToEnd(): void {
    this.stop();
    this.progress = 1.0;
    this.renderFrame(1.0);
    if (this.onComplete) this.onComplete();
  }

  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  setProgress(progress: number): void {
    this.progress = Math.max(0, Math.min(1, progress));
    this.renderFrame(this.progress);
  }

  setConfig(config: Partial<AnimationConfig>): void {
    Object.assign(this.config, config);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getBackend(): RendererBackend {
    return this.backend;
  }

  getFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }

  getProgress(): number {
    return this.progress;
  }

  dispose(): void {
    this.stop();
    if (this.gl) {
      if (this.sourcePosBuffer) this.gl.deleteBuffer(this.sourcePosBuffer);
      if (this.targetPosBuffer) this.gl.deleteBuffer(this.targetPosBuffer);
      if (this.colorBuffer) this.gl.deleteBuffer(this.colorBuffer);
      if (this.delayBuffer) this.gl.deleteBuffer(this.delayBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    if (this.gpuParticleBuffer) {
      this.gpuParticleBuffer.destroy?.();
    }
    if (this.gpuUniformBuffer) {
      this.gpuUniformBuffer.destroy?.();
    }
  }

  private animate = (): void => {
    if (!this.isPlaying || this.isPaused) return;

    const now = performance.now();
    const elapsed = (now - this.startTime - this.pauseOffset) / 1000;
    const duration = this.config.duration / this.config.speed;

    const dt = now - this.lastFrameTime;
    if (dt > 0) {
      this.fpsHistory.push(1000 / dt);
      if (this.fpsHistory.length > 60) this.fpsHistory.shift();
    }
    this.lastFrameTime = now;

    this.progress = Math.min(1, elapsed / duration);

    this.renderFrame(this.progress);

    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.progress);
    }

    if (this.progress >= 1) {
      this.isPlaying = false;
      this.renderFrame(1.0);
      if (this.onComplete) this.onComplete();
      return;
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private renderFrame(progress: number): void {
    if (this.backend === 'WebGPU' && this.gpuDevice) {
      this.renderWebGPU(progress);
    } else if (this.backend.startsWith('WebGL') && this.gl) {
      this.renderWebGL(progress);
    } else {
      this.renderCanvas2D(progress);
    }
  }

  private renderWebGPU(progress: number): void {
    const device = this.gpuDevice;
    const context = this.gpuContext;
    if (!device || !context || !this.gpuParticleBuffer) return;

    const aspectRatio = this.canvas.width / (this.canvas.height || 1);
    const uniformData = new Float32Array([
      progress,
      this.config.particleSize * (window.devicePixelRatio || 1),
      ANIM_STYLE_MAP[this.config.style],
      this.config.motionIntensity,
      performance.now() / 1000,
      aspectRatio,
      0,
      0,
    ]);

    device.queue.writeBuffer(this.gpuUniformBuffer, 0, uniformData);

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.039, g: 0.039, b: 0.059, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.gpuPipeline);
    renderPass.setBindGroup(0, this.gpuBindGroup);
    renderPass.setVertexBuffer(0, this.gpuParticleBuffer);
    renderPass.draw(6, this.particleCount, 0, 0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  private renderWebGL(progress: number): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.uniform1f(this.uProgress, progress);
    gl.uniform1f(this.uParticleSize, this.config.particleSize * (window.devicePixelRatio || 1));
    gl.uniform1f(this.uAnimStyle, ANIM_STYLE_MAP[this.config.style]);
    gl.uniform1f(this.uMotionIntensity, this.config.motionIntensity);
    gl.uniform1f(this.uTime, performance.now() / 1000);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourcePosBuffer);
    gl.enableVertexAttribArray(this.aSourcePos);
    gl.vertexAttribPointer(this.aSourcePos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.targetPosBuffer);
    gl.enableVertexAttribArray(this.aTargetPos);
    gl.vertexAttribPointer(this.aTargetPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.delayBuffer);
    gl.enableVertexAttribArray(this.aDelay);
    gl.vertexAttribPointer(this.aDelay, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, this.particleCount);
  }

  private renderCanvas2D(progress: number): void {
    const ctx = this.ctx2d;
    if (!ctx || !this.cpuSourcePos || !this.cpuTargetPos || !this.cpuColors) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    const maxCanvas2D = Math.min(this.particleCount, 50000);
    const step = Math.max(1, Math.floor(this.particleCount / maxCanvas2D));
    const size = Math.max(1, this.config.particleSize);

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    for (let i = 0; i < this.particleCount; i += step) {
      const delay = this.cpuDelays ? this.cpuDelays[i] : 0;
      const pp = Math.max(0, Math.min(1, (progress - delay * 0.35) / 0.65));
      const ep = easeInOutCubic(pp);

      const sx = this.cpuSourcePos[i * 2];
      const sy = this.cpuSourcePos[i * 2 + 1];
      const tx = this.cpuTargetPos[i * 2];
      const ty = this.cpuTargetPos[i * 2 + 1];

      const x = (sx + (tx - sx) * ep) * w;
      const y = (sy + (ty - sy) * ep) * h;

      const r = this.cpuColors[i * 3];
      const g = this.cpuColors[i * 3 + 1];
      const b = this.cpuColors[i * 3 + 2];

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
}

/**
 * In-browser canvas animation video recorder (WebM).
 */
export class AnimationRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  start(canvas: HTMLCanvasElement, fps: number = 60): boolean {
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      return false;
    }
    try {
      this.recordedChunks = [];
      const stream = canvas.captureStream(fps);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';

      if (!mimeType) return false;

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6000000,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start();
      return true;
    } catch (err) {
      console.warn('Animation recording error:', err);
      return false;
    }
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(this.recordedChunks.length > 0 ? new Blob(this.recordedChunks, { type: 'video/webm' }) : null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }
}
