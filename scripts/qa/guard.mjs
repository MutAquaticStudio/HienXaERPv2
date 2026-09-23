import { guard } from './core.mjs';
console.log(JSON.stringify({ status: 'PASS', ...guard() }));
