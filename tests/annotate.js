'use strict';
// Usage: node tests/annotate.js soql "SELECT Id FROM Account"
//        node tests/annotate.js sosl "FIND {test} RETURNING Account"

const Parser = require('tree-sitter');
const { Query } = Parser;
const sfapex = require('tree-sitter-sfapex');
const fs = require('fs');
const path = require('path');

const [,, lang, code] = process.argv;
if (!lang || !code) {
  console.error('Usage: node annotate.js <soql|sosl> "<source code>"');
  process.exit(1);
}

const scopeMap = {
  'variable.readonly.defaultLibrary': 'constant.builtin',
  'variable.readonly': 'string.special',
  'enumMember': 'constant',
  'comment.line': 'comment',
};

const language = sfapex[lang];
// Use our Zed highlights if they exist, otherwise fall back to the upstream queries.
// During initial development, run annotate.js after writing highlights.scm.
const zedHighlightsPath = path.join(__dirname, '..', 'languages', lang, 'highlights.scm');
const upstreamPath = path.join(
  __dirname, '..', 'node_modules', 'tree-sitter-sfapex', lang, 'queries', 'highlights.scm'
);
const highlightsPath = fs.existsSync(zedHighlightsPath) ? zedHighlightsPath : upstreamPath;
const highlightSrc = fs.readFileSync(highlightsPath, 'utf8');

const parser = new Parser();
parser.setLanguage(language);
const tree = parser.parse(code);
const query = new Query(language, highlightSrc);
const captures = query.captures(tree.rootNode);

console.log(code);
for (const { name, node } of captures) {
  const scope = scopeMap[name] || name;
  const col = node.startPosition.column;
  const len = node.endPosition.column - col;
  if (col === 0) {
    console.log(`/// <- ${scope}`);
  } else {
    const carets = len === 1 ? '<-' : '^'.repeat(len);
    console.log(`///${' '.repeat(col)}${carets} ${scope}`);
  }
}
