/* =========================================================
   mic.js — 마이크 + 음 높이(피치) 알아내기
   ---------------------------------------------------------
   1) request()  마이크 켜기 (버튼 누를 때 부르기 → 허용 팝업)
   2) read()     지금 들리는 소리 → { freq: 몇 Hz인지(없으면 0), vol: 소리 크기 }

   ※ 음 높이는 'YIN'이라는 방법으로 직접 계산해요.
     소리 파형을 조금씩 밀어 보면서 "몇 칸 밀었을 때 자기 자신과 가장 닮았나"를 찾으면
     그 칸 수가 한 번 떨리는 데 걸리는 시간(주기) → 1초 ÷ 주기 = 주파수(Hz)
   ※ ml5 최신판(1.x)에는 음 높이 인식 모델이 빠져 있어서 라이브러리 없이 계산해요.
   ========================================================= */

const Mic = (() => {
  const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let ctx = null;          // 소리를 다루는 AudioContext
  let stream = null;
  let analyser = null;
  let buf = null;
  let lastResult = null;   // 이번 페이지에서 마이크를 요청해 봤는지 (null = 아직)

  // 결과: "granted" | "denied" | "unsupported" | "insecure"
  async function request() {
    if (!window.isSecureContext) return (lastResult = "insecure");
    if (!hasMic) return (lastResult = "unsupported");
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return (lastResult = "unsupported");

    // ⚠️ iPhone: 버튼을 누른 순간에 AudioContext를 만들거나 깨워야 소리가 들어와요
    if (!ctx || ctx.state === "closed") ctx = new AC();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }

    if (stream && stream.active && analyser) return (lastResult = "granted");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // 목소리 높이를 정확히 재려고 폰의 자동 보정(잡음 제거·음량 자동조절)을 꺼요
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch (err) {
      stream = null;
      return (lastResult = err && err.name === "NotAllowedError" ? "denied" : "unsupported");
    }
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;          // 한 번에 2048칸(약 0.04초)씩 들어요
    buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);            // 스피커로는 안 보내요 (울림 방지)
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
    return (lastResult = "granted");
  }

  function ready() {
    return !!(analyser && stream && stream.active && ctx && ctx.state === "running");
  }

  // ---------- YIN 피치 계산 ----------
  // minHz~maxHz 사이에서 찾아요 (사람 목소리 + 높은 소리 조금)
  function yin(data, rate, minHz = 70, maxHz = 1000) {
    const W = 1024;                                   // 비교할 길이
    const maxTau = Math.min(Math.floor(rate / minHz), data.length - W - 1);
    const minTau = Math.max(2, Math.floor(rate / maxHz));
    const d = new Float32Array(maxTau + 1);
    // 1) 차이 함수: τ칸 밀었을 때 얼마나 다른지
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) { const diff = data[j] - data[j + tau]; sum += diff * diff; }
      d[tau] = sum;
    }
    // 2) 평균으로 나눠서 0~1쯤으로 (작을수록 '닮았다')
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      d[tau] = running ? (d[tau] * tau) / running : 1;
    }
    // 3) 기준(0.15)보다 작아지는 첫 골짜기 찾기
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (d[t] < 0.15) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t; break;
      }
    }
    if (tau < 0) return 0;                            // 음 높이가 뚜렷하지 않음 (말소리, 잡음)
    // 4) 골짜기 바닥을 더 정확하게 (포물선 보간)
    const a = d[tau - 1], b = d[tau], c = tau + 1 <= maxTau ? d[tau + 1] : b;
    const shift = (a - 2 * b + c) ? (a - c) / (2 * (a - 2 * b + c)) : 0;
    return rate / (tau + shift);
  }

  // 지금 소리: { freq(Hz, 없으면 0), vol(0~1쯤) }
  function read() {
    if (!ready()) return { freq: 0, vol: 0 };
    analyser.getFloatTimeDomainData(buf);
    let sq = 0;
    for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
    const vol = Math.sqrt(sq / buf.length);
    if (vol < CONFIG.CALL.MIN_VOLUME) return { freq: 0, vol };
    return { freq: yin(buf, ctx.sampleRate), vol };
  }

  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    if (ctx && ctx.state !== "closed") { ctx.close().catch(() => {}); }
    ctx = null;
  }

  return {
    hasMic,
    request,
    read,
    stop,
    get ready() { return ready(); },
    get lastResult() { return lastResult; },
  };
})();
