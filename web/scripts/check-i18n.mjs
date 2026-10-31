import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    `Checked ${codes.length} languages and ${Object.keys(reference).length} reference keys: no missing translations or interpolation errors.`,
  );
}
