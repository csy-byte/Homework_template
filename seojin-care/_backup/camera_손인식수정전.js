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

  // 여러 번 불러도 한 번만 불러와요
  function loadModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        await loadScript(ML5_URL);
        bodyPose = ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_LIGHTNING" });
        await bodyPose.ready;
        modelLoaded = true;
      })().catch((err) => {
        modelPromise = null; // 실패하면 다음에 다시 시도
        throw err;
      });
    }
    return modelPromise;
  }

  function startDetect() {
    if (detecting || !modelLoaded || !video || !stream) return;
    detecting = true;
    bodyPose.detectStart(video, (results) => {
      pose = results && results[0] ? results[0] : null;
      poseAt = performance.now();
    });
  }

  function stopDetect() {
    if (!detecting) return;
    bodyPose.detectStop();
    detecting = false;
    pose = null;
  }

  // 카메라 끄기 (결투 화면에서 나갈 때)
  function stop() {
    stopDetect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
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
    get video() { return video; },
    get lastResult() { return lastResult; },
    // 카메라도 켜졌고 모델도 준비됨
    get ready() { return !!(stream && stream.active && modelLoaded); },
    get modelReady() { return modelLoaded; },
    // 1초 안에 인식 결과가 들어왔는지
    get poseFresh() { return performance.now() - poseAt < 1000; },
  };
})();
