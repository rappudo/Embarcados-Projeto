import { Injectable } from "@angular/core";
import * as ort from "onnxruntime-web";

import { API_BASE_URL } from "../api/api.config";

const BLAZE_INPUT_SIZE = 128;
const ARC_INPUT_SIZE = 112;
const EMBEDDING_DIM = 512;
const MAX_DETECTIONS = 25n;
const CONF_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.3;
const FLOATS_PER_DETECTION = 16;

ort.env.wasm.wasmPaths = "/assets/ort/";

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Runs BlazeFace + ArcFace in the browser to produce a 512-d face embedding.
 *
 * Mirrors the edge pipeline (edge/src/vision/{face_detector,face_embedder}.cpp)
 * so the resulting vectors are comparable with embeddings produced at
 * the gate. The face image never leaves the user's device — only the
 * resulting Float32Array is uploaded.
 */
@Injectable({ providedIn: "root" })
export class FaceEmbeddingService {
  private detectorPromise: Promise<ort.InferenceSession> | null = null;
  private embedderPromise: Promise<ort.InferenceSession> | null = null;

  /**
   * Pre-warm both models. Optional — `embedFromCanvas` will lazy-load on first call.
   */
  async preload(): Promise<void> {
    await Promise.all([this.detector(), this.embedder()]);
  }

  /**
   * Returns a normalized 512-d embedding, or `null` if no face is detected.
   * `source` is typically the capture canvas from the enrollment wizard.
   */
  async embedFromCanvas(source: HTMLCanvasElement): Promise<Float32Array | null> {
    const detector = await this.detector();
    const embedder = await this.embedder();

    const bbox = await this.detect(detector, source);
    if (!bbox) return null;

    return this.embed(embedder, source, bbox);
  }

  private detector(): Promise<ort.InferenceSession> {
    if (!this.detectorPromise) {
      this.detectorPromise = ort.InferenceSession.create(
        `${API_BASE_URL}/models/blaze.onnx`,
        { executionProviders: ["wasm"] },
      );
    }
    return this.detectorPromise;
  }

  private embedder(): Promise<ort.InferenceSession> {
    if (!this.embedderPromise) {
      this.embedderPromise = ort.InferenceSession.create(
        `${API_BASE_URL}/models/arc.onnx`,
        { executionProviders: ["wasm"] },
      );
    }
    return this.embedderPromise;
  }

  private async detect(
    session: ort.InferenceSession,
    source: HTMLCanvasElement,
  ): Promise<BBox | null> {
    const work = document.createElement("canvas");
    work.width = BLAZE_INPUT_SIZE;
    work.height = BLAZE_INPUT_SIZE;
    const ctx = work.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, BLAZE_INPUT_SIZE, BLAZE_INPUT_SIZE);
    const { data } = ctx.getImageData(0, 0, BLAZE_INPUT_SIZE, BLAZE_INPUT_SIZE);

    // NCHW float32, RGB normalized to [0, 1].
    const hw = BLAZE_INPUT_SIZE * BLAZE_INPUT_SIZE;
    const tensor = new Float32Array(3 * hw);
    for (let i = 0; i < hw; i++) {
      const r = data[i * 4 + 0];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      tensor[0 * hw + i] = r / 255;
      tensor[1 * hw + i] = g / 255;
      tensor[2 * hw + i] = b / 255;
    }

    const inputNames = session.inputNames;
    const feeds: Record<string, ort.Tensor> = {
      [inputNames[0]]: new ort.Tensor("float32", tensor, [
        1,
        3,
        BLAZE_INPUT_SIZE,
        BLAZE_INPUT_SIZE,
      ]),
      [inputNames[1]]: new ort.Tensor("float32", Float32Array.from([CONF_THRESHOLD]), [1]),
      [inputNames[2]]: new ort.Tensor("int64", BigInt64Array.from([MAX_DETECTIONS]), [1]),
      [inputNames[3]]: new ort.Tensor("float32", Float32Array.from([IOU_THRESHOLD]), [1]),
    };

    const result = await session.run(feeds);
    const boxes = result[session.outputNames[0]];
    const dims = boxes.dims;
    const flat = boxes.data as Float32Array;

    // Output shape: [1, num_detections, 16] or [num_detections, 16].
    let numDetections = 0;
    if (dims.length === 3 && dims[2] === FLOATS_PER_DETECTION) {
      numDetections = dims[1];
    } else if (dims.length === 2 && dims[1] === FLOATS_PER_DETECTION) {
      numDetections = dims[0];
    }
    if (numDetections === 0) return null;

    // BlazeFace returns normalized coords. Detections come pre-sorted
    // by confidence after NMS, so [0..16] is the best face.
    const x1 = flat[0] * source.width;
    const y1 = flat[1] * source.height;
    const x2 = flat[2] * source.width;
    const y2 = flat[3] * source.height;

    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  }

  private async embed(
    session: ort.InferenceSession,
    source: HTMLCanvasElement,
    bbox: BBox,
  ): Promise<Float32Array | null> {
    const sx = Math.max(0, Math.min(source.width - 1, Math.round(bbox.x)));
    const sy = Math.max(0, Math.min(source.height - 1, Math.round(bbox.y)));
    const sw = Math.max(1, Math.min(source.width - sx, Math.round(bbox.width)));
    const sh = Math.max(1, Math.min(source.height - sy, Math.round(bbox.height)));
    if (sw < 10 || sh < 10) return null;

    const work = document.createElement("canvas");
    work.width = ARC_INPUT_SIZE;
    work.height = ARC_INPUT_SIZE;
    const ctx = work.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, ARC_INPUT_SIZE, ARC_INPUT_SIZE);
    const { data } = ctx.getImageData(0, 0, ARC_INPUT_SIZE, ARC_INPUT_SIZE);

    // NHWC float32, RGB normalized as (p - 127.5) / 128, matching the edge.
    const tensor = new Float32Array(ARC_INPUT_SIZE * ARC_INPUT_SIZE * 3);
    for (let i = 0; i < ARC_INPUT_SIZE * ARC_INPUT_SIZE; i++) {
      tensor[i * 3 + 0] = (data[i * 4 + 0] - 127.5) / 128;
      tensor[i * 3 + 1] = (data[i * 4 + 1] - 127.5) / 128;
      tensor[i * 3 + 2] = (data[i * 4 + 2] - 127.5) / 128;
    }

    const inputName = session.inputNames[0];
    const feeds: Record<string, ort.Tensor> = {
      [inputName]: new ort.Tensor("float32", tensor, [
        1,
        ARC_INPUT_SIZE,
        ARC_INPUT_SIZE,
        3,
      ]),
    };

    const result = await session.run(feeds);
    const output = result[session.outputNames[0]];
    const raw = output.data as Float32Array;

    if (raw.length !== EMBEDDING_DIM) return null;

    let normSq = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) normSq += raw[i] * raw[i];
    const norm = Math.sqrt(normSq);
    if (norm < 1e-9) return null;

    const out = new Float32Array(EMBEDDING_DIM);
    const invNorm = 1 / norm;
    for (let i = 0; i < EMBEDDING_DIM; i++) out[i] = raw[i] * invNorm;
    return out;
  }
}
