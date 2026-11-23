/* =========================================================
   sensors.js — 폰 흔들기(가속도 센서) 읽기
   ---------------------------------------------------------
   iPhone Safari 규칙
   1) https 주소에서만 센서가 켜져요 (GitHub Pages는 https라 OK,
      컴퓨터의 Live Server를 폰에서 http로 열면 안 켜져요)
   2) 버튼을 '누르는 순간'에 권한을 요청해야 해요 → requestPermission()
      은 반드시 클릭 이벤트 안에서 불러야 합니다.
   3) 페이지를 새로고침하면 다시 눌러서 허락받아야 할 수 있어요.
   ========================================================= */

const Motion = (() => {
  const hasMotion = typeof window.DeviceMotionEvent !== "undefined";
  const needsPermission = hasMotion && typeof DeviceMotionEvent.requestPermission === "function";

  let granted = !needsPermission && hasMotion; // 안드로이드 등은 허락 없이 사용
  let listening = false;
  let lastEventAt = 0;
  let prev = null;
  let onEnergy = null; // 흔들림 에너지를 받을 함수

  function handle(e) {
    lastEventAt = performance.now();
    // 중력 포함 값이 가장 많은 기기에서 나와요
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x === null) return;
    if (prev) {
      // 직전 값과의 차이 = 얼마나 '홱' 움직였는지
      const d = Math.abs(a.x - prev.x) + Math.abs(a.y - prev.y) + Math.abs(a.z - prev.z);
      if (d > CONFIG.BUBBLE.SHAKE_THRESHOLD && onEnergy) onEnergy(Math.min(d, 60));
    }
    prev = { x: a.x, y: a.y, z: a.z };
  }

  function listen() {
    if (listening || !hasMotion) return;
    window.addEventListener("devicemotion", handle);
    listening = true;
  }

  // ⚠️ 반드시 버튼 클릭 안에서 호출
  // 결과: "granted" | "denied" | "unsupported" | "insecure"
  async function request() {
    if (!hasMotion) return "unsupported";
    if (!window.isSecureContext) return "insecure";
    if (needsPermission) {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        granted = res === "granted";
      } catch (err) {
        // 클릭 밖에서 부르면 에러 → 다음 클릭에서 다시 시도
        granted = false;
        return "need-tap";
      }
    } else {
      granted = true;
    }
    if (granted) listen();
    return granted ? "granted" : "denied";
  }

  // 실제로 센서 값이 들어오고 있는지 (PC는 이벤트가 아예 안 옴)
  function isReceiving(withinMs = 1500) {
    return listening && performance.now() - lastEventAt < withinMs;
  }

  return {
    hasMotion,
    needsPermission,
    get granted() { return granted; },
    request,
    isReceiving,
    listen,
    setHandler(fn) { onEnergy = fn; prev = null; },
  };
})();
