const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

// Google's A2UI packages (and the Lit and signals libraries they use) ship as ES modules only, so Jest must
// transform them; next/jest's default skips everything in node_modules.
const ESM_PACKAGES = ["@a2ui", "lit", "@lit", "@lit-labs", "lit-html", "lit-element", "@preact/signals-core", "validate-color"];

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = [
    `/node_modules/(?!(${ESM_PACKAGES.join("|")})/)`,
    "^.+\\.module\\.(css|sass|scss)$",
  ];
  return config;
};
