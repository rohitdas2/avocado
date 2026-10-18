import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFood} from '../server/nutrition.js';
import {validLift,validEntry} from '../server/validation.js';
test('nutrients use USDA IDs, distinguish zero from missing, and select kcal',()=>{
 const food=normalizeFood({fdcId:1,description:'Avocado',foodNutrients:[{nutrientId:1003,value:0},{nutrientId:1004,value:15.4},{nutrientId:1062,value:700},{nutrientId:2048,value:167}]});
 assert.deepEqual(food,{id:1,name:'Avocado',protein:0,carbs:null,fat:15.4,calories:167});
});
test('lift validation bounds numbers and units',()=>{
 const lift={exercise:'Squat',weight:100,unit:'kg',sets:3,reps:8,date:'2026-10-16'};
 assert.ok(validLift(lift));
 for(const invalid of [{weight:-1},{weight:Infinity},{sets:0},{sets:1.5},{reps:1001},{unit:'oz'},{exercise:' '},{date:'2026-02-30'}]) assert.equal(Boolean(validLift({...lift,...invalid})),false);
});
test('macro values reject invalid numbers and allow unknown',()=>{
 const entry={name:'Food',calories:100,date:'2026-10-16',protein:null,carbs:10,fat:2};
 assert.ok(validEntry(entry));assert.equal(Boolean(validEntry({...entry,protein:-1})),false);assert.equal(Boolean(validEntry({...entry,protein:'5'})),false);
});
