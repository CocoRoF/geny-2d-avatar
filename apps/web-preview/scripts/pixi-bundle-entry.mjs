// esbuild bundle entry — pixi.js + pixi-live2d-display-advanced 를 단일 IIFE 로 묶어
// globalThis.GenyPixi 로 노출. ES module / importmap CDN 의 instance 분리 (batcher 충돌)
// 이슈를 회피한다.
//
// RX.1: drawable extraction helpers (extractDrawables / setDrawableVisible /
// setDrawableMultiplyRgb / uvBbox) 도 같이 노출해 builder.html 에서
// window.GenyPixi.{extractDrawables,...} 로 호출 가능.

import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-advanced/cubism";
import {
  extractDrawables,
  setDrawableVisible,
  setDrawableMultiplyRgb,
  uvBbox,
} from "@geny/web-avatar-renderer-pixi";

export {
  PIXI,
  Live2DModel,
  extractDrawables,
  setDrawableVisible,
  setDrawableMultiplyRgb,
  uvBbox,
};
