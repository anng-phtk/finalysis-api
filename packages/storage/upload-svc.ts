import * as fs from 'fs/promises';
import * as path from 'path';
import Constants from '../runtime-svc/constants.js';

export const LOCAL_DMP_PATH = Constants.LOCAL_DMP_PATH;

export async function uploadToDrive(fileName: string, markdownContent: string) {
    const targetPath = path.join(LOCAL_DMP_PATH, fileName);

    try {
        // Ensure the directory exists (optional, but safe)
        await fs.mkdir(LOCAL_DMP_PATH, { recursive: true });

        // Write the markdown content directly to the G: drive
        await fs.writeFile(targetPath, markdownContent, 'utf-8');

        console.log(`Success! File saved locally to: ${targetPath}`);
        // Return the local path as the "ID" for tracking
        return targetPath;
    } catch (error) {
        console.error("Local Drive copy failed:", error);
        // Fallback or rethrow
        throw error;
    }
}