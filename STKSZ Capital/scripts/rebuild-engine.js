const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'orig-engine.js');
const OUT = path.join(__dirname, '..', 'www', 'stksz-ai-engine.rebuilt.js');

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/);

function slice(from1, to1) {
  if (to1 == null) return lines.slice(from1 - 1);
  return lines.slice(from1 - 1, to1);
}

if (lines[221].indexOf('const AnalysisTools = ') === -1) throw new Error('L222 anchor mismatch: ' + JSON.stringify(lines[221]));
if (lines[1138].trim() !== '};') throw new Error('L1139 anchor mismatch');

const open = lines[221];

const partA = slice(223, 337);
const cmpHead = slice(340, 356);
const analysisMethods = slice(820, 1024);
const accountComment = slice(358, 358);
const accountClass = slice(359, 371);
const acctEngineHead = slice(373, 818);
const writeBlock = slice(1027, 1089);
const adminBlock = slice(1091, 1139);
const tail = slice(1140, null);
const fill = lines[338]; // line 339 comment

if (fill.indexOf('Performance Attribution') === -1) throw new Error('L339 comment mismatch');

const cmpClose = [
  '          }',
  '        });',
  '      }',
  '      return {',
  '        portfolioReturn,',
  '        benchmarks: results',
  '      };',
  '    },',
  '',
].join('\r\n');

const tailWithExport = [];
for (const ln of tail) {
  tailWithExport.push(ln);
  if (/global\.STKSZAIEngine\s*=\s*engine;/.test(ln)) {
    tailWithExport.push('  global.STKSZAccountEngine = STKSZAccountEngine;');
    tailWithExport.push('  if (typeof module !== "undefined" && module.exports) module.exports = engine;');
  }
}

const rebuilt = [
  ...lines.slice(0, 221),
  open,
  '',
  ...partA,
  '',
  fill,
  ...cmpHead,
  cmpClose,
  ...analysisMethods,
  '  };',
  '',
  ...accountComment,
  ...accountClass,
  '',
  ...acctEngineHead,
  '};',
  '',
  ...writeBlock,
  '',
  ...adminBlock,
  '',
  ...tailWithExport,
].join('\r\n');

let outText = rebuilt;

// Re-apply the 5 token-level fixes (these live in the untouched tail region).
const fixes = [
  ['(F/K|PD/DD|', '(F\\/K|PD\\/DD|'],
  ['_technicalAnalysis(question, question, context)', '_technicalAnalysis(question, context)'],
  ["gap'leri", "gap\\'leri"],
  ["Son IPO'lar", "Son IPO\\'lar"],
  ['{ re /', '{ re: /'],
];
for (const [from, to] of fixes) {
  if (!outText.includes(from)) {
    console.log('WARN fix source not found:', JSON.stringify(from));
    continue;
  }
  outText = outText.split(from).join(to);
}

fs.writeFileSync(OUT, outText, 'utf8');
console.log('WROTE', OUT, 'bytes:', Buffer.byteLength(outText, 'utf8'));