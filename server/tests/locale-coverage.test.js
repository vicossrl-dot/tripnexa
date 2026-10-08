import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCatalogs,inspectSource,supportedLocales,coverageReport} from '../../scripts/locale-coverage.mjs';
test('locale coverage fails on missing keys, locales, empty values, unknown call keys and placeholders',()=>{
 const catalog=Object.fromEntries(supportedLocales.map(locale=>[locale,{hello:'Hello {{name}}'}]));
 assert.deepEqual(checkCatalogs(catalog,['hello'],{}),[]);
 delete catalog.ru.hello;assert(checkCatalogs(catalog,['hello'],{}).includes('ru: missing/empty hello'));
 catalog.ru.hello='';assert(checkCatalogs(catalog,['hello'],{}).includes('ru: missing/empty hello'));
 catalog.ru.hello='Привет';assert(checkCatalogs(catalog,['hello'],{}).includes('ru: interpolation hello'));
 assert(checkCatalogs(catalog,['unknown'],{}).includes('Unknown required key: unknown'));
  assert(checkCatalogs(catalog,['hello'],{en:{shared:'Hello'},ro:{}}).some(error=>error==='ru: missing shared shared'));
  assert(checkCatalogs(catalog,['hello'],{en:{hello:'{{field}} is required.'}}).includes('Conflicting UI/server key: hello'));
});
test('locale coverage identifies rendered English while preserving internal identifiers',()=>{
 const {required,copy}=inspectSource(`const step_type='transfer'; const route_mode='transit'; export const View=()=> <div aria-label="Open map">Hello traveler {t(ok?'existing':'missing')}<button>{'Save changes'}</button></div>;`,'fixture.jsx');
 assert.deepEqual(required,['existing','missing']);
 assert(copy.some(entry=>entry.text==='Hello traveler'));
 assert(copy.some(entry=>entry.text==='Open map'));
 assert(copy.some(entry=>entry.text==='Save changes'));
 assert(!copy.some(entry=>entry.text==='transfer'||entry.text==='transit'));
});
test('locale coverage rejects translated internal values and authority lookups',()=>{
 const report=inspectSource(`const authority=country.authorities?.[section.key==='entryDocuments'?t('entry'):t('emergency')]; const body={step_type:t('visit'),route_mode:translateText('transit')};`,'fixture.jsx');
 assert.equal(report.contractViolations.length,3);
 assert.deepEqual(inspectSource(`const authority=country.authorities?.[section.key==='entryDocuments'?'entry':'emergency']; const body={step_type:'visit',route_mode:'transit'};`,'fixture.jsx').contractViolations,[]);
});
test('application-required locale keys and internal identifier guards pass in the current source tree',()=>{
 const report=coverageReport();assert.equal(report.locales.length,6);assert(report.requiredKeys>1000);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.contractViolations,[]);
});
