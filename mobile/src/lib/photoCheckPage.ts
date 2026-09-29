// The hidden web page that checks photo quality on the phone with Google's MediaPipe
// face detector. Nothing is uploaded: the photo is checked inside the app and the
// results never leave the phone. If the checker can't load (e.g. no internet), the
// app simply skips the check.

export const MEDIAPIPE_VERSION = '1.0.1';
const DEFAULT_LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const DEFAULT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export type PhotoIssue = { code: string; message: string; blocking: boolean };
export type PhotoCheckResult = { checked: boolean; issues: PhotoIssue[] };

// libBase / modelUrl can be swapped for local copies in tests.
export function photoCheckPage(libBase = DEFAULT_LIB, modelUrl = DEFAULT_MODEL) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<canvas id="c"></canvas>
<script type="module">
const send = (msg) => {
  const text = JSON.stringify(msg);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
  else window.__lastResult = msg;
};
let detector = null;
async function load() {
  const { FilesetResolver, FaceDetector } = await import('${libBase}/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks('${libBase}/wasm');
  detector = await FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: '${modelUrl}', delegate: 'CPU' },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5,
  });
}
const ready = load().then(() => send({ type: 'ready' })).catch((e) => send({ type: 'unavailable', error: String(e) }));

// Average brightness (0-255) and sharpness (variance of the Laplacian) of a region.
function lightAndSharpness(ctx, x, y, w, h) {
  const size = 200;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.drawImage(ctx.canvas, x, y, w, h, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size).data;
  const gray = new Float32Array(size * size);
  let sum = 0;
  for (let i = 0; i < size * size; i++) {
    gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    sum += gray[i];
  }
  let lapSum = 0, lapSq = 0, n = 0;
  for (let yy = 1; yy < size - 1; yy++) for (let xx = 1; xx < size - 1; xx++) {
    const i = yy * size + xx;
    const lap = gray[i - size] + gray[i + size] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
    lapSum += lap; lapSq += lap * lap; n++;
  }
  const mean = lapSum / n;
  return { brightness: sum / (size * size), sharpness: lapSq / n - mean * mean };
}

window.checkPhoto = async (id, dataUrl, kind) => {
  try {
    await ready;
    if (!detector) return send({ type: 'result', id, checked: false, issues: [] });
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.getElementById('c');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const W = canvas.width, H = canvas.height;
    const faces = detector.detect(canvas).detections;
    const issues = [];
    const add = (code, message, blocking) => issues.push({ code, message, blocking });

    if (faces.length > 1) add('many_faces', 'Only you should be in the photo.', true);
    let region = [0, 0, W, H];

    if (kind === 'front') {
      if (faces.length === 0) {
        add('no_face', 'We couldn’t find your face. Face the camera in good light with your whole face in the frame.', true);
      } else if (faces.length === 1) {
        const f = faces[0];
        const b = f.boundingBox;
        region = [b.originX, b.originY, b.width, b.height];
        const widthShare = b.width / W;
        const centerX = (b.originX + b.width / 2) / W;
        const topRoom = b.originY / H;
        if (widthShare < 0.22) add('too_far', 'Move closer so your head fills more of the frame.', false);
        if (widthShare > 0.75) add('too_close', 'Move back a little so your whole head and hair fit.', true);
        if (topRoom < 0.12) add('no_headroom', 'Leave space above your head so we can see your hair.', false);
        if (centerX < 0.3 || centerX > 0.7) add('off_center', 'Center your face in the frame.', false);
        const k = f.keypoints || [];
        if (k.length >= 3) {
          const [rEye, lEye, nose] = k;
          const roll = Math.abs(Math.atan2((lEye.y - rEye.y) * H, (lEye.x - rEye.x) * W) * 180 / Math.PI);
          const tilt = Math.min(roll, Math.abs(180 - roll));
          if (tilt > 12) add('tilted', 'Hold your head straight, not tilted.', false);
          const eyeMid = (rEye.x + lEye.x) / 2;
          const eyeGap = Math.abs(lEye.x - rEye.x) || 1e-6;
          if (Math.abs(nose.x - eyeMid) / eyeGap > 0.35) add('turned', 'Look straight at the camera for your front photo.', false);
        }
      }
    }

    // Light and focus (on the face when we found one, otherwise the whole photo).
    const { brightness, sharpness } = lightAndSharpness(ctx, ...region);
    if (brightness < 60) add('too_dark', 'Too dark. Face a window or a light.', false);
    if (brightness > 225) add('too_bright', 'Too bright. Move out of direct light.', false);
    if (sharpness < 25) add('blurry', 'The photo looks blurry. Hold still and try again.', false);

    send({ type: 'result', id, checked: true, issues, metrics: { faces: faces.length, brightness, sharpness } });
  } catch (e) {
    send({ type: 'result', id, checked: false, issues: [], error: String(e) });
  }
};
</script></body></html>`;
}
