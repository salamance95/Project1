const pl = await import('../src/domain/planner.js');
const co = await import('../src/domain/coaching.js');
const nu = await import('../src/domain/nutrition.js');
const sf = await import('../src/domain/safety.js');

const p = {sex:'남성', age:32, height:178, weight:80, frequency:'주 4일', duration:'45분~1시간',
  goal:'근육량 증가', level:'중급', style:'근비대 중심', injuries:['허리'], redFlags:['해당 없음'],
  equipment:['덤벨','바벨/랙','머신/케이블','철봉','유산소 장비']};
const { restrictions } = sf.checkProfile(p);
const base = nu.dailyBaseline(p, restrictions);
const plan = pl.buildPlans(p, null, restrictions)[1];
const [s2, msg] = co.reschedule(plan.schedule, base, '화');
console.log('재배치:', msg);
const [s3, reb] = co.applyEvent(s2, base, {day:'금', type:'회식', cuisine:'고기·구이', alcohol:'3~5잔'});
console.log('rebalance:', JSON.stringify(reb));
console.log('상태:', s3.map(d=>d.day+':'+(d.status??'-')).join(' '));
