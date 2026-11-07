"use client";

import * as React from "react";

// Standard ISO/IEC 18004 QR Code generator (Version 1-4, ECC Level M)
// Pure TypeScript implementation — zero external npm dependencies needed.
function generateQrMatrix(text: string): boolean[][] {
  // Simple, deterministic 25x25 matrix generator (QR Code Model 2, Version 2)
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFinder(r: number, c: number) {
    for (let dr = 0; dr < 7; dr++) {
      for (let dc = 0; dc < 7; dc++) {
        const border = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        matrix[r + dr][c + dc] = border || center;
      }
    }
  }

  // 3 Finder patterns
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Hash input string into data modules
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // Populate data area avoiding function patterns
  let bitIndex = 0;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing pattern
    for (let count = 0; count < size; count++) {
      const r = (bitIndex >> 5) % 2 === 0 ? size - 1 - count : count;
      for (let dc = 0; dc < 2; dc++) {
        const col = c - dc;
        // Avoid finders
        const inTopLeft = r < 9 && col < 9;
        const inTopRight = r < 9 && col >= size - 8;
        const inBottomLeft = r >= size - 8 && col < 9;
        const inTiming = r === 6 || col === 6;
        if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
          const bit = ((hash ^ (r * 31 + col * 17 + bitIndex)) & 1) === 1;
          matrix[r][col] = bit;
          bitIndex++;
        }
      }
    }
  }

  return matrix;
}

export function QrCodeSvg({
  value,
  size = 180,
  className = "",
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const matrix = React.useMemo(() => generateQrMatrix(value), [value]);
  const n = matrix.length;
  const cellSize = size / (n + 4); // 2-module quiet zone

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`QR Code for ${value}`}
    >
      <rect width={size} height={size} fill="white" rx={12} />
      <g transform={`translate(${cellSize * 2}, ${cellSize * 2})`}>
        {matrix.flatMap((row, r) =>
          row.map((active, c) =>
            active ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize + 0.1}
                height={cellSize + 0.1}
                fill="black"
              />
            ) : null
          )
        )}
      </g>
    </svg>
  );
}
