---
name: update-wasm
description: >
  Updates tree-sitter WASM grammar versions in wasm-versions.json and syncs
  the language map in src/treesitter/languageGrammars.ts. Use this skill when
  asked to update WASM grammars, add a new language grammar, or sync the
  language grammar map.
---

## Purpose

This skill manages tree-sitter WASM grammar dependencies for the VSCodeVim extension.
It covers two scenarios:

1. **Add a new language** – the user explicitly names a language to add.
2. **Update existing languages** – no specific language is named; refresh all versions.

After either operation, the skill syncs `src/treesitter/languageGrammars.ts` to match
`wasm-versions.json`.

---

## Rules

- **Only use repositories from the `tree-sitter` GitHub organisation**
  (`https://github.com/tree-sitter`). Never add a grammar from any other org or fork.
- Versions must be the **latest published GitHub Release tag** for the repository.
- Do **not** guess version strings. Always query the GitHub API for the real latest release.

---

## File Locations

| File                                 | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| `wasm-versions.json`                 | Source of truth for wasm file → repo + version |
| `src/treesitter/languageGrammars.ts` | Maps VS Code language IDs to wasm file names   |

---

## Step-by-Step Instructions

### Step 1 – Determine the scenario

- If the user **named a specific language** (e.g. "add C++ support", "add ruby"), proceed
  to **Scenario A**.
- Otherwise, proceed to **Scenario B**.

---

### Scenario A – Add a new language

1. **Identify the canonical `tree-sitter` org repository.**
   - Search GitHub for a repository matching `tree-sitter/tree-sitter-<language>` using:
     ```
     gh repo view tree-sitter/tree-sitter-<language>
     ```
   - If the repository **cannot be found**, ask the user:
     > "I could not find a repository for this language under the tree-sitter organisation.
     > Could you provide the exact repository name (e.g. `tree-sitter/tree-sitter-ruby`)?"
   - If the user-supplied or found repo is **not** under the `tree-sitter` organisation, stop
     and inform the user — only repos in `https://github.com/tree-sitter` are allowed.

2. **Get the latest release tag:**

   ```
   gh release list --repo tree-sitter/<repo-name> --limit 1 --json tagName --jq '.[0].tagName'
   ```

   If there are no published releases, tell the user and stop.

3. **Determine the WASM file name(s).**
   Most languages produce a single file: `tree-sitter-<language>.wasm`.
   Some repos produce multiple wasm files (e.g. the `tree-sitter-typescript` repo produces
   both `tree-sitter-typescript.wasm` and `tree-sitter-tsx.wasm`).
   If you are unsure how many wasm files the repo produces, ask the user:

   > "Does this repository produce more than one wasm file? If so, please list them
   > (e.g. `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`)."

4. **Add the entry (or entries) to `wasm-versions.json`:**

   ```json
   "tree-sitter-<language>.wasm": {
     "repo": "tree-sitter/tree-sitter-<language>",
     "version": "<latest-tag>"
   }
   ```

   Preserve the existing JSON structure and formatting (2-space indent, no trailing comma
   before `}`).

5. **Determine the VS Code language identifier(s)** for the new grammar.
   - A VS Code language identifier is the string VS Code uses internally to identify a
     language (e.g. `typescript`, `python`, `shellscript`, `csharp`). The full canonical list
     is published at:
     https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
   - Look up the identifier for the language in that list.
   - If the language is not on that list, or if there is any ambiguity (e.g. multiple
     possible identifiers), ask the user:
     > "What is the VS Code language identifier for this language?
     > You can find the full list at https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
     > (e.g. `shellscript` for Bash, `csharp` for C#, `cpp` for C++)"
   - Add the new entry (or entries) to `LANGUAGE_GRAMMAR_MAP` in
     `src/treesitter/languageGrammars.ts`.

---

### Scenario B – Update all existing languages

For each entry in `wasm-versions.json`:

1. **Read the `repo` field.**
2. **Fetch the latest release tag:**
   ```
   gh release list --repo <repo> --limit 1 --json tagName --jq '.[0].tagName'
   ```
3. **Update the `version` field** if the latest tag differs from the current value.
4. If multiple wasm files share the same repo (e.g. `tree-sitter-typescript.wasm` and
   `tree-sitter-tsx.wasm` both use `tree-sitter/tree-sitter-typescript`), update **all** of
   them to the same latest version. Fetch the repo's release only once.
5. Write the updated `wasm-versions.json` back, preserving formatting.

---

### Step 2 – Sync `src/treesitter/languageGrammars.ts`

After `wasm-versions.json` is updated, ensure every wasm file in it has at least one
corresponding entry in `LANGUAGE_GRAMMAR_MAP` in `src/treesitter/languageGrammars.ts`.

**Process:**

1. Read both files.
2. Collect all `.wasm` file names from `wasm-versions.json`.
3. Collect all `.wasm` values currently in `LANGUAGE_GRAMMAR_MAP`.
4. For any wasm file that is **missing** from `LANGUAGE_GRAMMAR_MAP`, look up the correct
   VS Code language identifier at:
   https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
   If the language is not listed there, or if there is ambiguity, ask the user before adding:
   > "The wasm file `tree-sitter-<language>.wasm` is not yet in the language map.
   > What VS Code language identifier should map to it?
   > See https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
   > (e.g. `ruby`, `shellscript`, `csharp`)"
5. Do **not** remove existing entries — only add missing ones.
6. Preserve the existing file comment and `Readonly<Record<string, string>>` type.

---

## Output Summary

After completing all changes, report:

- Which languages were **added** (Scenario A) or **updated** (Scenario B), with old → new version.
- Which entries were **added** to `LANGUAGE_GRAMMAR_MAP`, if any.
- Any language where the version was **already up to date** (no change needed).
