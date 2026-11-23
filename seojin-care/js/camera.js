/* =========================================================
   camera.js — 카메라 + ml5 bodyPose(몸 동작 인식)
   ---------------------------------------------------------
   1) request()   카메라 켜기 (버튼 누를 때 부르기 → 허용 팝업)
   2) loadModel() ml5와 MoveNet 모델 불러오기 (처음엔 몇 초 걸림)
   3) startDetect() 이후로는 point("left_wrist") 처럼 관절 좌표를 꺼내 쓰면 돼요

   ※ ml5는 무거워서(수 MB) 카메라 게임을 할 때만 불러와요.
   ※ 티처블 머신(분류)은 "팔 벌림/모음"은 알아도 "화면 어디서" 모았는지는 몰라요.
     그래서 지니 잡기는 관절 위치(x, y)를 알려 주는 bodyPose를 써요.

   관절 이름 (MoveNet 17개)
   nose, left_eye, right_eye, left_ear, right_ear,
   left_shoulder, right_shoulder, left_elbow, right_elbow,
   left_wrist, right_wrist, left_hip, right_hip,
   left_knee, right_knee, left_ankle, right_ankle
   ========================================================= */

const Cam = (() => {
  const ML5_URL = "https://cdn.jsdelivr.net/npm/ml5@1.3.1/dist/ml5.min.js";
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  let video = null;        // 카메라 화면이 흐르는 <video> (화면에는 안 붙이고 캔버스에 그려요)
  let stream = null;
  let bodyPose = null;
  let modelLoaded = false;
  let modelPromise = null;
  let detecting = false;
  let pose = null;         // 가장 최근에 찾은 몸 1명
  let poseAt = 0;
  let lastResult = null;   // 이번 페이지에서 카메라를 요청해 봤는지 (null = 아직)

  // <script>를 나중에 붙여서 ml5 불러오기
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.ml5) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("ml5를 불러오지 못했어요"));
      document.head.appendChild(s);
    });
  }

  // 결과: "granted" | "denied" | "unsupported" | "insecure"
  async function request() {
    if (!window.isSecureContext) return (lastResult = "insecure");
    if (!hasCamera) return (lastResult = "unsupported");
    if (stream && stream.active) return (lastResult = "granted");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      stream = null;
      return (lastResult = err && err.name === "NotAllowedError" ? "denied" : "unsupported");
    }
    if (!video) {
      video = document.createElement("video");
      video.setAttribute("playsinline", ""); // iPhone: 전체화면으로 튀어나가지 않게
      video.muted = true;
      video.autoplay = true;
      // iPhone Safari: 페이지에 안 붙은 video는 프레임이 안 넘어가서 인식이 멈춰요
      // → 화면에 안 보이게 붙여 둠
      video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
      document.body.appendChild(video);
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* 자동재생 막힘 → 다음 프레임에 다시 */ }
    // 영상 크기를 알 때까지 기다리기 (최대 3초)
    if (!video.videoWidth) {
      await new Promise((res) => {
        video.addEventListener("loadedmetadata", res, { once: true });
        setTimeout(res, 3000);
      });
    }
    // ⚠️ 동작 인식 모델은 video.width / height 가 꼭 있어야 해요
    video.width = video.videoWidth || 640;
    video.height = video.videoHeight || 480;
    return (lastResult = "granted");
  }

  // ---------- 계산 장치(백엔드) 고르기 ----------
  // webgl = 그래픽칩(빠름). 그런데 일부 iPad는 그래픽칩 계산 정밀도가 낮아서 뼈대가 엉망으로 나와요
  // → 그런 기기는 webgpu(최신 iPadOS) 또는 cpu(느리지만 정확)로 바꿔요
  // 테스트용: 주소 뒤에 ?backend=cpu / ?backend=webgpu / ?backend=webgl 을 붙이면 강제로 바꿀 수 있어요
  let backend = "";
  async function pickBackend() {
    const tf = ml5.tf;
    const forced = new URLSearchParams(location.search).get("backend") || CONFIG.JINI.BACKEND;
    const tryUse = async (name) => {
      try { return (await tf.setBackend(name)) !== false && tf.getBackend() === name; }
      catch (e) { return false; }
    };
    if (forced && forced !== "auto") {
      if (await tryUse(forced)) return (backend = forced);
    }
    if (await tryUse("webgl")) {
      // 그래픽칩이 정밀한 계산(32비트)을 못 하면 → 다른 장치로
      const precise = tf.env().getBool("WEBGL_RENDER_FLOAT32_CAPABLE");
      if (precise) return (backend = "webgl");
      if (navigator.gpu && (await tryUse("webgpu"))) return (backend = "webgpu");
    }
    await tryUse("cpu");
    return (backend = tf.getBackend());
  }

  // 여러 번 불러도 한 번만 불러와요
  function loadModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        await loadScript(ML5_URL);
        await pickBackend();
        // ⚠️ 페이지에 p5가 있으면 ml5.bodyPose()는 모델이 아니라 Promise(나중에 줄게)를 돌려줘요
        //    → await로 진짜 모델을 받아야 해요
        bodyPose = await ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_LIGHTNING" });
        await bodyPose.ready;
        modelLoaded = true;
      })().catch((err) => {
        modelPromise = null; // 실패하면 다음에 다시 시도
        throw err;
      });
    }
    return modelPromise;
  }

  // ---------- 인식 반복 ----------
  // 카메라 영상을 바로 모델에 넣지 않고, 작은 캔버스에 한 번 그린 다음 넣어요.
  // iPad/iPhone Safari는 카메라 영상을 그래픽칩으로 바로 보내면 방향이 돌아가거나
  // 크기가 틀리게 들어가는 버그가 있어서 → 캔버스에 그리면 화면에 보이는 그대로 들어가요.
  const frame = document.createElement("canvas");
  const fctx = frame.getContext("2d", { willReadFrequently: true });
  const FRAME_MAX = 320; // 모델은 어차피 192px로 줄여서 봐요 → 작게 그려도 충분 + 빠름
  let lastError = null;

  async function loop() {
    while (detecting) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh && video.readyState >= 2) {
        const k = Math.min(1, FRAME_MAX / Math.max(vw, vh));
        const fw = Math.round(vw * k), fh = Math.round(vh * k);
        if (frame.width !== fw || frame.height !== fh) { frame.width = fw; frame.height = fh; }
        fctx.drawImage(video, 0, 0, fw, fh);
        try {
          const results = await bodyPose.detect(frame);
          const p = results && results[0] ? results[0] : null;
          // 캔버스 좌표 → 카메라 영상 좌표로 되돌리기
          if (p && p.keypoints) for (const kp of p.keypoints) { kp.x /= k; kp.y /= k; }
          pose = p;
          poseAt = performance.now();
          lastError = null;
        } catch (err) {
          lastError = err;
          console.error("동작 인식 오류:", err);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      await new Promise((r) => requestAnimationFrame(r)); // 다음 화면까지 기다리기
    }
  }

  function startDetect() {
    if (detecting || !modelLoaded || !video || !stream) return;
    detecting = true;
    loop();
  }

  function stopDetect() {
    detecting = false; // loop가 다음 바퀴에서 멈춰요
    pose = null;
  }

  // 카메라 끄기 (결투 화면에서 나갈 때)
  function stop() {
    stopDetect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  // 폰을 돌리면 영상 크기(가로↔세로)가 바뀌어요 → 모델이 쓰는 크기도 맞춰 주기
  function syncSize() {
    if (!video || !video.videoWidth) return;
    if (video.width !== video.videoWidth) video.width = video.videoWidth;
    if (video.height !== video.videoHeight) video.height = video.videoHeight;
  }

  // 관절 하나 꺼내기 — 확신도(confidence)가 낮으면 null
  // 좌표는 '카메라 영상' 기준 픽셀 (거울 반전 전)
  function point(name, minConfidence = 0.3) {
    if (!pose || !pose.keypoints) return null;
    const k = pose.keypoints.find((kp) => kp.name === name);
    if (!k) return null;
    const c = k.confidence != null ? k.confidence : k.score;
    return c >= minConfidence ? k : null;
  }

  return {
    hasCamera,
    request,
    loadModel,
    startDetect,
    stopDetect,
    stop,
    point,
    syncSize,
    get backend() { return backend; },
    get lastError() { return lastError; },
    get keypoints() { return pose && pose.keypoints ? pose.keypoints : []; },
    get hasPose() { return !!pose; },
    get video() { return video; },
    get lastResult() { return lastResult; },
    // 카메라도 켜졌고 모델도 준비됨
    get ready() { return !!(stream && stream.active && modelLoaded); },
    get modelReady() { return modelLoaded; },
    // 1초 안에 인식 결과가 들어왔는지
    get poseFresh() { return performance.now() - poseAt < 1000; },
  };
})();
