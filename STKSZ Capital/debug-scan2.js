const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', 'Pods', 'build', 'DerivedData', '.git', '.gradle', '.idea', '.vscode', 'dist', 'coverage', '.nyc_output', 'temp', 'tmp'];
const SCAN_EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.html', '.json', '.gradle', '.xml', '.xml', '.plist', '.podspec', '.java', '.kt', '.swift', '.m', '.mm', '.h'];
const EXCLUDE_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

function shouldExcludeDir(dirName) { return ['node_modules', 'Pods', 'build', 'DerivedData', '.git', '.gradle', '.idea', '.vscode', 'dist', 'coverage', '.nyc_output', 'temp', 'tmp'].some(ex => dirName === ex); }
function shouldExcludeFile(fileName) { return EXCLUDE_FILES.some(ex => fileName === ex); }
function shouldScanFile(fileName) { if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].some(ex => fileName === ex)) return false; return SCAN_EXTENSIONS.some(ext => fileName.endsWith(ext)); }

function walkDir(dir, fileList = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'Pods', 'build', 'DerivedData', '.git', '.gradle', '.idea', '.vscode', 'dist', 'coverage', '.nyc_output', 'temp', 'tmp'].some(ex => entry.name === ex)) walkDir(fullPath, fileList); }
      else if (entry.isFile()) { if (shouldScanFile(entry.name)) fileList.push(fullPath); }
    } catch (e) {}
  }
  return fileList;
}

function walkDir(dir, fileList = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'Pods', 'build', 'DerivedData', '.git', '.gradle', '.idea', '.vscode', 'dist', 'coverage', '.nyc_output', 'temp', 'tmp'].some(ex => entry.name === ex)) walkDir(fullPath, fileList); }
      else if (entry.isFile()) { if (shouldScanFile(entry.name)) fileList.push(fullPath); }
    } catch (e) {} return fileList;
  }

const SRC = 'C:\\Users\\tokso\\Desktop\\STKSZ CAPITAL\\stksz-github-repo\\STKSZ Capital';
const allFiles = walkDir(SRC, []);
const fixtureFiles = allFiles.filter(f => f.includes('temp-fixture'));
console.log('Fixture files found:', fixtureFiles);