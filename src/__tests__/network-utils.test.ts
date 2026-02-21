import { describe, it, expect, vi } from 'vitest';

// Mock modules that depend on DOM globals
vi.mock('../main', () => ({
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
}));

import { fmtWeight, fmtNum, circularLayout, shapePathD, rescalePositions } from '../views/network';

// ═══════════════════════════════════════════════════════════
//  fmtWeight
// ═══════════════════════════════════════════════════════════
describe('fmtWeight', () => {
  it('integer shows no decimal', () => {
    expect(fmtWeight(5)).toBe('5');
    expect(fmtWeight(100)).toBe('100');
  });

  it('decimal shows .XX format', () => {
    expect(fmtWeight(0.45)).toBe('.45');
    expect(fmtWeight(0.123)).toBe('.12');
  });

  it('values < 1 drop leading zero', () => {
    expect(fmtWeight(0.5)).toBe('.50');
  });

  it('values >= 1 with decimals', () => {
    expect(fmtWeight(1.5)).toBe('1.50');
    expect(fmtWeight(2.345)).toBe('2.35');
  });

  it('zero is integer', () => {
    expect(fmtWeight(0)).toBe('0');
  });
});

// ═══════════════════════════════════════════════════════════
//  fmtNum
// ═══════════════════════════════════════════════════════════
describe('fmtNum', () => {
  it('integer shows no decimal', () => {
    expect(fmtNum(42)).toBe('42');
  });

  it('default 4 digits', () => {
    expect(fmtNum(3.14159)).toBe('3.1416');
  });

  it('trailing zeros stripped', () => {
    expect(fmtNum(1.5)).toBe('1.5');
    expect(fmtNum(2.1000)).toBe('2.1');
  });

  it('custom digit count', () => {
    expect(fmtNum(3.14159, 2)).toBe('3.14');
    expect(fmtNum(3.14159, 6)).toBe('3.14159');
  });

  it('zero', () => {
    expect(fmtNum(0)).toBe('0');
  });
});

// ═══════════════════════════════════════════════════════════
//  circularLayout
// ═══════════════════════════════════════════════════════════
describe('circularLayout', () => {
  it('n=4 produces 4 equidistant points', () => {
    const pts = circularLayout(4, 100, 100, 50);
    expect(pts).toHaveLength(4);
    // All points should be on the circle (distance from center = radius)
    for (const p of pts) {
      const dist = Math.sqrt((p.x - 100) ** 2 + (p.y - 100) ** 2);
      expect(dist).toBeCloseTo(50, 8);
    }
  });

  it('first point is at top (12 o\'clock)', () => {
    const pts = circularLayout(4, 100, 100, 50);
    // First point at angle -π/2 → (cx, cy - radius) = (100, 50)
    expect(pts[0]!.x).toBeCloseTo(100, 8);
    expect(pts[0]!.y).toBeCloseTo(50, 8);
  });

  it('n=0 returns empty array', () => {
    const pts = circularLayout(0, 100, 100, 50);
    expect(pts).toEqual([]);
  });

  it('n=1 returns single point at top', () => {
    const pts = circularLayout(1, 100, 100, 50);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.x).toBeCloseTo(100, 8);
    expect(pts[0]!.y).toBeCloseTo(50, 8);
  });

  it('points are equally spaced', () => {
    const pts = circularLayout(6, 0, 0, 100);
    // Distance between consecutive points should be equal
    const dists: number[] = [];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const d = Math.sqrt((pts[j]!.x - pts[i]!.x) ** 2 + (pts[j]!.y - pts[i]!.y) ** 2);
      dists.push(d);
    }
    for (const d of dists) {
      expect(d).toBeCloseTo(dists[0]!, 8);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  shapePathD
// ═══════════════════════════════════════════════════════════
describe('shapePathD', () => {
  it('circle returns valid SVG arc path', () => {
    const d = shapePathD('circle', 10);
    expect(d).toMatch(/^M/);
    expect(d).toContain('A');
    expect(d).toMatch(/Z$/);
  });

  it('square returns valid SVG path', () => {
    const d = shapePathD('square', 10);
    expect(d).toMatch(/^M/);
    expect(d).toContain('L');
    expect(d).toMatch(/Z$/);
  });

  it('triangle returns valid SVG path', () => {
    const d = shapePathD('triangle', 10);
    expect(d).toMatch(/^M/);
    expect(d).toContain('L');
    expect(d).toMatch(/Z$/);
  });

  it('diamond returns valid SVG path', () => {
    const d = shapePathD('diamond', 10);
    expect(d).toMatch(/^M/);
    expect(d).toContain('L');
    expect(d).toMatch(/Z$/);
  });

  it('hexagon returns path with 6 vertices', () => {
    const d = shapePathD('hexagon', 10);
    expect(d).toMatch(/^M/);
    // Count L commands: should have 5 (M + 5L + Z)
    const lCount = (d.match(/L/g) || []).length;
    expect(lCount).toBe(5);
  });

  it('unknown shape defaults to circle', () => {
    const d = shapePathD('unknown', 10);
    expect(d).toContain('A'); // arcs
  });
});

// ═══════════════════════════════════════════════════════════
//  rescalePositions
// ═══════════════════════════════════════════════════════════
describe('rescalePositions', () => {
  it('rescales positions to fit within width x height minus padding', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 100, y: 200 },
    ];
    rescalePositions(positions, 500, 400, 50);
    // After rescaling, positions should be within [padding, width-padding]
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(50);
      expect(p.x).toBeLessThanOrEqual(450);
      expect(p.y).toBeGreaterThanOrEqual(50);
      expect(p.y).toBeLessThanOrEqual(350);
    }
  });

  it('uniform scaling preserves aspect ratio (Y constrains)', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ];
    rescalePositions(positions, 100, 100, 10);
    // rangeX=10, rangeY=20, usable=80x80, scale=min(8,4)=4, centered
    expect(positions[0]!.x).toBeCloseTo(30, 8);
    expect(positions[0]!.y).toBeCloseTo(10, 8);
    expect(positions[1]!.x).toBeCloseTo(70, 8);
    expect(positions[1]!.y).toBeCloseTo(90, 8);
  });

  it('n=0 does nothing', () => {
    const positions: { x: number; y: number }[] = [];
    rescalePositions(positions, 100, 100, 10);
    expect(positions).toEqual([]);
  });

  it('single point gets placed at center', () => {
    const positions = [{ x: 5, y: 5 }];
    rescalePositions(positions, 100, 100, 10);
    // Range is 0 → fallback=1, scale=80, midpoint=5 → centered at (50,50)
    expect(positions[0]!.x).toBeCloseTo(50, 8);
    expect(positions[0]!.y).toBeCloseTo(50, 8);
  });
});
