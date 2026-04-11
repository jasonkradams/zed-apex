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

// Validate that injections.scm captures the correct node types and
// associates each with the right injection language label.
//
// For each .cls file in tests/apex/, a header comment declares the
// expected injections in the form:
//   // @inject <nodeType> <language>
//
// The test parses the source with the apex grammar, runs the
// injections.scm query, and checks that every declared injection
// appears in the captures (matched by node type and language label).
function validateInjections() {
  const injectionsPath = path.join(ROOT, 'languages/apex/injections.scm');
  if (!fs.existsSync(injectionsPath)) {
    console.error('  FAIL  injections.scm not found');
    return false;
  }

  const injectionsSrc = fs.readFileSync(injectionsPath, 'utf8');
  const parser = new Parser();
  parser.setLanguage(sfapex.apex);

  let query;
  try {
    query = new Query(sfapex.apex, injectionsSrc);
  } catch (e) {
    console.error(`  FAIL  injections.scm failed to compile: ${e.message}`);
    return false;
  }

  const testDir = path.join(__dirname, 'apex');
  if (!fs.existsSync(testDir)) {
    console.warn('  WARNING: No tests/apex/ directory found');
    return true;
  }

  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.cls')).sort();
  if (files.length === 0) {
    console.warn('  WARNING: No .cls test files found in tests/apex/');
    return true;
  }

  let allOk = true;

  for (const file of files) {
    const fullPath = path.join(testDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Parse expected injections from header comments: // @inject <nodeType> <language>
    const expected = [];
    for (const line of content.split('\n')) {
      const m = line.match(/^\/\/\s*@inject\s+(\S+)\s+(\S+)/);
      if (m) expected.push({ nodeType: m[1], language: m[2] });
    }

    if (expected.length === 0) {
      console.warn(`  WARNING: ${file} has no // @inject declarations`);
      continue;
    }

    const tree = parser.parse(content);
    const matches = query.matches(tree.rootNode);

    // Collect (nodeType, language) pairs from all injection.content captures.
    // node-tree-sitter exposes #set! properties as match.setProperties.
    const actual = [];
    for (const match of matches) {
      const contentCapture = match.captures.find(c => c.name === 'injection.content');
      if (!contentCapture) continue;

      const nodeType = contentCapture.node.type;
      const language = (match.setProperties && match.setProperties['injection.language']) || null;

      actual.push({ nodeType, language });
    }

    let filePassed = 0;
    let fileFailed = 0;

    for (const exp of expected) {
      const found = actual.some(a => a.nodeType === exp.nodeType && a.language === exp.language);
      if (found) {
        filePassed++;
      } else {
        fileFailed++;
        allOk = false;
        console.error(`  FAIL  ${file}: expected injection { nodeType: '${exp.nodeType}', language: '${exp.language}' }`);
        if (actual.length > 0) {
          console.error(`        actual injections: ${JSON.stringify(actual)}`);
        } else {
          console.error('        actual injections: (none)');
        }
      }
    }

    const status = fileFailed === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${file} (${filePassed}/${filePassed + fileFailed})`);
  }

  return allOk;
}

// Validate snippet JSON files referenced in extension.toml.
//
// Checks:
//   - JSON parses successfully
//   - Every snippet has a string `prefix` and a string-array `body`
//   - All prefixes are unique across the file
//   - Tab stop $0 (final cursor) is present in the body
//   - Tab stop numbering has no gaps (e.g. $1, $3 without $2)
//   - Placeholder/choice syntax is well-formed:
//       ${N:default}, ${N|a,b,c|}, plain $N
function validateSnippets() {
  const tomlPath = path.join(ROOT, 'extension.toml');
  if (!fs.existsSync(tomlPath)) {
    console.warn('  WARNING: extension.toml not found, skipping snippet validation');
    return true;
  }

  const toml = fs.readFileSync(tomlPath, 'utf8');
  const snippetPaths = [];
  const snippetMatch = toml.match(/^snippets\s*=\s*\[([^\]]*)\]/m);
  if (!snippetMatch) {
    console.log('  SKIP  No snippets field in extension.toml');
    return true;
  }

  // Extract quoted paths from the TOML array
  const pathPattern = /"([^"]+)"/g;
  let m;
  while ((m = pathPattern.exec(snippetMatch[1])) !== null) {
    snippetPaths.push(m[1]);
  }

  if (snippetPaths.length === 0) {
    console.log('  SKIP  snippets array is empty');
    return true;
  }

  let allOk = true;

  for (const relPath of snippetPaths) {
    const absPath = path.join(ROOT, relPath.replace(/^\.\//, ''));
    const label = relPath.replace(/^\.\//, '');

    if (!fs.existsSync(absPath)) {
      console.error(`  FAIL  ${label}: file not found`);
      allOk = false;
      continue;
    }

    // Parse JSON
    let snippets;
    try {
      snippets = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    } catch (e) {
      console.error(`  FAIL  ${label}: invalid JSON — ${e.message}`);
      allOk = false;
      continue;
    }

    const entries = Object.entries(snippets);
    const prefixSeen = new Map(); // prefix -> snippet name
    let fileOk = true;
    let checked = 0;

    for (const [name, snippet] of entries) {
      checked++;
      const errors = [];

      // Required fields
      if (typeof snippet.prefix !== 'string' || snippet.prefix.length === 0) {
        errors.push('prefix must be a non-empty string');
      }

      if (!Array.isArray(snippet.body) || snippet.body.length === 0) {
        errors.push('body must be a non-empty array');
      } else if (!snippet.body.every(line => typeof line === 'string')) {
        errors.push('body array must contain only strings');
      }

      // Unique prefix
      if (typeof snippet.prefix === 'string') {
        if (prefixSeen.has(snippet.prefix)) {
          errors.push(`duplicate prefix "${snippet.prefix}" (also used by "${prefixSeen.get(snippet.prefix)}")`);
        }
        prefixSeen.set(snippet.prefix, name);
      }

      // Body analysis
      if (Array.isArray(snippet.body) && snippet.body.every(l => typeof l === 'string')) {
        const joined = snippet.body.join('\n');

        // Check for $0 final cursor on multi-line snippets where
        // the final position is ambiguous. Single-line snippets
        // implicitly end at the last tab stop.
        const isMultiLine = snippet.body.length > 1;
        if (isMultiLine && !/\$0(?!\d)/.test(joined) && !/\$\{0[}:]/.test(joined)) {
          errors.push('missing $0 (final cursor position) in multi-line snippet');
        }

        // Collect all tab stop numbers
        const tabStops = new Set();
        // Match $N, ${N:...}, ${N|...|} patterns
        const tabStopPattern = /\$(\d+)|\$\{(\d+)[:|]/g;
        let tsMatch;
        while ((tsMatch = tabStopPattern.exec(joined)) !== null) {
          tabStops.add(parseInt(tsMatch[1] ?? tsMatch[2], 10));
        }

        // Check for gaps (excluding 0)
        if (tabStops.size > 1) {
          const numbered = [...tabStops].filter(n => n > 0).sort((a, b) => a - b);
          for (let i = 0; i < numbered.length; i++) {
            if (numbered[i] !== i + 1) {
              errors.push(`tab stop gap: have ${numbered.join(',')} but missing $${i + 1}`);
              break;
            }
          }
        }

        // Validate placeholder/choice syntax — look for unclosed ${ patterns
        const openBraces = (joined.match(/\$\{/g) || []).length;
        const closeBraces = (joined.match(/\}/g) || []).length;
        // Braces in code (like class bodies) are also counted, so only flag if opens exceed closes
        if (openBraces > closeBraces) {
          errors.push(`unclosed placeholder: ${openBraces} \${ but only ${closeBraces} }`);
        }
      }

      if (errors.length > 0) {
        fileOk = false;
        allOk = false;
        for (const err of errors) {
          console.error(`  FAIL  ${label} → "${name}": ${err}`);
        }
      }
    }

    const status = fileOk ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${label} (${checked} snippets)`);
  }

  return allOk;
}

let ok = validateQueries();

const apexHighlights = fs.readFileSync(path.join(ROOT, 'languages/apex/highlights.scm'), 'utf8');
const soqlHighlights = fs.readFileSync(path.join(ROOT, 'languages/soql/highlights.scm'), 'utf8');
const soslHighlights = fs.readFileSync(path.join(ROOT, 'languages/sosl/highlights.scm'), 'utf8');

console.log('\n=== Apex Highlight Tests ===');
ok = runSuite(sfapex.apex, apexHighlights, path.join(__dirname, 'apex'), '.cls') && ok;

console.log('\n=== SOQL Highlight Tests ===');
ok = runSuite(sfapex.soql, soqlHighlights, path.join(__dirname, 'soql'), '.soql') && ok;

console.log('\n=== SOSL Highlight Tests ===');
ok = runSuite(sfapex.sosl, soslHighlights, path.join(__dirname, 'sosl'), '.sosl') && ok;

console.log('\n=== Apex Injection Tests ===');
ok = validateInjections() && ok;

console.log('\n=== Snippet Validation ===');
ok = validateSnippets() && ok;

console.log(ok ? '\nAll tests passed.' : '\nTest failures detected.');
process.exit(ok ? 0 : 1);
