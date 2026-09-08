// usage: node scripts/ctx.js <file> "<needle>" [maxhits] [pad]
const fs = require('fs');
const file = process.argv[2];
const needle = process.argv[3];
const max = parseInt(process.argv[4] || '12', 10);
const pad = parseInt(process.argv[5] || '110', 10);
const c = fs.readFileSync(file, 'utf8');
let p = 0, n = 0;
while ((p = c.indexOf(needle, p)) >= 0 && n < max) {
  const start = Math.max(0, p - pad);
  const len = Math.min(pad * 2, c.length - start);
  console.log('+' + p + ': ' + c.substring(start, start + len).replace(/\s+/g, ' '));
  console.log('----');
  p += needle.length; n++;
}
if (n === 0) console.log('(no hits)');