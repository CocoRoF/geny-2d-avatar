// esbuild bundle entry — pixi.js + pixi-live2d-display-advanced 를 단일 IIFE 로 묶어
// globalThis.GenyPixi 로 노출. ES module / importmap CDN 의 instance 분리 (batcher 충돌)
// 이슈를 회피한다.

import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-advanced/cubism";

export { PIXI, Live2DModel };
