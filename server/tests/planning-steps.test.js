import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANNING_STEP_COUNT, fromSavedPlanningStep, toSavedPlanningStep, planningStepFromSearch } from '../../src/lib/planning-steps.js';
test('five UI steps preserve legacy persisted indices and versioned URLs',()=>{
 assert.equal(PLANNING_STEP_COUNT,5);
 assert.deepEqual([0,1,2,3,4,5].map(fromSavedPlanningStep),[0,1,2,3,3,4]);
 for(let step=0;step<5;step++){
  assert.equal(fromSavedPlanningStep(toSavedPlanningStep(step)),step);
  assert.equal(planningStepFromSearch(new URLSearchParams(`step=${step}&steps=5`)),step);
 }
 assert.equal(planningStepFromSearch(new URLSearchParams('step=4')),3);
 assert.equal(planningStepFromSearch(new URLSearchParams('step=5')),4);
 assert.equal(planningStepFromSearch(new URLSearchParams(),5),4);
 assert.equal(planningStepFromSearch(new URLSearchParams('step=invalid'),4),3);
});
test('all six locales contain the new planner copy',()=>{
 for(const locale of ['en','ro','ru','de','fr','es']){
  const catalog=JSON.parse(fs.readFileSync(`src/i18n/locales/${locale}.json`,'utf8'));
  for(const key of ['places','placesDescription','mustSee','mustSeeDescription','aiSuggestions','aiDescription','ofFive']) assert.ok(catalog['planner.'+key],locale+': '+key);
 }
});
