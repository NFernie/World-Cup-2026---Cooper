/** Map API-Football lineup grid + formation to LB, CB, ST, etc. (mirrors web/src/lib/xiGame/positions.ts). */

export function gridToPositionCode(
  formation: string,
  pos: string,
  grid: string | null | undefined,
): string | null {
  if (!grid) return null;
  const parts = formation.split("-").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;

  const [row, col] = grid.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(row) || Number.isNaN(col)) return null;

  const defLine = parts[0];
  const midLine = parts[1];

  if (pos === "G" || row === 1) return "GK";

  const defRow = 2;
  const midRow = defLine <= 3 ? 3 : 3;
  const fwdRow = defLine <= 3 ? 4 : defLine === 4 ? 4 : 5;

  if (pos === "D" || row === defRow) {
    if (defLine === 5) {
      if (col === 1) return "LWB";
      if (col === defLine) return "RWB";
      return "CB";
    }
    if (defLine === 3) {
      if (col === 1) return "LWB";
      if (col === defLine) return "RWB";
      return "CB";
    }
    if (col === 1) return "LB";
    if (col === defLine) return "RB";
    return "CB";
  }

  if (pos === "M" || row === midRow) {
    if (midLine === 1) return "CM";
    if (col === 1) return "LM";
    if (col === midLine) return "RM";
    return "CM";
  }

  if (pos === "F" || row >= fwdRow) {
    const fwdLine = parts[2];
    if (fwdLine === 1) return "ST";
    if (col === 1) return "LW";
    if (col === fwdLine) return "RW";
    return "ST";
  }

  return null;
}
