import {spawn} from 'node:child_process';
// One coordinated end-of-implementation validation, never the full test suite.
process.env.MYSQL_TEST_DATABASE ||= 'tripsync_test';
const run=(args)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${args[0]} exited ${code}`)));});
await run(['--test','server/tests/destination-essentials.test.js',...(!process.argv.includes('--resume-essentials')?['server/tests/travel-book.test.js','server/tests/premium-travel-entitlements.test.js']:[])]);
await run(['node_modules/eslint/bin/eslint.js','src/components/trip/PremiumTripFeatures.jsx','--quiet']);
await run(['node_modules/typescript/bin/tsc','-p','jsconfig.json']);
await run(['node_modules/vite/bin/vite.js','build']);
await run(['scripts/check-fast-essentials-browser.mjs']);
