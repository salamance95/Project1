const ex = await import('../src/domain/experiments.js');
const pr = await import('../src/domain/progression.js');
const rp = await import('../src/domain/reports.js');
const dist = {};
for (let uid = 1; uid <= 500; uid += 1) {
  const v = ex.pickVariant(uid, 'recommendation_order');
  dist[v] = (dist[v] ?? 0) + 1;
}
console.log('500명 배정:', JSON.stringify(dist));
console.log('user1:', ex.pickVariant(1, 'recommendation_order'), '/', ex.pickVariant(1, 'insight_tone'));
console.log('modules:', Object.keys(pr).join(','), '|', Object.keys(rp).join(','));
