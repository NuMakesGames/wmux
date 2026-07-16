import { useEffect, useRef, useState } from "react";

export function EmptyWorkspaceView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<LifeViewSettings>(defaultLifeViewSettings);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let shaderUnavailable = false;
    const markUnavailable = (event?: Event) => {
      event?.preventDefault();
      shaderUnavailable = true;
      canvas.classList.add("shader-unavailable");
    };
    const markAvailable = () => {
      shaderUnavailable = false;
      canvas.classList.remove("shader-unavailable");
    };
    const restoreRenderer = () => {
      markAvailable();
      setRendererGeneration((generation) => generation + 1);
    };
    canvas.addEventListener("webglcontextlost", markUnavailable);
    canvas.addEventListener("webglcontextrestored", restoreRenderer);

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      markUnavailable();
      return () => {
        canvas.removeEventListener("webglcontextlost", markUnavailable);
        canvas.removeEventListener("webglcontextrestored", restoreRenderer);
      };
    }

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    if (!program) {
      markUnavailable();
      return () => {
        canvas.removeEventListener("webglcontextlost", markUnavailable);
        canvas.removeEventListener("webglcontextrestored", restoreRenderer);
      };
    }
    markAvailable();
    const positionBuffer = gl.createBuffer();
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const lifeTextureLocation = gl.getUniformLocation(program, "u_life");
    const lifeResolutionLocation = gl.getUniformLocation(program, "u_life_resolution");
    const surfaceSpeedLocation = gl.getUniformLocation(program, "u_surface_speed");
    const heightMixLocation = gl.getUniformLocation(program, "u_height_mix");
    const pointerLocation = gl.getUniformLocation(program, "u_pointer");
    const interactionLocation = gl.getUniformLocation(program, "u_interaction");
    const life = createLifeSimulation();
    const pointer = { x: 0, y: 0, active: 0 };
    const interaction = { x: 0, y: 0, startedAt: -100 };
    const lifeTexture = gl.createTexture();
    if (!lifeTexture) {
      markUnavailable();
      return () => {
        canvas.removeEventListener("webglcontextlost", markUnavailable);
        canvas.removeEventListener("webglcontextrestored", restoreRenderer);
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        gl.deleteProgram(program);
      };
    }
    configureLifeTexture(gl, lifeTexture);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const updatePointer = (event: PointerEvent) => {
      const ground = unprojectGround(pointerUv(event, canvas));
      pointer.x = Math.floor(ground[0]);
      pointer.y = Math.floor(ground[1]);
      pointer.active = 1;
    };
    const onPointerMove = (event: PointerEvent) => updatePointer(event);
    const onPointerLeave = () => {
      pointer.active = 0;
    };
    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event);
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const hit = pickLifeCell(event, canvas, life, elapsedSeconds, interaction);
      if (!hit) return;
      toggleLifeCell(life, hit.x, hit.y, performance.now());
      interaction.x = hit.x;
      interaction.y = hit.y;
      interaction.startedAt = elapsedSeconds;
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);

    let animationFrame = 0;
    let animationTimer: number | undefined;
    let destroyed = false;
    let inViewport = true;
    let resizePending = true;
    let requestedFrameAt = 0;
    let renderedFrames = 0;
    const quality = createIdleRenderQuality();
    const startedAt = performance.now();
    const canRender = () => !destroyed && inViewport && document.visibilityState !== "hidden";
    const cancelScheduledRender = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (animationTimer !== undefined) window.clearTimeout(animationTimer);
      animationTimer = undefined;
    };
    const scheduleRender = (delay = quality.intervalMs) => {
      if (!canRender() || animationTimer !== undefined || animationFrame !== 0) return;
      animationTimer = window.setTimeout(() => {
        animationTimer = undefined;
        if (!canRender()) return;
        requestedFrameAt = performance.now();
        animationFrame = requestAnimationFrame(render);
      }, delay);
    };
    const resumeRendering = () => {
      cancelScheduledRender();
      if (canRender()) scheduleRender(0);
    };
    const onVisibilityChange = () => resumeRendering();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          resizePending = true;
          scheduleRender(0);
        });
    resizeObserver?.observe(canvas);
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          inViewport = entry?.isIntersecting ?? true;
          resumeRendering();
        });
    intersectionObserver?.observe(canvas);
    const render = (now: number) => {
      animationFrame = 0;
      if (!canRender()) return;
      if (shaderUnavailable || gl.isContextLost()) {
        markUnavailable();
        scheduleRender(250);
        return;
      }
      const activeSettings = settingsRef.current;
      const elapsedSeconds = (now - startedAt) / 1000;
      if (resizePending) {
        resizeCanvas(canvas, gl, quality.scale);
        resizePending = false;
      }
      updateLifeSimulation(life, now, activeSettings);
      const heightMix = uploadLifeTexture(gl, lifeTexture, life, elapsedSeconds, activeSettings);
      gl.useProgram(program);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, elapsedSeconds);
      gl.uniform1i(lifeTextureLocation, 0);
      gl.uniform2f(lifeResolutionLocation, life.width, life.height);
      gl.uniform1f(surfaceSpeedLocation, activeSettings.surfaceSpeed);
      gl.uniform1f(heightMixLocation, heightMix);
      gl.uniform3f(pointerLocation, pointer.x, pointer.y, pointer.active);
      gl.uniform4f(interactionLocation, interaction.x, interaction.y, interaction.startedAt, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      renderedFrames += 1;
      if (updateIdleRenderQuality(quality, Math.max(0, now - requestedFrameAt))) {
        resizePending = true;
      }
      canvas.dataset.renderScale = quality.scale.toFixed(2);
      canvas.dataset.renderFps = String(Math.round(1000 / quality.intervalMs));
      canvas.dataset.renderFrame = String(renderedFrames);
      scheduleRender(Math.max(0, quality.intervalMs - (performance.now() - now)));
    };
    scheduleRender(0);

    return () => {
      destroyed = true;
      cancelScheduledRender();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("webglcontextlost", markUnavailable);
      canvas.removeEventListener("webglcontextrestored", restoreRenderer);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      gl.deleteTexture(lifeTexture);
      gl.deleteProgram(program);
    };
  }, [rendererGeneration]);

  const updateSetting = (key: keyof LifeViewSettings, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSettingsStatus("");
  };

  const copySettings = async () => {
    const payload = JSON.stringify(settings, null, 2);
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(payload);
      setSettingsStatus(`copied\n${payload}`);
    } catch {
      if (copyTextFallback(payload)) {
        setSettingsStatus(`copied\n${payload}`);
      } else {
        setSettingsStatus(payload);
      }
    }
  };

  const pasteSettings = async () => {
    try {
      const clipboard = navigator.clipboard
        ? await navigator.clipboard.readText()
        : window.prompt("Paste wmux Life settings JSON") ?? "";
      applyPastedSettings(clipboard);
    } catch {
      const manual = window.prompt("Paste wmux Life settings JSON") ?? "";
      applyPastedSettings(manual);
    }
  };

  const applyPastedSettings = (value: string) => {
    const parsed = parseLifeViewSettings(value);
    if (!parsed) {
      setSettingsStatus("invalid");
      return;
    }
    setSettings(parsed);
    setSettingsStatus("pasted");
  };

  return (
    <div className="empty-workspace-view" aria-label="wmux idle column field">
      <canvas
        ref={canvasRef}
        className="empty-shader-canvas"
        aria-label="Interactive Game of Life field; click a column to toggle a cell"
      />
      <div className="life-field-legend" aria-hidden="true">
        <span>CONWAY FIELD</span>
        <span>CLICK TO SEED</span>
      </div>
      <button
        type="button"
        className="life-settings-toggle"
        aria-label="Life shader settings"
        aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        ...
      </button>
      {settingsOpen && (
        <div className="life-settings-panel" aria-label="Game of Life shader settings">
          <div className="life-settings-actions">
            <button type="button" onClick={copySettings}>copy</button>
            <button type="button" onClick={pasteSettings}>paste</button>
            <button type="button" onClick={() => setSettings(defaultLifeViewSettings)}>reset</button>
          </div>
          <LifeSlider label="GoL step" value={settings.stepMs} min={600} max={9000} step={100} suffix="ms" onChange={(value) => updateSetting("stepMs", value)} />
          <LifeSlider label="Live fade" value={settings.transitionToLiveMs} min={600} max={12000} step={100} suffix="ms" onChange={(value) => updateSetting("transitionToLiveMs", value)} />
          <LifeSlider label="Dead fade" value={settings.transitionToDeadMs} min={400} max={9000} step={100} suffix="ms" onChange={(value) => updateSetting("transitionToDeadMs", value)} />
          <LifeSlider label="Wave speed" value={settings.noiseSpeed} min={0} max={2} step={0.01} suffix="x" onChange={(value) => updateSetting("noiseSpeed", value)} />
          <LifeSlider label="Shimmer" value={settings.surfaceSpeed} min={0} max={2} step={0.01} suffix="x" onChange={(value) => updateSetting("surfaceSpeed", value)} />
          {settingsStatus && <div className="life-settings-status">{settingsStatus}</div>}
        </div>
      )}
    </div>
  );
}

interface LifeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

function LifeSlider({ label, value, min, max, step, suffix, onChange }: LifeSliderProps) {
  const displayValue = suffix === "x" ? value.toFixed(2) : String(Math.round(value));
  return (
    <label className="life-settings-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{displayValue}{suffix}</output>
    </label>
  );
}

const resizeCanvas = (
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  renderScale: number,
): void => {
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);
  const preferredRatio = Math.min(window.devicePixelRatio || 1, 1.5) * renderScale;
  const pixelBudgetRatio = Math.sqrt(EMPTY_MAX_RENDER_PIXELS / (cssWidth * cssHeight));
  const ratio = Math.min(preferredRatio, pixelBudgetRatio);
  const width = Math.max(1, Math.floor(cssWidth * ratio));
  const height = Math.max(1, Math.floor(cssHeight * ratio));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
};

interface IdleRenderQuality {
  scale: number;
  intervalMs: number;
  frameLagAverage: number;
  sampleCount: number;
  stableWindows: number;
}

const createIdleRenderQuality = (): IdleRenderQuality => ({
  scale: EMPTY_RENDER_SCALE,
  intervalMs: EMPTY_RENDER_INTERVAL_MS,
  frameLagAverage: 0,
  sampleCount: 0,
  stableWindows: 0,
});

const updateIdleRenderQuality = (quality: IdleRenderQuality, frameLag: number): boolean => {
  quality.frameLagAverage = quality.sampleCount === 0
    ? frameLag
    : quality.frameLagAverage * 0.82 + frameLag * 0.18;
  quality.sampleCount += 1;
  if (quality.sampleCount < EMPTY_QUALITY_SAMPLE_FRAMES) return false;

  quality.sampleCount = 0;
  if (quality.frameLagAverage > 34) {
    const previousScale = quality.scale;
    quality.scale = Math.max(EMPTY_MIN_RENDER_SCALE, quality.scale * 0.82);
    quality.intervalMs = Math.min(1000 / 8, quality.intervalMs * 1.18);
    quality.stableWindows = 0;
    return quality.scale !== previousScale;
  }

  if (quality.frameLagAverage < 18) {
    quality.stableWindows += 1;
    if (quality.stableWindows >= 4) {
      const previousScale = quality.scale;
      quality.scale = Math.min(EMPTY_RENDER_SCALE, quality.scale / 0.9);
      quality.intervalMs = Math.max(EMPTY_RENDER_INTERVAL_MS, quality.intervalMs / 1.12);
      quality.stableWindows = 0;
      return quality.scale !== previousScale;
    }
  } else {
    quality.stableWindows = 0;
  }
  return false;
};

interface LifeSimulation {
  width: number;
  height: number;
  target: Uint8Array;
  next: Uint8Array;
  display: Float32Array;
  pixels: Uint8Array;
  heightCurrent: Uint8Array;
  heightNext: Uint8Array;
  grain: Uint8Array;
  heightSampleStartedAt: number;
  heightSampleNoiseSpeed: number;
  textureUploaded: boolean;
  lastStepAt: number;
  lastFrameAt: number;
}

interface LifeViewSettings {
  stepMs: number;
  transitionToLiveMs: number;
  transitionToDeadMs: number;
  noiseSpeed: number;
  surfaceSpeed: number;
}

interface LifeInteraction {
  x: number;
  y: number;
  startedAt: number;
}

const LIFE_WIDTH = 72;
const LIFE_HEIGHT = 72;
const EMPTY_RENDER_INTERVAL_MS = 1000 / 12;
const EMPTY_RENDER_SCALE = 0.5;
const EMPTY_MIN_RENDER_SCALE = 0.28;
const EMPTY_MAX_RENDER_PIXELS = 520_000;
const EMPTY_QUALITY_SAMPLE_FRAMES = 12;
const HEIGHT_SAMPLE_INTERVAL_SECONDS = 1;
const HEIGHT_TEXTURE_SCALE = 1.2;
const INTERACTION_WAVE_DURATION_SECONDS = 3.4;
const INTERACTION_WAVE_SPEED = 3.8;
const INTERACTION_WAVE_HEIGHT = 0.28;
const TILE_X = 0.205;
const TILE_Y = 0.106;
const HEIGHT_SCALE = 0.17;
const ORIGIN_Y = -0.92;
const defaultLifeViewSettings: LifeViewSettings = {
  stepMs: 2800,
  transitionToLiveMs: 3000,
  transitionToDeadMs: 2000,
  noiseSpeed: 0.41,
  surfaceSpeed: 0.36,
};

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

const createLifeSimulation = (): LifeSimulation => {
  const cells = LIFE_WIDTH * LIFE_HEIGHT;
  const target = new Uint8Array(cells);
  const next = new Uint8Array(cells);
  const display = new Float32Array(cells);
  const pixels = new Uint8Array(cells * 4);
  const heightCurrent = new Uint8Array(cells);
  const heightNext = new Uint8Array(cells);
  const grain = new Uint8Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const alive = Math.random() < 0.34 ? 1 : 0;
    target[index] = alive;
    display[index] = alive;
    const x = index % LIFE_WIDTH;
    const y = Math.floor(index / LIFE_WIDTH);
    grain[index] = Math.round(fbm(x * 1.7, y * 1.7, 0, 0) * 255);
  }
  return {
    width: LIFE_WIDTH,
    height: LIFE_HEIGHT,
    target,
    next,
    display,
    pixels,
    heightCurrent,
    heightNext,
    grain,
    heightSampleStartedAt: Number.NEGATIVE_INFINITY,
    heightSampleNoiseSpeed: Number.NaN,
    textureUploaded: false,
    lastStepAt: 0,
    lastFrameAt: 0,
  };
};

const configureLifeTexture = (gl: WebGLRenderingContext, texture: WebGLTexture): void => {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
};

const uploadLifeTexture = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  life: LifeSimulation,
  time: number,
  settings: LifeViewSettings,
): number => {
  const heightMix = updateHeightSamples(life, time, settings);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (let index = 0; index < life.display.length; index += 1) {
    const live = Math.max(0, Math.min(255, Math.round(life.display[index] * 255)));
    const offset = index * 4;
    life.pixels[offset] = live;
    life.pixels[offset + 1] = life.heightCurrent[index];
    life.pixels[offset + 2] = life.heightNext[index];
    life.pixels[offset + 3] = life.grain[index];
  }
  if (life.textureUploaded) {
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      life.width,
      life.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      life.pixels,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      life.width,
      life.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      life.pixels,
    );
    life.textureUploaded = true;
  }
  return heightMix;
};

const updateHeightSamples = (
  life: LifeSimulation,
  time: number,
  settings: LifeViewSettings,
): number => {
  const interval = HEIGHT_SAMPLE_INTERVAL_SECONDS;
  const intervalStart = Math.floor(time / interval) * interval;
  const reset =
    settings.noiseSpeed !== life.heightSampleNoiseSpeed ||
    time < life.heightSampleStartedAt ||
    time >= life.heightSampleStartedAt + interval * 2;
  if (reset) {
    fillHeightSamples(life.heightCurrent, life, intervalStart, settings);
    fillHeightSamples(life.heightNext, life, intervalStart + interval, settings);
    life.heightSampleStartedAt = intervalStart;
    life.heightSampleNoiseSpeed = settings.noiseSpeed;
  } else if (time >= life.heightSampleStartedAt + interval) {
    life.heightCurrent.set(life.heightNext);
    life.heightSampleStartedAt += interval;
    fillHeightSamples(life.heightNext, life, life.heightSampleStartedAt + interval, settings);
  }
  return Math.max(0, Math.min(1, (time - life.heightSampleStartedAt) / interval));
};

const fillHeightSamples = (
  target: Uint8Array,
  life: LifeSimulation,
  time: number,
  settings: LifeViewSettings,
): void => {
  for (let y = 0; y < life.height; y += 1) {
    for (let x = 0; x < life.width; x += 1) {
      const height = estimatedBaseHeightForCell([x, y], time, settings);
      target[y * life.width + x] = Math.round(Math.max(0, Math.min(1, height / HEIGHT_TEXTURE_SCALE)) * 255);
    }
  }
};

const updateLifeSimulation = (life: LifeSimulation, now: number, settings: LifeViewSettings): void => {
  if (life.lastFrameAt === 0) {
    life.lastFrameAt = now;
    life.lastStepAt = now;
    return;
  }

  while (now - life.lastStepAt >= settings.stepMs) {
    stepLifeSimulation(life);
    life.lastStepAt += settings.stepMs;
  }

  const delta = Math.max(0, now - life.lastFrameAt);
  life.lastFrameAt = now;
  for (let index = 0; index < life.display.length; index += 1) {
    const transitionMs = life.target[index] > life.display[index] ? settings.transitionToLiveMs : settings.transitionToDeadMs;
    const blend = 1 - Math.exp(-delta / transitionMs);
    life.display[index] += (life.target[index] - life.display[index]) * blend;
  }
};

const stepLifeSimulation = (life: LifeSimulation): void => {
  const { width, height, target, next } = life;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const alive = target[index] === 1;
      const neighbors = countLiveNeighbors(target, width, height, x, y);
      next[index] = neighbors === 3 || (alive && neighbors === 2) ? 1 : 0;
    }
  }
  target.set(next);
};

const countLiveNeighbors = (
  cells: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number => {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const wrappedX = (x + dx + width) % width;
      const wrappedY = (y + dy + height) % height;
      count += cells[wrappedY * width + wrappedX];
    }
  }
  return count;
};

const toggleLifeCell = (life: LifeSimulation, cellX: number, cellY: number, now: number): void => {
  const index = lifeIndexForCell(life, cellX, cellY);
  life.target[index] = life.target[index] === 1 ? 0 : 1;
  life.next[index] = life.target[index];
  life.lastStepAt = now;
};

const pickLifeCell = (
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  life: LifeSimulation,
  time: number,
  interaction: LifeInteraction,
): { x: number; y: number } | null => {
  const uv = pointerUv(event, canvas);
  const ground = unprojectGround(uv);
  const baseX = Math.floor(ground[0]);
  const baseY = Math.floor(ground[1]);
  let best: { x: number; y: number; depth: number } | null = null;

  for (let y = -4; y <= 4; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      const cellX = baseX + x;
      const cellY = baseY + y;
      const cell: Vec2 = [cellX, cellY];
      const lifeValue = life.display[lifeIndexForCell(life, cellX, cellY)] ?? 0;
      const height = sampledHeightForCell(life, cell, lifeValue, time, interaction);
      const hitDepth = hitDepthForCell(uv, cell, height);
      if (hitDepth !== null && (!best || hitDepth > best.depth)) {
        best = { x: cellX, y: cellY, depth: hitDepth };
      }
    }
  }

  return best ? { x: best.x, y: best.y } : null;
};

const pointerUv = (event: PointerEvent, canvas: HTMLCanvasElement): Vec2 => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = canvas.height - (event.clientY - rect.top) * (canvas.height / rect.height);
  const uv: Vec2 = [(x * 2 - canvas.width) / canvas.height, (y * 2 - canvas.height) / canvas.height];
  const aspect = canvas.width / canvas.height;
  const portrait = 1 - smoothstep(0.62, 0.95, aspect);
  return [uv[0] * mix(1, 1.72, portrait), uv[1] * mix(1, 0.94, portrait)];
};

const unprojectGround = (screen: Vec2): Vec2 => {
  const y = screen[1] - ORIGIN_Y;
  const sum = y / TILE_Y;
  const difference = screen[0] / TILE_X;
  return [(sum + difference) * 0.5, (sum - difference) * 0.5];
};

const hitDepthForCell = (uv: Vec2, cell: Vec2, height: number): number | null => {
  const gap = 0.04;
  const p00: Vec3 = [cell[0] + gap, cell[1] + gap, height];
  const p10: Vec3 = [cell[0] + 1 - gap, cell[1] + gap, height];
  const p11: Vec3 = [cell[0] + 1 - gap, cell[1] + 1 - gap, height];
  const p01: Vec3 = [cell[0] + gap, cell[1] + 1 - gap, height];
  const b00: Vec3 = [p00[0], p00[1], 0];
  const b10: Vec3 = [p10[0], p10[1], 0];
  const b01: Vec3 = [p01[0], p01[1], 0];

  const s00 = projectPoint(p00);
  const s10 = projectPoint(p10);
  const s11 = projectPoint(p11);
  const s01 = projectPoint(p01);
  const g00 = projectPoint(b00);
  const g10 = projectPoint(b10);
  const g01 = projectPoint(b01);
  const depthBase = -(cell[0] + cell[1]) * 32 + (cell[0] - cell[1]) * 0.01;

  let bestDepth: number | null = null;
  if (pointInQuad(uv, s00, s10, s11, s01)) bestDepth = depthBase + height * 2 + 3;
  if (pointInQuad(uv, s00, s10, g10, g00)) bestDepth = Math.max(bestDepth ?? -Infinity, depthBase + height * 1.4 + 1);
  if (pointInQuad(uv, s01, s00, g00, g01)) bestDepth = Math.max(bestDepth ?? -Infinity, depthBase + height * 1.4 + 0.5);
  return bestDepth;
};

const projectPoint = (point: Vec3): Vec2 => [
  (point[0] - point[1]) * TILE_X,
  ORIGIN_Y + (point[0] + point[1]) * TILE_Y + point[2] * HEIGHT_SCALE,
];

const pointInQuad = (point: Vec2, a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const winding = Math.sign(edgeValue(a, b, c)) || 1;
  return (
    edgeValue(a, b, point) * winding >= -0.002 &&
    edgeValue(b, c, point) * winding >= -0.002 &&
    edgeValue(c, d, point) * winding >= -0.002 &&
    edgeValue(d, a, point) * winding >= -0.002
  );
};

const edgeValue = (a: Vec2, b: Vec2, point: Vec2): number =>
  (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);

const sampledHeightForCell = (
  simulation: LifeSimulation,
  cell: Vec2,
  life: number,
  time: number,
  interaction: LifeInteraction,
): number => {
  const index = lifeIndexForCell(simulation, cell[0], cell[1]);
  const heightMix = Math.max(0, Math.min(
    1,
    (time - simulation.heightSampleStartedAt) / HEIGHT_SAMPLE_INTERVAL_SECONDS,
  ));
  const encodedHeight = mix(simulation.heightCurrent[index], simulation.heightNext[index], heightMix);
  return encodedHeight / 255 * HEIGHT_TEXTURE_SCALE
    + life * 0.38
    + interactionWaveForCell(cell, time, interaction) * INTERACTION_WAVE_HEIGHT;
};

const estimatedBaseHeightForCell = (cell: Vec2, time: number, settings: LifeViewSettings): number => {
  const cellPhase = Math.PI * 2 / LIFE_WIDTH;
  const t = time * 0.42 * settings.noiseSpeed;
  const diagonal = Math.sin((cell[0] + cell[1]) * cellPhase * 3 - t * 1.12);
  const crossWave = Math.sin((cell[0] * 2 - cell[1]) * cellPhase * 2 + t * 0.76);
  const longSwell = Math.sin((cell[0] - cell[1] * 2) * cellPhase + t * 0.48);
  const interference = 0.5 + 0.5 * (diagonal * 0.55 + crossWave * 0.3 + longSwell * 0.15);
  const shaped = smoothstep(0.08, 0.92, interference);
  return 0.045 + shaped * shaped * 1.16;
};

const interactionWaveForCell = (cell: Vec2, time: number, interaction: LifeInteraction): number => {
  const age = time - interaction.startedAt;
  if (age < 0 || age >= INTERACTION_WAVE_DURATION_SECONDS) return 0;
  const radius = age * INTERACTION_WAVE_SPEED;
  const dx = cell[0] - interaction.x;
  const dy = cell[1] - interaction.y;
  const distanceSquared = dx * dx + dy * dy;
  const bandWidth = Math.max(1.2, radius * 1.7);
  const ring = 1 - smoothstep(0, bandWidth, Math.abs(distanceSquared - radius * radius));
  return ring * (1 - smoothstep(0.2, INTERACTION_WAVE_DURATION_SECONDS, age));
};

const parseLifeViewSettings = (value: string): LifeViewSettings | null => {
  try {
    const parsed = JSON.parse(value) as Partial<LifeViewSettings>;
    return {
      stepMs: clampNumber(parsed.stepMs, 600, 9000, defaultLifeViewSettings.stepMs),
      transitionToLiveMs: clampNumber(parsed.transitionToLiveMs, 600, 12000, defaultLifeViewSettings.transitionToLiveMs),
      transitionToDeadMs: clampNumber(parsed.transitionToDeadMs, 400, 9000, defaultLifeViewSettings.transitionToDeadMs),
      noiseSpeed: clampNumber(parsed.noiseSpeed, 0, 2, defaultLifeViewSettings.noiseSpeed),
      surfaceSpeed: clampNumber(parsed.surfaceSpeed, 0, 2, defaultLifeViewSettings.surfaceSpeed),
    };
  } catch {
    return null;
  }
};

const copyTextFallback = (value: string): boolean => {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
};

const lifeIndexForCell = (life: LifeSimulation, x: number, y: number): number => {
  const wrappedX = positiveModulo(Math.floor(x), life.width);
  const wrappedY = positiveModulo(Math.floor(y), life.height);
  return wrappedY * life.width + wrappedX;
};

const positiveModulo = (value: number, modulo: number): number => ((value % modulo) + modulo) % modulo;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const fbm = (x: number, y: number, offsetX: number, offsetY: number): number => {
  let value = 0;
  let amp = 0.55;
  let total = 0;
  let px = x + offsetX;
  let py = y + offsetY;
  for (let index = 0; index < 4; index += 1) {
    value += noise(px, py) * amp;
    total += amp;
    px = px * 2.05 + 12.4;
    py = py * 2.05 - 8.7;
    amp *= 0.52;
  }
  return value / total;
};

const noise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothFraction(x - ix);
  const fy = smoothFraction(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
};

const smoothFraction = (value: number): number => value * value * (3 - 2 * value);
const mix = (a: number, b: number, value: number): number => a * (1 - value) + b * value;
const hash = (x: number, y: number): number => {
  let value = Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
};

const createProgram = (
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  console.error(gl.getProgramInfoLog(program) || "wmux idle shader link failed");
  gl.deleteProgram(program);
  return null;
};

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader) || "wmux idle shader compile failed");
  gl.deleteShader(shader);
  return null;
};

const vertexShaderSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_life;
uniform vec2 u_life_resolution;
uniform float u_surface_speed;
uniform float u_height_mix;
uniform vec3 u_pointer;
uniform vec4 u_interaction;

const float TILE_X = 0.205;
const float TILE_Y = 0.106;
const float HEIGHT_SCALE = 0.17;
const float TOP_EDGE_INVERSE = 4.71;

vec4 stateForCell(vec2 cell) {
  vec2 wrapped = mod(floor(cell), u_life_resolution);
  vec2 sampleUv = (wrapped + vec2(0.5)) / u_life_resolution;
  vec4 state = texture2D(u_life, sampleUv);
  state.y = mix(state.y, state.z, u_height_mix) * 1.2;
  return state;
}

vec2 origin() {
  return vec2(0.0, -0.92);
}

vec2 projectPoint(vec3 p) {
  vec2 screen = origin();
  screen.x += (p.x - p.y) * TILE_X;
  screen.y += (p.x + p.y) * TILE_Y + p.z * HEIGHT_SCALE;
  return screen;
}

vec2 unprojectGround(vec2 screen) {
  vec2 p = screen - origin();
  float sum = p.y / TILE_Y;
  float difference = p.x / TILE_X;
  return vec2((sum + difference) * 0.5, (sum - difference) * 0.5);
}

float edgeValue(vec2 a, vec2 b, vec2 p) {
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

float quadDistance(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, float inverseA, float inverseB) {
  float winding = sign(edgeValue(a, b, c));
  float e0 = edgeValue(a, b, p) * inverseA * winding;
  float e1 = edgeValue(b, c, p) * inverseB * winding;
  float e2 = edgeValue(c, d, p) * inverseA * winding;
  float e3 = edgeValue(d, a, p) * inverseB * winding;
  return min(min(e0, e1), min(e2, e3));
}

float cornerDistanceSquared(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  vec2 pa = p - a;
  vec2 pb = p - b;
  vec2 pc = p - c;
  vec2 pd = p - d;
  return min(min(dot(pa, pa), dot(pb, pb)), min(dot(pc, pc), dot(pd, pd)));
}

float roundedQuadMask(float distance, float cornerSquared, float radius) {
  float face = smoothstep(-0.002, 0.004, distance);
  float radiusSquared = radius * radius;
  float cornerRound = smoothstep(
    radiusSquared * 0.1,
    radiusSquared,
    cornerSquared + max(distance, 0.0) * radius * 1.5
  );
  return face * cornerRound;
}

vec3 metalRamp(float v) {
  vec3 black = vec3(0.005, 0.006, 0.009);
  vec3 graphite = vec3(0.045, 0.052, 0.065);
  vec3 silver = vec3(0.48, 0.50, 0.54);
  vec3 hot = vec3(0.98, 0.84, 0.40);
  vec3 color = mix(black, graphite, smoothstep(0.0, 0.62, v));
  color = mix(color, silver, smoothstep(0.56, 0.94, v));
  color = mix(color, hot, smoothstep(0.9, 1.0, v));
  return color;
}

vec3 faceColor(
  vec2 cell,
  float height,
  float face,
  float faceDistance,
  float cornerSquared,
  float life,
  float grain,
  float ripple
) {
  float diagonal = smoothstep(-0.72, 0.82, sin((cell.x - cell.y) * 0.42 + u_time * 0.22 * u_surface_speed));
  float glint = pow(clamp(sin(cell.x * 0.58 - cell.y * 0.41 + u_time * 0.56 * u_surface_speed) * 0.5 + 0.5, 0.0, 1.0), 9.0);
  float heightLight = smoothstep(0.12, 1.46, height);
  vec3 color = metalRamp(heightLight * 0.72 + diagonal * 0.14 + grain * 0.1 + glint * 0.18);
  vec3 coldLight = vec3(0.52, 0.67, 0.84);
  vec3 gold = vec3(1.0, 0.66, 0.12);
  vec3 hotGold = vec3(1.0, 0.94, 0.62);
  float pulse = 0.88 + sin(u_time * 2.2 + cell.x * 0.7 - cell.y * 0.43) * 0.12;
  vec2 pointerDelta = cell - u_pointer.xy;
  float hover = u_pointer.z * (1.0 - smoothstep(0.2, 3.4, dot(pointerDelta, pointerDelta)));
  float energy = clamp(life * pulse + ripple * 0.72 + hover * 0.16, 0.0, 1.35);

  if (face < 0.5) {
    color *= vec3(1.05, 1.08, 1.13);
    color = mix(color, gold, energy * 0.52);
    color += mix(gold, hotGold, life) * energy * 0.68;
  } else if (face < 1.5) {
    color *= vec3(0.43, 0.46, 0.54);
    color = mix(color, gold, energy * 0.25);
    color += gold * energy * 0.12;
  } else {
    color *= vec3(0.27, 0.31, 0.39);
    color = mix(color, gold, energy * 0.18);
    color += gold * energy * 0.08;
  }

  float roundedBevel = 1.0 - smoothstep(0.012, 0.044, min(faceDistance, sqrt(cornerSquared) * 0.82));
  float rim = 1.0 - smoothstep(0.004, 0.019, faceDistance);
  color = mix(color * 0.8, color + vec3(0.14, 0.16, 0.19), roundedBevel * (face < 0.5 ? 0.52 : 0.34));
  color += coldLight * rim * (face < 0.5 ? 0.32 : 0.15);
  color += hotGold * (glint * 0.16 + energy * 0.28) * rim;
  return color;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float interactionWaveForCell(vec2 cell) {
  float age = u_time - u_interaction.z;
  if (age < 0.0 || age >= 3.4) return 0.0;
  float radius = age * 3.8;
  vec2 delta = cell - u_interaction.xy;
  float distanceSquared = dot(delta, delta);
  float bandWidth = max(1.2, radius * 1.7);
  float ring = 1.0 - smoothstep(0.0, bandWidth, abs(distanceSquared - radius * radius));
  return ring * (1.0 - smoothstep(0.2, 3.4, age));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float portrait = 1.0 - smoothstep(0.62, 0.95, u_resolution.x / u_resolution.y);
  uv.x *= mix(1.0, 1.72, portrait);
  uv.y *= mix(1.0, 0.94, portrait);
  vec2 ground = floor(unprojectGround(uv));
  float fieldGlow = 1.0 / (1.0 + dot(uv * vec2(0.76, 1.08), uv * vec2(0.76, 1.08)) * 2.8);
  float horizon = 1.0 - smoothstep(0.0, 1.35, abs(uv.y + 0.14));
  float dust = step(0.992, hash(floor(gl_FragCoord.xy * 0.32))) * 0.035;
  vec3 color = vec3(0.0015, 0.002, 0.004);
  color += vec3(0.012, 0.018, 0.032) * fieldGlow;
  color += vec3(0.045, 0.025, 0.006) * horizon * fieldGlow * 0.34;
  color += vec3(0.28, 0.2, 0.08) * dust * fieldGlow;
  float bestDepth = -100000.0;
  float ambientGrid = 0.0;

  for (int y = -2; y <= 1; y++) {
    for (int x = -2; x <= 1; x++) {
      vec2 cell = ground + vec2(float(x), float(y));
      vec4 state = stateForCell(cell);
      float life = state.x;
      float ripple = interactionWaveForCell(cell);
      float height = state.y + life * 0.38 + ripple * 0.28;
      float grain = state.w;
      float gap = 0.04;

      vec3 p00 = vec3(cell.x + gap, cell.y + gap, height);
      vec3 p10 = vec3(cell.x + 1.0 - gap, cell.y + gap, height);
      vec3 p11 = vec3(cell.x + 1.0 - gap, cell.y + 1.0 - gap, height);
      vec3 p01 = vec3(cell.x + gap, cell.y + 1.0 - gap, height);
      vec3 b00 = vec3(p00.xy, 0.0);
      vec3 b10 = vec3(p10.xy, 0.0);
      vec3 b01 = vec3(p01.xy, 0.0);

      vec2 s00 = projectPoint(p00);
      vec2 s10 = projectPoint(p10);
      vec2 s11 = projectPoint(p11);
      vec2 s01 = projectPoint(p01);
      vec2 g00 = projectPoint(b00);
      vec2 g10 = projectPoint(b10);
      vec2 g01 = projectPoint(b01);
      float minX = min(min(s00.x, s10.x), min(s11.x, s01.x));
      float maxX = max(max(s00.x, s10.x), max(s11.x, s01.x));
      float minY = min(g00.y, min(g10.y, g01.y));
      float maxY = max(max(s00.y, s10.y), max(s11.y, s01.y));
      if (uv.x < minX - 0.006 || uv.x > maxX + 0.006 || uv.y < minY - 0.006 || uv.y > maxY + 0.006) {
        continue;
      }
      float depthBase = -(cell.x + cell.y) * 32.0 + (cell.x - cell.y) * 0.01;
      float verticalInverse = 1.0 / max(height * HEIGHT_SCALE, 0.006);

      float topDistance = quadDistance(uv, s00, s10, s11, s01, TOP_EDGE_INVERSE, TOP_EDGE_INVERSE);
      float topCorner = cornerDistanceSquared(uv, s00, s10, s11, s01);
      float topMask = roundedQuadMask(topDistance, topCorner, 0.036);
      float topDepth = depthBase + height * 2.0 + 3.0;
      if (topMask > 0.001 && topDepth > bestDepth) {
        bestDepth = topDepth;
        color = mix(color, faceColor(cell, height, 0.0, topDistance, topCorner, life, grain, ripple), topMask);
      }

      float sideDistanceA = quadDistance(uv, s00, s10, g10, g00, TOP_EDGE_INVERSE, verticalInverse);
      float sideCornerA = cornerDistanceSquared(uv, s00, s10, g10, g00);
      float sideMaskA = roundedQuadMask(sideDistanceA, sideCornerA, 0.03);
      float sideDepthA = depthBase + height * 1.4 + 1.0;
      if (sideMaskA > 0.001 && sideDepthA > bestDepth) {
        bestDepth = sideDepthA;
        color = mix(color, faceColor(cell, height, 1.0, sideDistanceA, sideCornerA, life, grain, ripple), sideMaskA);
      }

      float sideDistanceB = quadDistance(uv, s01, s00, g00, g01, TOP_EDGE_INVERSE, verticalInverse);
      float sideCornerB = cornerDistanceSquared(uv, s01, s00, g00, g01);
      float sideMaskB = roundedQuadMask(sideDistanceB, sideCornerB, 0.03);
      float sideDepthB = depthBase + height * 1.4 + 0.5;
      if (sideMaskB > 0.001 && sideDepthB > bestDepth) {
        bestDepth = sideDepthB;
        color = mix(color, faceColor(cell, height, 2.0, sideDistanceB, sideCornerB, life, grain, ripple), sideMaskB);
      }

      ambientGrid += max(topMask, max(sideMaskA, sideMaskB)) * (0.008 + life * 0.02);
    }
  }

  vec2 sheen = normalize(vec2(-0.58, 0.82));
  float lightSweep = pow(clamp(dot(normalize(uv + vec2(0.42, -0.1)), sheen) * 0.5 + 0.5, 0.0, 1.0), 9.0);
  color += vec3(0.05, 0.06, 0.085) * ambientGrid;
  color += vec3(0.34, 0.28, 0.14) * lightSweep * 0.034;

  float interactionAge = u_time - u_interaction.z;
  if (interactionAge >= 0.0 && interactionAge < 3.6) {
    vec4 interactionState = stateForCell(u_interaction.xy);
    float interactionHeight = interactionState.y + interactionState.x * 0.38;
    vec2 interactionCenter = projectPoint(vec3(u_interaction.xy + vec2(0.5), interactionHeight + 0.05));
    float interactionDistance = length(uv - interactionCenter);
    float interactionFade = 1.0 - smoothstep(0.4, 3.6, interactionAge);
    float ring = 1.0 - smoothstep(0.012, 0.045, abs(interactionDistance - interactionAge * 0.36));
    float flare = 1.0 / (1.0 + interactionDistance * interactionDistance * 72.0);
    color += vec3(1.0, 0.55, 0.08) * (ring * 0.22 + flare * 0.28) * interactionFade;
  }

  float squareFrame = max(abs(uv.x) * 0.78, abs(uv.y) * 1.08);
  color *= 1.0 - smoothstep(0.32, 1.7, squareFrame);
  color *= 0.985 + sin(gl_FragCoord.y * 0.72) * 0.015;
  color = pow(color, vec3(0.84));

  gl_FragColor = vec4(color, 1.0);
}
`;
