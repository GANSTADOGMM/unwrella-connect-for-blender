// Count UV-connected faces using OBJ vertex indices and UV coordinates.
export function countUVIslands(obj) {
  let vertices = 0, mesh = 0;
  const uvs = [], faces = [];
  for (const raw of obj.split(/\r?\n/)) {
    const fields = raw.split('#', 1)[0].trim().split(/\s+/);
    if (fields[0] === 'v') vertices++;
    else if (fields[0] === 'vt') uvs.push([Number(fields[1]), Number(fields[2])]);
    else if (fields[0] === 'o') mesh++;
    else if (fields[0] === 'f') {
      const points = fields.slice(1).map(field => {
        const [v, t] = field.split('/').map(Number);
        const vi = v < 0 ? vertices + v + 1 : v;
        const ti = t < 0 ? uvs.length + t + 1 : t;
        const uv = uvs[ti - 1];
        return vi > 0 && vi <= vertices && ti > 0 && uv && uv.every(Number.isFinite) ? [vi, uv[0], uv[1]] : null;
      });
      if (points.length >= 3 && points.every(Boolean)) faces.push({ mesh, points });
    }
  }
  const parent = faces.map((_, i) => i), edges = new Map();
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  faces.forEach(({ mesh, points }, i) => {
    for (let j = 0; j < points.length; j++) {
      const endpoints = [JSON.stringify(points[j]), JSON.stringify(points[(j + 1) % points.length])].sort();
      const key = JSON.stringify([mesh, ...endpoints]);
      if (edges.has(key)) parent[find(i)] = find(edges.get(key));
      else edges.set(key, i);
    }
  });
  return new Set(faces.map((_, i) => find(i))).size;
}
