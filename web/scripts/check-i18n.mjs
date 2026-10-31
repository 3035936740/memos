import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSync } from "@babel/core";

const root = new URL("../src/", import.meta.url);
const codes = JSON.parse(readFileSync(new URL("locale-codes.json", root), "utf8"));

function flatten(value, prefix = "", result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result[name] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, name, result);
    else throw new Error(`Invalid translation value: ${name}`);
  }
  return result;
}

function catalog(code) {
  return Object.assign(
    {},
    ...["locales", "locales-custom"].map((directory) => {
      const file = new URL(`${directory}/${code}.json`, root);
      try {
        return flatten(JSON.parse(readFileSync(file, "utf8")));
      } catch (error) {
        throw new Error(`Cannot read ${fileURLToPath(file)}: ${error.message}`, { cause: error });
      }
    }),
  );
}

const placeholders = (text) => (text.match(/{{[^{}]+}}/g) ?? []).sort().join("|");
const reference = catalog("en");
const errors = [];
const questionBanks = new Map();
for (const code of codes) {
  try {
    const source = readFileSync(new URL(`utils/daily-questions/${code}.ts`, root), "utf8");
    const parsed = parseSync(source, { configFile: false, babelrc: false, parserOpts: { sourceType: "module", plugins: ["typescript"] } });
    const declaration = parsed.program.body
      .filter((node) => node.type === "VariableDeclaration")
      .flatMap((node) => node.declarations)
      .find((node) => node.id.type === "Identifier" && node.id.name === "questions");
    if (declaration?.init?.type !== "ArrayExpression") throw new Error("expected a static question array");
    const bank = declaration.init.elements.map((element) => {
      if (element?.type !== "StringLiteral") throw new Error("questions must be string literals");
      return element.value;
    });
    if (!Array.isArray(bank) || bank.length !== 365) throw new Error("expected exactly 365 questions");
    if (bank.some((question) => typeof question !== "string" || !question.trim() || [...question].length > 200)) {
      throw new Error("questions must be nonempty strings of at most 200 Unicode characters");
    }
    if (new Set(bank).size !== 365) throw new Error("duplicate questions");
    if (bank.some((question) => /__(?:DQ\d+|9\d{5})__/i.test(question))) throw new Error("untranslated question markers");
    questionBanks.set(code, bank);
  } catch (error) {
    errors.push(`${code}: invalid daily question bank: ${error.message}`);
  }
}
const englishQuestions = questionBanks.get("en");
for (const [code, bank] of questionBanks) {
  if (code !== "en" && code !== "en-GB" && englishQuestions && bank.every((text, index) => text === englishQuestions[index])) {
    errors.push(`${code}: daily question bank is an untranslated English copy`);
  }
}
for (const code of codes) {
  const translations = catalog(code);
  for (const [key, source] of Object.entries(reference)) {
    if (!(key in translations)) errors.push(`${code}: missing ${key}`);
    else if (source && !translations[key].trim()) errors.push(`${code}: empty ${key}`);
    else if (placeholders(source) !== placeholders(translations[key])) errors.push(`${code}: interpolation mismatch in ${key}`);
    else if (/__(?:MEMOS_VAR_\d+|9\d{5})__/.test(translations[key])) errors.push(`${code}: untranslated marker in ${key}`);
  }
  for (const key of Object.keys(reference).filter((key) => key.endsWith("_other"))) {
    const base = key.slice(0, -"_other".length);
    for (const category of new Intl.PluralRules(code).resolvedOptions().pluralCategories) {
      if (!(`${base}_${category}` in translations)) errors.push(`${code}: missing plural ${base}_${category}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${codes.length} languages, ${Object.keys(reference).length} reference keys and ${questionBanks.size} × 365 daily questions: no missing translations or structural errors.`,
  );
}
