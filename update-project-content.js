#!/usr/bin/env node
/**
 * update-project-content.js
 *
 * Portable “one script per Docusaurus project”.
 * - Edit VAULT_PROJECT_ROOT below for each project.
 * - Assumes your vault subset has:
 *     <VAULT_PROJECT_ROOT>/docs
 *     <VAULT_PROJECT_ROOT>/attachments      (optional; copied to /static/attachments)
 *
 * What it does:
 *   1) Clears and copies docs → <project>/docs (recursive)
 *   2) Clears and copies attachments → <project>/static/attachments (if present)
 *   3) Rewrites only RELATIVE links to attachments in markdown to site-absolute: /attachments/...
 *      (Preserves YAML frontmatter verbatim, including comments.)
 *   4) Optionally runs `npm run build` if RUN_BUILD = true
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ------------------ EDIT THIS PER PROJECT ------------------
// Default fallback (edit this once per project)
const DEFAULT_VAULT_PROJECT_ROOT = '/Users/chrisstevens/Documents/cicely_ak/house-construction';

// Allow ENV to override; falls back to default
const VAULT_PROJECT_ROOT = path.resolve(
  process.env.VAULT_PROJECT_ROOT || DEFAULT_VAULT_PROJECT_ROOT
);

const RUN_BUILD = false; // set true if you want the script to run `npm run build` at the end
// -----------------------------------------------------------

// Derived paths (don’t change)
const PROJECT_ROOT = process.cwd();
const SRC_DOCS = path.join(VAULT_PROJECT_ROOT, 'docs');
const SRC_ATTACH = path.join(VAULT_PROJECT_ROOT, 'attachments');

const DST_DOCS = path.join(PROJECT_ROOT, 'docs');
const DST_ATTACH = path.join(PROJECT_ROOT, 'static', 'attachments');

// Utilities
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function cleanDir(dir) {
  if (exists(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!exists(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function listMarkdownFiles(dir, out = []) {
  if (!exists(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) listMarkdownFiles(p, out);
    else if (name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

// Split YAML frontmatter if present, preserving it verbatim
function splitFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { fm: '', body: text };
  }
  // Find closing '---' on its own line
  const re = /\n---\s*\r?\n/;
  const start = 0; // after first '---\n'
  // Find first line after initial '---\n'
  const afterOpen = text.indexOf('\n', 4) + 1;
  const m = re.exec(text.slice(afterOpen));
  if (!m) return { fm: '', body: text }; // malformed; treat as body
  const fmEndIdx = afterOpen + m.index + m[0].length;
  const fm = text.slice(0, fmEndIdx);
  const body = text.slice(fmEndIdx);
  return { fm, body };
}

// Rewrite only relative attachment links to site-absolute /attachments/...
// - Matches: (attachments/...), (./attachments/...), (../attachments/...), with optional "title" part
// - Skips: http(s)://..., and already-absolute /attachments/...
function rewriteAttachmentLinks(body) {
  // 1) With optional link title: ](attachments/file.jpg "title")
  const reWithTitle = /\]\(((?!https?:\/\/)(?!\/attachments\/)(?:\.{1,2}\/)*attachments\/([^\s)]+))(\s+"[^"]*")\)/gi;
  body = body.replace(reWithTitle, '](/attachments/$1$2)');

  // 2) Without title: ](attachments/file.jpg)
  const reNoTitle = /\]\(((?!https?:\/\/)(?!\/attachments\/)(?:\.{1,2}\/)*attachments\/([^\s)]+))\)/gi;
  body = body.replace(reNoTitle, '](/attachments/$1)');

  return body;
}

// --- Checks ---
if (!exists(SRC_DOCS)) {
  console.error(`❌ Source docs not found: ${SRC_DOCS}`);
  process.exit(1);
}

// --- Step 1: Copy docs ---
console.log('📁 Syncing docs...');
cleanDir(DST_DOCS);
copyRecursive(SRC_DOCS, DST_DOCS);

// --- Step 2: Copy attachments (if any) ---
console.log('📎 Syncing attachments...');
cleanDir(DST_ATTACH);
if (exists(SRC_ATTACH)) {
  copyRecursive(SRC_ATTACH, DST_ATTACH);
} else {
  console.log('ℹ️  No attachments source folder found; created empty /static/attachments.');
}

// --- Step 3: Rewrite attachment links inside copied docs ---
console.log('✏️ Rewriting relative attachment links → /attachments/...');
const mdFiles = listMarkdownFiles(DST_DOCS);
let changedCount = 0;
for (const filePath of mdFiles) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { fm, body } = splitFrontmatter(raw);
  const updatedBody = rewriteAttachmentLinks(body);
  if (updatedBody !== body) {
    fs.writeFileSync(filePath, fm + updatedBody, 'utf8');
    changedCount++;
  }
}
console.log(`✅ Link rewrite complete. Files changed: ${changedCount}`);

// --- Step 4: Optional build ---
if (RUN_BUILD) {
  console.log('\n🛠️  Running `npm run build`...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build completed.');
  } catch (e) {
    console.error('❌ Build failed.');
    process.exit(1);
  }
} else {
  console.log('\nℹ️  Skipping build (RUN_BUILD=false). You can run `npm run start` or `npm run build` yourself.');
}

console.log('\n🎉 Done.');
