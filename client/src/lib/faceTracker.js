import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
// "?url" makes Vite serve these files from this website itself, so the face
// scan doesn't depend on the internet speed. Newer browsers get the faster
// "SIMD" engine; older ones get the basic version.
import simdLoader from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import simdBinary from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import basicLoader from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url";
import basicBinary from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url";
import modelUrl from "../assets/models/face_landmarker.task?url";

// MediaPipe Face Landmarker is a free, pretrained model from Google that finds
// 478 points on a face, many times per second, right in the browser. We only
// need three of them (their numbers in MediaPipe's face map):
const NOSE_TIP = 1;
const FACE_EDGE_A = 234; // the edge of the face on one side
const FACE_EDGE_B = 454; // the edge on the other side

let trackerPromise = null;

// Loads the face tracker once and reuses it (the files are a few MB).
export function loadFaceTracker() {
  if (!trackerPromise) {
    trackerPromise = (async () => {
      const simd = await FilesetResolver.isSimdSupported();
      const files = simd
        ? { wasmLoaderPath: simdLoader, wasmBinaryPath: simdBinary }
        : { wasmLoaderPath: basicLoader, wasmBinaryPath: basicBinary };
      const create = (delegate) =>
        FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          runningMode: "VIDEO",
          // Up to 2 faces, so the scan can say "only one person should be in view".
          numFaces: 2,
          // Also report each face's 3D position and rotation, which gives the
          // head's turn in degrees (see headYaw below).
          outputFacialTransformationMatrixes: true
        });
      // The graphics chip (GPU) is faster; fall back to the processor if it's not available.
      try {
        return await create("GPU");
      } catch {
        return await create("CPU");
      }
    })().catch((err) => {
      trackerPromise = null; // let a later attempt try again
      throw err;
    });
  }
  return trackerPromise;
}

// How far the head is turned left or right, in degrees (0 = facing the
// camera; + one way, - the other). It comes from the face's rotation, which
// MediaPipe works out from the 3D shape of the face mesh. "matrix" is the
// face's 4x4 transformation matrix (16 numbers, column by column).
export function headYaw(matrix) {
  const m = matrix.data;
  // The rotation around the up-down axis: atan2 of the rotation matrix's
  // top-right and bottom-right entries.
  return (Math.atan2(m[8], m[10]) * 180) / Math.PI;
}

// Measures one face from its points (all as fractions of the camera picture).
//   turn:  0 = looking straight; it grows toward +1 or -1 as the head turns.
//          Looking straight, the nose tip sits halfway between the two edges
//          of the face; turning moves it toward one edge. (A rough measure
//          that tops out around a 40 degree turn; the face scan uses headYaw.)
//   width: how much of the picture's width the face takes up.
//   centerX / centerY: where the face is (0.5 = middle of the picture).
export function measureFace(points) {
  let left = 1, right = 0, top = 1, bottom = 0;
  for (const point of points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }

  const nose = points[NOSE_TIP];
  const edgeA = points[FACE_EDGE_A];
  const edgeB = points[FACE_EDGE_B];
  const between = (nose.x - edgeA.x) / (edgeB.x - edgeA.x);

  return {
    turn: (between - 0.5) * 2,
    width: right - left,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}
