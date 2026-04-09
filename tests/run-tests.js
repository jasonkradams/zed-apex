'use strict';

const Parser = require('tree-sitter');
const { Query } = Parser;
const sfapex = require('tree-sitter-sfapex');
const fs = require('fs');
const path = require('path');

// Parse a test file into code and expected (line, col, scope) triples.
// Annotation lines start with '///' and use:
//   /// <- scope   — the col of '<' in the annotation points to the same col in the code line above
//   /// ^^^^ scope — each '^' points to the same col in the code line above
function parseTestFile(content) {
  const rawLines = content.split('\n');
  const codeLines = [];
  const expectations = [];

  for (const raw of rawLines) {
    if (raw.startsWith('///')) {
      const content = raw.slice(3); // strip '///'
      const match = content.match(/^(\s*)(<-|\^+)\s+(\S+)\s*$/);
      if (!match) continue;

      const leadingSpaces = match[1].length;
      const marker = match[2];
      const scope = match[3];
      const codeLineIndex = codeLines.length - 1;

      if (marker === '<-') {
        expectations.push({ line: codeLineIndex, col: leadingSpaces, scope });
      } else {
        for (let i = 0; i < marker.length; i++) {
          expectations.push({ line: codeLineIndex, col: leadingSpaces + i, scope });
        }
      }
    } else {
      codeLines.push(raw);
    }
  }

  return { code: codeLines.join('\n'), codeLines, expectations };
}

function byteOffset(codeLines, line, col) {
  let offset = 0;
  for (let i = 0; i < line; i++) offset += codeLines[i].length + 1;
  return offset + col;
}

function runSuite(language, highlightSrc, testDir, ext) {
  const parser = new Parser();
  parser.setLanguage(language);
  let query;
  try {
    query = new Query(language, highlightSrc);
  } catch (e) {
    console.error(`ERROR: Failed to compile highlights.scm: ${e.message}`);
    return false;
  }

  const files = fs.readdirSync(testDir)
    .filter(f => f.endsWith(ext))
    .sort();

  if (files.length === 0) {
    console.warn(`  WARNING: No ${ext} test files found in ${testDir}`);
    return true;
  }

  let suiteOk = true;

  for (const file of files) {
    const fullPath = path.join(testDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { code, codeLines, expectations } = parseTestFile(content);

    const tree = parser.parse(code);
    const captures = query.captures(tree.rootNode);

    // Map each byte offset to the set of capture names covering it.
    const capturesByOffset = new Map();
    for (const { name, node } of captures) {
      for (let i = node.startIndex; i < node.endIndex; i++) {
        if (!capturesByOffset.has(i)) capturesByOffset.set(i, new Set());
        capturesByOffset.get(i).add(name);
      }
    }

    let filePassed = 0;
    let fileFailed = 0;

    for (const { line, col, scope } of expectations) {
      const offset = byteOffset(codeLines, line, col);
      const actual = capturesByOffset.get(offset) ?? new Set();

      if (actual.has(scope)) {
        filePassed++;
      } else {
        fileFailed++;
        suiteOk = false;
        const codeLine = codeLines[line] ?? '';
        const pointer = ' '.repeat(col) + '^';
        console.error(`  FAIL  ${file}:${line + 1}:${col}`);
        console.error(`        ${codeLine}`);
        console.error(`        ${pointer}`);
        console.error(`        expected: ${scope}`);
        console.error(`        actual:   ${actual.size ? [...actual].join(', ') : '(no capture)'}`);
      }
    }

    const status = fileFailed === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${file} (${filePassed}/${filePassed + fileFailed})`);
  }

  return suiteOk;
}

const ROOT = path.join(__dirname, '..');

// Validate that all .scm query files compile against their grammars.
// This catches node type renames, structural changes, and other
// grammar incompatibilities that would cause Zed to fail at load time.
function validateQueries() {
  const languages = [
    { name: 'apex', grammar: sfapex.apex },
    { name: 'soql', grammar: sfapex.soql },
    { name: 'sosl', grammar: sfapex.sosl },
  ];

  let allOk = true;
  console.log('\n=== Query Compilation Tests ===');

  for (const { name, grammar } of languages) {
    const langDir = path.join(ROOT, 'languages', name);
    if (!fs.existsSync(langDir)) continue;

    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.scm'));
    for (const file of files) {
      const filePath = path.join(langDir, file);
      const src = fs.readFileSync(filePath, 'utf8');
      try {
        new Query(grammar, src);
        console.log(`  PASS  ${name}/${file}`);
      } catch (e) {
        allOk = false;
        console.error(`  FAIL  ${name}/${file}: ${e.message}`);
      }
    }
  }

  return allOk;
}

let ok = validateQueries();

const soqlHighlights = fs.readFileSync(path.join(ROOT, 'languages/soql/highlights.scm'), 'utf8');
const soslHighlights = fs.readFileSync(path.join(ROOT, 'languages/sosl/highlights.scm'), 'utf8');

console.log('\n=== SOQL Highlight Tests ===');
ok = runSuite(sfapex.soql, soqlHighlights, path.join(__dirname, 'soql'), '.soql') && ok;

console.log('\n=== SOSL Highlight Tests ===');
ok = runSuite(sfapex.sosl, soslHighlights, path.join(__dirname, 'sosl'), '.sosl') && ok;

console.log(ok ? '\nAll tests passed.' : '\nTest failures detected.');
process.exit(ok ? 0 : 1);
