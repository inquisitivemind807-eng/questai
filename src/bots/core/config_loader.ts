import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CONFIG = {
  formData: {
    fullName: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    keywords: "",
    locations: "",
    minSalary: "",
    maxSalary: "",
    jobType: "any",
    experienceLevel: "any",
    industry: "",
    listedDate: "",
    remotePreference: "any",
    rightToWork: "citizen",
    rewriteResume: false,
    excludedCompanies: "",
    excludedKeywords: "",
    skillWeight: "0.4",
    locationWeight: "0.2",
    salaryWeight: "0.3",
    companyWeight: "0.1",
    enableDeepSeek: false,
    deepSeekApiKey: "",
    acceptTerms: false,
    resumeFileName: "",
    botMode: "superbot"
  },
  industries: [],
  workRightOptions: []
};

/**
 * Safely loads the user-bots-config.json file.
 * Returns default configuration if the file does not exist or is invalid.
 */
export function loadUserConfig(): any {
  const configPath = path.join(__dirname, '../user-bots-config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`[ConfigLoader] Error reading config at ${configPath}:`, error);
  }
  
  console.log(`[ConfigLoader] Using default configuration`);
  return DEFAULT_CONFIG;
}
