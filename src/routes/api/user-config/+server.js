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
    
    if (!fs.existsSync(configPath)) {
      return json({ success: false, error: 'Config file not found' }, { status: 404 });
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configContent);
    
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
