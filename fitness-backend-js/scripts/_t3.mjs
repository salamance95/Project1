const crud = await import('../src/persistence/crud.js');
const lib = crud.loadLibrary();
console.log('library:', lib.items.length, '| 예:', lib.items[0].name, lib.items[0].equipment, JSON.stringify(lib.items[0].risk));

const profile = crud.activeProfile(11);
if (profile) {
  const user = crud.getUser(profile.userId);
  console.log('profile payload:', JSON.stringify(crud.profilePayload(profile, user)));
  const plan = crud.activePlan(11);
  if (plan) {
    const dto = crud.planToDto(plan, profile, user);
    console.log('plan:', dto.title, '| week', dto.weekStart);
    const d = dto.schedule.find(x => !x.isRestDay);
    console.log(d.day, d.workout.focus, '|', d.workout.exercises.join(' / '));
    console.log('item0:', JSON.stringify(d.workout.items[0]));
    console.log('weekly:', JSON.stringify(dto.weeklyNutrition));
  }
}
console.log('logs:', crud.weekWorkoutLogs(11, '2026-08-31').length, 'workouts,', crud.weekMealLogs(11, '2026-08-31').length, 'meals');
