/**
 * 마스터 데이터 시드. 여러 번 호출해도 안전하다.
 * 테이블 생성은 파이썬 쪽(SQLAlchemy)이 이미 했으므로 여기서는 값만 맞춘다.
 */

import { eq } from "drizzle-orm";

import { db } from "../core/db.js";
import { BODY_PARTS, EQUIPMENT, SEED_EXERCISES } from "../domain/exercises.js";
import { bodyParts, equipment, exerciseRisks, exercises } from "./schema.js";

export function seedMaster() {
  const parts = new Map(db.select().from(bodyParts).all().map((r) => [r.name, r]));
  for (const name of BODY_PARTS) {
    if (!parts.has(name)) {
      parts.set(name, db.insert(bodyParts).values({ name }).returning().get());
    }
  }

  const gear = new Map(db.select().from(equipment).all().map((r) => [r.name, r]));
  for (const name of EQUIPMENT) {
    if (!gear.has(name)) {
      gear.set(name, db.insert(equipment).values({ name }).returning().get());
    }
  }

  const existing = new Map(db.select().from(exercises).all().map((r) => [r.slug, r]));

  for (const item of SEED_EXERCISES) {
    const values = {
      name: item.name,
      pattern: item.pattern,
      muscle: item.muscle,
      equipmentId: gear.get(item.equipment).id,
      load: item.load,
      isHighImpact: item.impact,
      altSlug: item.alt,
    };

    if (!existing.has(item.slug)) {
      existing.set(
        item.slug,
        db.insert(exercises).values({ slug: item.slug, ...values }).returning().get(),
      );
    } else {
      db.update(exercises).set(values).where(eq(exercises.slug, item.slug)).run();
    }
  }

  // 위험 부위 매핑을 시드 기준으로 맞춘다.
  const risks = db.select().from(exerciseRisks).all();
  const byExercise = new Map();
  for (const row of risks) {
    if (!byExercise.has(row.exerciseId)) byExercise.set(row.exerciseId, []);
    byExercise.get(row.exerciseId).push(row);
  }

  for (const item of SEED_EXERCISES) {
    const exercise = existing.get(item.slug);
    const wanted = new Set(item.risk.map((name) => parts.get(name).id));
    const current = byExercise.get(exercise.id) ?? [];

    for (const row of current) {
      if (!wanted.has(row.bodyPartId)) {
        db.delete(exerciseRisks).where(eq(exerciseRisks.id, row.id)).run();
      }
    }

    const currentIds = new Set(current.map((row) => row.bodyPartId));
    for (const bodyPartId of wanted) {
      if (!currentIds.has(bodyPartId)) {
        db.insert(exerciseRisks).values({ exerciseId: exercise.id, bodyPartId }).run();
      }
    }
  }
}
