/* =========================================================
   icons.js — 발바닥, 칼(결투) 아이콘을 SVG 코드로 그려요
   이미지 파일이 없어도 색만 바꿔서 어디든 쓸 수 있어요.
   ========================================================= */

// 발바닥 아이콘
// color: 채우기 색 / outline: true면 속이 빈 외곽선 발바닥
function pawSVG(color, outline = false) {
  const fill = outline ? "none" : color;
  const stroke = outline ? color : "none";
  const sw = outline ? 3.2 : 0;
  return `
  <svg class="paw-svg" viewBox="0 0 100 96" aria-hidden="true">
    <g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
      <ellipse cx="15" cy="47" rx="10.5" ry="14" transform="rotate(-22 15 47)"/>
      <ellipse cx="35" cy="20" rx="11.5" ry="16" transform="rotate(-8 35 20)"/>
      <ellipse cx="65" cy="20" rx="11.5" ry="16" transform="rotate(8 65 20)"/>
      <ellipse cx="85" cy="47" rx="10.5" ry="14" transform="rotate(22 85 47)"/>
      <path d="M50 45 C31 45 19 64 21 77 C23 91 37 92 50 86 C63 92 77 91 79 77 C81 64 69 45 50 45 Z"/>
    </g>
  </svg>`;
}

// 결투 아이콘 (엇갈린 두 자루의 칼 — 손잡이가 아래 양쪽)
function swordsSVG(color = "#bb9999") {
  const sword = `
    <path d="M32 4 L36 10 L36 40 L28 40 L28 10 Z"/>
    <rect x="21" y="40" width="22" height="5" rx="2.5"/>
    <rect x="29.5" y="45" width="5" height="10" rx="1.5"/>
    <circle cx="32" cy="58" r="3.2"/>`;
  return `
  <svg class="swords-svg" viewBox="0 0 64 64" aria-hidden="true">
    <g fill="${color}">
      <g transform="rotate(40 32 34) translate(0 -2)">${sword}</g>
      <g transform="rotate(-40 32 34) translate(0 -2)">${sword}</g>
    </g>
  </svg>`;
}
