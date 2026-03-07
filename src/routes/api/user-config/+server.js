import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  try {
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return json({ success: false, error: 'Missing userId parameter' }, { status: 400 });
    }

    // Read the user-bots-config.json file
    const configPath = path.join(process.cwd(), 'src', 'bots', 'user-bots-config.json');
    let parsed;

    if (!fs.existsSync(configPath)) {
      // Return defaults if file not found, instead of 404
      parsed = {
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
        }
      };
    } else {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      parsed = JSON.parse(configContent);
    }


    // Return the config
    return json({
      success: true,
      config: {
        resumeFileName: parsed?.formData?.resumeFileName || '',
        ...parsed?.formData
      }
    });
  } catch (error) {
    console.error('Error reading user config:', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read config' },
      { status: 500 }
    );
  }
}
